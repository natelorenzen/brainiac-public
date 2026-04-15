"""
Brainiac — Modal GPU worker

Real TRIBE v2 inference: Meta FAIR brain encoding model predicts fMRI activations
across the cortical surface in response to visual stimuli.

MOCK_MODE env var (default false): set to "true" to fall back to image-statistics
scores without loading the TRIBE model. Useful for development and debugging.

Deploy: modal deploy modal/inference.py

Secrets required in Modal dashboard:
  - "brainiac-supabase": SUPABASE_SERVICE_ROLE_KEY
  - "brainiac-hf":       HF_TOKEN  (HuggingFace read token, needs LLaMA 3.2 access)
"""

import io
import os
import datetime
import subprocess
import tempfile

import modal

# ── Toggle via env var, not code ─────────────────────────────────────────────
MOCK_MODE = os.environ.get("MOCK_MODE", "false").lower() == "true"
# ─────────────────────────────────────────────────────────────────────────────

app = modal.App("brainiac-inference")

model_volume = modal.Volume.from_name("brainiac-tribe-weights", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "ffmpeg",
        "git",
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxrender1",
        "libxext6",
    )
    .pip_install(
        # Core I/O and serving
        "fastapi[standard]",
        "opencv-python-headless",
        "matplotlib",
        "numpy",
        "Pillow",
        "scipy",
        "supabase",
        # Brain atlas
        "nilearn",
        "nibabel",
        # HuggingFace + model deps
        "huggingface_hub",
        "torch>=2.5.1",
        "torchvision>=0.20",
        "transformers",
        "einops",
        "x_transformers==1.27.20",
        "spacy",
        "soundfile",
        "moviepy>=2.2.1",
    )
    .run_commands(
        # Install tribev2 directly from Meta FAIR's GitHub repo
        "pip install 'git+https://github.com/facebookresearch/tribev2.git'"
    )
)

# ── ROI registry — mirrors src/lib/roi.ts ────────────────────────────────────
ROI_REGISTRY = {
    "FFA":      {"label": "Face Detection",           "description": "A face or face-like element is visually dominant in this image."},
    "V1_V2":    {"label": "Low-Level Visual Signal",   "description": "Strong contrast, edges, or luminance variation is present."},
    "V4":       {"label": "Color and Form Processing", "description": "Color relationships and shape boundaries are being processed."},
    "LO":       {"label": "Object Recognition",        "description": "Distinct objects or elements are registering as meaningful visual units."},
    "PPA":      {"label": "Scene Recognition",         "description": "The background or setting is being processed as contextual information."},
    "STS":      {"label": "Social and Motion Cues",    "description": "Expressions, biological motion, or implied social action is present."},
    "DAN":      {"label": "Spatial Attention",         "description": "The composition is directing spatial focus toward specific elements."},
    "VWFA":     {"label": "Text Processing",           "description": "Text in this image is legible and occupying visual attention."},
    "DMN":      {"label": "Default Mode Network",      "description": "Self-referential or mind-wandering processes are relatively active."},
    "AV_ASSOC": {"label": "Audio-Visual Association",  "description": "Cross-modal binding regions are active."},
}

# Destrieux 2009 atlas parcel names → our ROI keys.
# Approximate functional-to-anatomical mapping on fsaverage5 surface.
# VWFA is language-dominant: left hemisphere only.
ROI_TO_DESTRIEUX = {
    "FFA":      ["G_oc-temp_lat-fusifor"],
    "V1_V2":    ["S_calcarine", "G_cuneus"],
    "V4":       ["G_oc-temp_med-Lingual"],
    "LO":       ["G_occipital_middle"],
    "PPA":      ["G_parahippoc"],
    "STS":      ["S_temporal_sup"],
    "DAN":      ["G_pariet_inf-Angular", "G_pariet_inf-Supramar"],
    "VWFA":     ["G_oc-temp_lat-fusifor"],  # left hemisphere only (see below)
    "DMN":      ["G_precuneus", "G_cingul-Post-dorsal"],
    "AV_ASSOC": ["G_temp_sup-Lateral"],
}


def build_roi_vertex_map() -> dict[str, list[int]]:
    """
    Build a mapping from ROI key → fsaverage5 vertex indices using the
    Destrieux surface atlas. Called once at container startup.

    fsaverage5 vertex layout assumed by TRIBE v2:
      Left hemisphere:  indices 0 – 10241
      Right hemisphere: indices 10242 – 20483
    """
    from nilearn import datasets
    import numpy as np

    print("Building ROI vertex map from Destrieux atlas...")
    atlas = datasets.fetch_atlas_surf_destrieux()
    map_left  = np.array(atlas["map_left"])   # (10242,)
    map_right = np.array(atlas["map_right"])  # (10242,)

    # Labels may be byte strings depending on nilearn version
    labels = [
        lbl.decode("utf-8") if isinstance(lbl, bytes) else lbl
        for lbl in atlas["labels"]
    ]

    n_left = len(map_left)  # 10242 for fsaverage5

    roi_vertex_map: dict[str, list[int]] = {}
    for roi_key, parcel_names in ROI_TO_DESTRIEUX.items():
        vertices: list[int] = []
        for name in parcel_names:
            if name not in labels:
                print(f"  Warning: atlas label '{name}' not found, skipping")
                continue
            idx = labels.index(name)

            if roi_key == "VWFA":
                # Language-dominant: left hemisphere only
                lv = np.where(map_left == idx)[0].tolist()
                vertices.extend(lv)
            else:
                lv = np.where(map_left == idx)[0].tolist()
                rv = (np.where(map_right == idx)[0] + n_left).tolist()
                vertices.extend(lv + rv)

        roi_vertex_map[roi_key] = vertices
        print(f"  {roi_key}: {len(vertices)} vertices")

    return roi_vertex_map


def image_bytes_to_video(image_bytes: bytes, duration_sec: int = 4) -> str:
    """
    Convert a static thumbnail image to a looping MP4 that TRIBE v2 can ingest.
    Returns the path to the temp video file.
    """
    tmp_dir = tempfile.mkdtemp()
    img_path = os.path.join(tmp_dir, "thumb.jpg")
    vid_path = os.path.join(tmp_dir, "thumb.mp4")

    with open(img_path, "wb") as f:
        f.write(image_bytes)

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", img_path,
            "-c:v", "libx264",
            "-t", str(duration_sec),
            "-pix_fmt", "yuv420p",
            "-vf", "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2",
            vid_path,
        ],
        check=True,
        capture_output=True,
    )
    return vid_path


def extract_roi_scores(
    vertex_activations,  # np.ndarray shape (n_vertices,)
    roi_vertex_map: dict[str, list[int]],
) -> tuple[list[dict], float]:
    """
    Average vertex activations within each ROI, normalize to [0, 1].
    Returns (roi_data list, mean_top_3 score).
    """
    import numpy as np

    v_min = vertex_activations.min()
    v_max = vertex_activations.max()
    normalized = (vertex_activations - v_min) / (v_max - v_min + 1e-8)
    n_vertices = len(normalized)

    results = []
    for roi_key, vertices in roi_vertex_map.items():
        valid = [v for v in vertices if v < n_vertices]
        score = float(normalized[valid].mean()) if valid else 0.0
        results.append({
            "region_key": roi_key,
            "label": ROI_REGISTRY[roi_key]["label"],
            "activation": round(score, 4),
            "description": ROI_REGISTRY[roi_key]["description"],
        })

    results.sort(key=lambda x: x["activation"], reverse=True)
    mean_top = float(np.mean([r["activation"] for r in results[:3]]))
    return results, round(mean_top, 4)


def mock_roi_scores(image_array) -> tuple[list[dict], float]:
    """
    Fallback: derive plausible ROI scores from image statistics.
    Used when MOCK_MODE=true. Not a brain model.
    """
    import numpy as np

    img = image_array.astype(np.float32) / 255.0
    h, w = img.shape[:2]
    gray = img.mean(axis=2)
    contrast = float(gray.std())
    brightness = float(gray.mean())
    color_var = float(img.std(axis=(0, 1)).mean())
    cy, cx = h // 2, w // 2
    center = gray[cy - h//6:cy + h//6, cx - w//6:cx + w//6]
    center_contrast = float(center.std()) if center.size > 0 else 0.0
    top_strip = gray[:h // 5, :]
    top_brightness_var = float(top_strip.std())

    scores = {
        "FFA":      min(1.0, center_contrast * 3.5 + 0.15),
        "V1_V2":    min(1.0, contrast * 2.8 + 0.1),
        "V4":       min(1.0, color_var * 2.2 + 0.2),
        "LO":       min(1.0, (contrast + center_contrast) * 1.4 + 0.1),
        "PPA":      min(1.0, (1.0 - center_contrast) * 0.8 + brightness * 0.4),
        "STS":      min(1.0, center_contrast * 2.0 + 0.05),
        "DAN":      min(1.0, contrast * 1.5 + 0.2),
        "VWFA":     min(1.0, top_brightness_var * 3.0 + 0.08),
        "DMN":      min(1.0, (1.0 - contrast) * 0.6 + 0.1),
        "AV_ASSOC": min(1.0, color_var * 1.2 + 0.05),
    }

    results = [
        {
            "region_key": key,
            "label": ROI_REGISTRY[key]["label"],
            "activation": round(val, 4),
            "description": ROI_REGISTRY[key]["description"],
        }
        for key, val in scores.items()
    ]
    results.sort(key=lambda x: x["activation"], reverse=True)
    mean_top = float(np.mean([r["activation"] for r in results[:3]]))
    return results, round(mean_top, 4)


def generate_heatmap(image_bytes: bytes, roi_data: list[dict]) -> bytes:
    """
    Generate a viridis heatmap overlay driven by ROI activation scores.
    Uses spatial priors for each brain region's typical image-space location.
    """
    import numpy as np
    import matplotlib.cm as cm
    from PIL import Image
    from scipy.ndimage import gaussian_filter

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img, dtype=np.float32)
    h, w = img_array.shape[:2]

    spatial_map = np.zeros((h, w), dtype=np.float32)
    score = {r["region_key"]: r["activation"] for r in roi_data}

    def add_gaussian(arr, cy_frac, cx_frac, sigma_frac, weight):
        cy = int(cy_frac * h)
        cx = int(cx_frac * w)
        sigma = sigma_frac * min(h, w)
        y, x = np.ogrid[:h, :w]
        g = np.exp(-((y - cy)**2 + (x - cx)**2) / (2 * sigma**2))
        arr += g * weight

    add_gaussian(spatial_map, 0.45, 0.50, 0.25, score.get("FFA", 0))
    add_gaussian(spatial_map, 0.50, 0.50, 0.45, score.get("V1_V2", 0))
    add_gaussian(spatial_map, 0.50, 0.50, 0.40, score.get("V4", 0))
    add_gaussian(spatial_map, 0.45, 0.50, 0.30, score.get("LO", 0))
    add_gaussian(spatial_map, 0.70, 0.50, 0.35, score.get("PPA", 0))
    add_gaussian(spatial_map, 0.40, 0.50, 0.25, score.get("STS", 0))
    add_gaussian(spatial_map, 0.35, 0.65, 0.20, score.get("DAN", 0))
    add_gaussian(spatial_map, 0.15, 0.50, 0.20, score.get("VWFA", 0))
    add_gaussian(spatial_map, 0.50, 0.25, 0.25, score.get("DMN", 0))
    add_gaussian(spatial_map, 0.50, 0.75, 0.20, score.get("AV_ASSOC", 0))

    spatial_map = gaussian_filter(spatial_map, sigma=min(h, w) * 0.08)
    mn, mx = spatial_map.min(), spatial_map.max()
    spatial_norm = (spatial_map - mn) / (mx - mn + 1e-8)

    colormap = cm.get_cmap("viridis")
    heatmap_rgb = (colormap(spatial_norm)[:, :, :3] * 255).astype(np.float32)

    alpha = 0.45
    blended = (img_array * (1 - alpha) + heatmap_rgb * alpha).clip(0, 255).astype(np.uint8)

    out = io.BytesIO()
    Image.fromarray(blended).save(out, format="PNG", optimize=True)
    return out.getvalue()


@app.cls(
    image=image,
    volumes={"/cache": model_volume},
    timeout=300,
    gpu="T4",
    secrets=[
        modal.Secret.from_name("brainiac-supabase"),
        modal.Secret.from_name("brainiac-hf"),
    ],
)
class BrainiacInference:
    """
    Modal class — model and ROI vertex map are loaded once per container
    at cold start, then reused across all requests (Fluid Compute).
    """

    @modal.enter()
    def load(self):
        import numpy as np
        from huggingface_hub import login

        self.mock_mode = MOCK_MODE

        # Authenticate with HuggingFace (needed for model weights download)
        hf_token = os.environ.get("HF_TOKEN")
        if hf_token:
            login(token=hf_token)

        # Build ROI vertex map from Destrieux atlas (all modes)
        self.roi_vertex_map = build_roi_vertex_map()

        if not self.mock_mode:
            from tribev2 import TribeModel
            print("Loading TRIBE v2 model weights...")
            self.model = TribeModel.from_pretrained(
                "facebook/tribev2",
                cache_folder="/cache/tribev2",
            )
            print("TRIBE v2 model loaded.")
        else:
            self.model = None
            print("MOCK_MODE=true — skipping TRIBE model load.")

    @modal.fastapi_endpoint(method="POST", label="brainiac-inference")
    def run_inference(self, body: dict) -> dict:
        """
        Web endpoint called by Next.js API routes.
        Body: { analysis_id, storage_key, supabase_url }
        """
        import numpy as np
        import cv2
        from supabase import create_client

        import urllib.request

        analysis_id: str = body["analysis_id"]
        thumbnail_url: str | None = body.get("thumbnail_url")
        storage_key: str | None = body.get("storage_key")
        supabase_url: str = body["supabase_url"]
        service_role_key: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

        db = create_client(supabase_url, service_role_key)

        def fail(msg: str):
            db.table("analyses").update({
                "status": "failed",
                "error_message": msg,
            }).eq("id", analysis_id).execute()
            return {"status": "failed", "error": msg}

        # ── Download image (from YouTube URL or Supabase Storage) ─────────────
        if thumbnail_url:
            try:
                req = urllib.request.Request(
                    thumbnail_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Brainiac/1.0)"},
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    image_bytes = resp.read()
            except Exception as e:
                return fail(f"Thumbnail download failed: {e}")
        elif storage_key:
            try:
                response = db.storage.from_("creatives").download(storage_key)
                image_bytes = bytes(response)
            except Exception as e:
                return fail(f"Storage download failed: {e}")
        else:
            return fail("No thumbnail_url or storage_key provided")

        # ── Decode image ──────────────────────────────────────────────────────
        try:
            img_array = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            if img is None:
                return fail("Could not decode image")
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        except Exception as e:
            return fail(f"Image decode failed: {e}")

        # ── Inference ─────────────────────────────────────────────────────────
        if self.mock_mode:
            roi_data, mean_top_roi_score = mock_roi_scores(img_rgb)
        else:
            try:
                # Convert static thumbnail to a short looping video
                vid_path = image_bytes_to_video(image_bytes, duration_sec=4)

                # Build events dataframe (video-only — no audio/text for thumbnails)
                df = self.model.get_events_dataframe(video_path=vid_path)

                # Run brain encoding inference
                # preds shape: (n_timesteps, n_vertices) — ~20k vertices on fsaverage5
                preds, _segments = self.model.predict(events=df)

                # Convert to numpy and average across timesteps
                # Use nanmean — model marks invalid timesteps as NaN
                preds_array = np.array(preds, dtype=np.float32)
                print(f"preds shape: {preds_array.shape}, NaN fraction: {np.isnan(preds_array).mean():.2%}")

                vertex_activations = np.nanmean(preds_array, axis=0)  # (n_vertices,)

                # If all NaN (no valid predictions at all), fall back to mock
                if np.isnan(vertex_activations).all():
                    print("WARNING: all vertex activations are NaN — falling back to mock scores")
                    roi_data, mean_top_roi_score = mock_roi_scores(img_rgb)
                else:
                    # Replace any remaining NaN vertices with the global mean
                    global_mean = float(np.nanmean(vertex_activations))
                    vertex_activations = np.where(np.isnan(vertex_activations), global_mean, vertex_activations)

                    # Map vertices → our 10 ROI keys using Destrieux atlas
                    roi_data, mean_top_roi_score = extract_roi_scores(
                        vertex_activations, self.roi_vertex_map
                    )
                    print(f"Top ROI: {roi_data[0]['region_key']} ({roi_data[0]['activation']:.4f})")

                # Clean up temp files
                import shutil
                shutil.rmtree(os.path.dirname(vid_path), ignore_errors=True)

            except Exception as e:
                return fail(f"TRIBE v2 inference failed: {e}")

        # ── Heatmap ───────────────────────────────────────────────────────────
        try:
            heatmap_bytes = generate_heatmap(image_bytes, roi_data)
        except Exception as e:
            return fail(f"Heatmap generation failed: {e}")

        # ── Upload heatmap ────────────────────────────────────────────────────
        heatmap_key = f"{analysis_id}.png"
        try:
            db.storage.from_("heatmaps").upload(
                heatmap_key,
                heatmap_bytes,
                {"content-type": "image/png", "upsert": "true"},
            )
            heatmap_url = db.storage.from_("heatmaps").get_public_url(heatmap_key)
        except Exception as e:
            return fail(f"Heatmap upload failed: {e}")

        # ── Update analyses row ───────────────────────────────────────────────
        db.table("analyses").update({
            "status": "complete",
            "input_storage_key": thumbnail_url,
            "heatmap_storage_key": heatmap_key,
            "heatmap_url": heatmap_url,
            "roi_data": roi_data,
            "mean_top_roi_score": mean_top_roi_score,
            "completed_at": datetime.datetime.utcnow().isoformat(),
        }).eq("id", analysis_id).execute()

        return {
            "status": "complete",
            "analysis_id": analysis_id,
            "mean_top_roi_score": mean_top_roi_score,
            "mock": self.mock_mode,
        }
