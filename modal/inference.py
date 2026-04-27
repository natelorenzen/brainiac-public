"""
Brainiac — Modal worker

  BrainiacThumbnailInference  (BERG, CPU-only)
    - Static ad images → BERG fmri-nsd-fwrf → 6 visual-cortex ROI scores
    - No GPU, no ffmpeg, no HuggingFace token required
    - Endpoint label: brainiac-thumbnail-inference
    - One-time weight setup: modal run modal/inference.py::download_berg_weights

Deploy: modal deploy modal/inference.py

Secrets required in Modal dashboard:
  - "brainiac-supabase": SUPABASE_SERVICE_ROLE_KEY
"""

import io
import os
import datetime

import modal

# ── Toggle via env var, not code ─────────────────────────────────────────────
MOCK_MODE = os.environ.get("MOCK_MODE", "false").lower() == "true"
# ─────────────────────────────────────────────────────────────────────────────

app = modal.App("brainiac-inference")

# ─────────────────────────────────────────────────────────────────────────────
# BERG thumbnail worker (CPU)
# ─────────────────────────────────────────────────────────────────────────────

berg_volume = modal.Volume.from_name("brainiac-berg-weights", create_if_missing=True)

berg_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "awscli", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "fastapi[standard]",
        "numpy",
        "Pillow",
        "opencv-python-headless",
        "matplotlib",
        "scipy",
        "supabase",
        "torch>=2.5.1",
        "torchvision>=0.20",
    )
    .run_commands(
        "pip install -U 'git+https://github.com/gifale95/BERG.git'"
    )
)

# BERG ROI keys → our output ROI keys.
# Each BERG key maps to one of our 6 visual-cortex output labels.
# Multiple BERG keys mapped to the same output key are averaged.
BERG_ROI_MAP: dict[str, list[str]] = {
    "FFA":   ["FFA-1", "FFA-2"],
    "V1_V2": ["V1", "V2"],
    "V4":    ["hV4"],
    "LO":    ["lateral"],
    "PPA":   ["PPA"],
    "VWFA":  ["VWFA-1", "VWFA-2"],
}

# All unique BERG ROI keys we need to load
BERG_ROI_KEYS: list[str] = sorted({k for keys in BERG_ROI_MAP.values() for k in keys})

BERG_REGISTRY = {
    "FFA":   {"label": "Face Detection",           "description": "A face or face-like element is visually dominant in this image."},
    "V1_V2": {"label": "Low-Level Visual Signal",   "description": "Strong contrast, edges, or luminance variation is present."},
    "V4":    {"label": "Color and Form Processing", "description": "Color relationships and shape boundaries are being processed."},
    "LO":    {"label": "Object Recognition",        "description": "Distinct objects or elements are registering as meaningful visual units."},
    "PPA":   {"label": "Scene Recognition",         "description": "The background or setting is being processed as contextual information."},
    "VWFA":  {"label": "Text Processing",           "description": "Text in this image is legible and occupying visual attention."},
}

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


# ─────────────────────────────────────────────────────────────────────────────
# One-time setup: download BERG weights into the Modal volume.
# Run once before deploying: modal run modal/inference.py::download_berg_weights
# ─────────────────────────────────────────────────────────────────────────────

@app.function(
    image=berg_image,
    volumes={"/cache/berg": berg_volume},
    timeout=1800,
)
def download_berg_weights():
    """
    Sync BERG fmri-nsd-fwrf weights for subject 1 from the public AWS S3 bucket
    into the brainiac-berg-weights Modal volume.
    """
    import subprocess
    import os

    dest = "/cache/berg"
    s3_base = "s3://brain-encoding-response-generator"
    s3_model = f"{s3_base}/encoding_models/modality-fmri/train_dataset-nsd/model-fwrf"
    local_model = f"{dest}/encoding_models/modality-fmri/train_dataset-nsd/model-fwrf"

    # First: list what's on S3 so we know the actual filenames
    print("Listing S3 bucket structure (first 50 files)...")
    result = subprocess.run(
        ["aws", "s3", "ls", "--no-sign-request", "--recursive", s3_model + "/"],
        capture_output=True, text=True
    )
    lines = result.stdout.strip().splitlines()
    for line in lines[:50]:
        print(f"  S3: {line}")
    print(f"  ... ({len(lines)} total files)")

    # Sync everything under model-fwrf — no filtering so we don't miss
    # files with unexpected suffixes (e.g. lateral_split-1.pt)
    print(f"\nSyncing all model-fwrf files to {local_model} ...")
    subprocess.run(
        ["aws", "s3", "sync", "--no-sign-request", s3_model + "/", local_model + "/"],
        check=True,
    )

    # List what landed locally
    print("\nLocal files after sync:")
    for root, dirs, files in os.walk(dest):
        for f in files:
            print(f"  {os.path.join(root, f)}")

    berg_volume.commit()
    print("\nBERG weight download complete.")


# ─────────────────────────────────────────────────────────────────────────────
# BrainiacThumbnailInference — BERG, CPU-only, YouTube static thumbnails
# ─────────────────────────────────────────────────────────────────────────────

@app.cls(
    image=berg_image,
    volumes={"/cache/berg": berg_volume},
    timeout=300,
    secrets=[modal.Secret.from_name("brainiac-supabase")],
)
class BrainiacThumbnailInference:
    """
    CPU-only worker for YouTube thumbnail analysis.
    Uses BERG fmri-nsd-fwrf (subject 1) to predict fMRI activations
    in 6 visual-cortex ROIs from a static JPEG image.
    """

    @modal.enter()
    def load(self):
        import numpy as np
        import os

        self.mock_mode = MOCK_MODE
        self.berg_load_error: str | None = None

        if not self.mock_mode:
            # Log volume contents so we can verify weights landed in the right place
            berg_dir = "/cache/berg"
            print(f"BERG weight dir contents ({berg_dir}):")
            for root, dirs, files in os.walk(berg_dir):
                depth = root.replace(berg_dir, "").count(os.sep)
                indent = "  " * depth
                print(f"{indent}{os.path.basename(root)}/")
                if depth < 4:
                    for f in files[:5]:
                        print(f"{indent}  {f}")

            try:
                from berg import BERG
                print("Loading BERG fmri-nsd-fwrf models (subject 1)...")
                self.berg = BERG(berg_dir=berg_dir)
                self.berg_models = {}
                for roi_key in BERG_ROI_KEYS:
                    try:
                        self.berg_models[roi_key] = self.berg.get_encoding_model(
                            "fmri-nsd-fwrf",
                            subject=1,
                            device="cpu",
                            selection={"roi": roi_key},
                        )
                        print(f"  Loaded BERG model: {roi_key}")
                    except Exception as e:
                        print(f"  FAILED to load BERG model for {roi_key}: {type(e).__name__}: {e}")
                print(f"BERG ready — {len(self.berg_models)}/{len(BERG_ROI_KEYS)} ROI models loaded.")
                if not self.berg_models:
                    self.berg_load_error = "No BERG ROI models loaded — check weight path and API"
            except Exception as e:
                import traceback
                self.berg_load_error = f"BERG init failed: {type(e).__name__}: {e}"
                self.berg = None
                self.berg_models = {}
                print(f"BERG INIT ERROR: {self.berg_load_error}")
                traceback.print_exc()
        else:
            self.berg = None
            self.berg_models = {}
            print("MOCK_MODE=true — skipping BERG model load.")

    def _run_berg(self, img_rgb) -> tuple[list[dict], float]:
        """Run BERG on a (H, W, 3) uint8 RGB array. Returns (roi_data, mean_top_3)."""
        import numpy as np

        # BERG expects (batch, 3, H, W) uint8, square image
        h, w = img_rgb.shape[:2]
        side = min(h, w)
        # Center-crop to square
        top  = (h - side) // 2
        left = (w - side) // 2
        cropped = img_rgb[top:top+side, left:left+side]

        # Resize to 224×224 (standard for fwRF backbone)
        from PIL import Image as PILImage
        pil = PILImage.fromarray(cropped).resize((224, 224), PILImage.LANCZOS)
        arr = np.array(pil, dtype=np.uint8)                    # (224, 224, 3)
        batch = arr.transpose(2, 0, 1)[np.newaxis, ...]        # (1, 3, 224, 224)

        # Run BERG for each needed ROI key, collect raw mean activations
        raw: dict[str, float] = {}
        for berg_key, model in self.berg_models.items():
            resp = self.berg.encode(model, batch)               # (1, n_voxels)
            raw[berg_key] = float(np.mean(resp[0]))

        # Map BERG keys → our 6 output ROI keys (average multi-key mappings)
        out_scores: dict[str, float] = {}
        for roi_key, berg_keys in BERG_ROI_MAP.items():
            vals = [raw[k] for k in berg_keys if k in raw]
            out_scores[roi_key] = float(np.mean(vals)) if vals else 0.0

        # Normalize across the 6 output ROIs to [0, 1]
        vals = list(out_scores.values())
        v_min, v_max = min(vals), max(vals)
        span = v_max - v_min + 1e-8
        normalized = {k: (v - v_min) / span for k, v in out_scores.items()}

        results = [
            {
                "region_key": roi_key,
                "label":      BERG_REGISTRY[roi_key]["label"],
                "activation": round(normalized[roi_key], 4),
                "description": BERG_REGISTRY[roi_key]["description"],
            }
            for roi_key in BERG_ROI_MAP
        ]
        results.sort(key=lambda x: x["activation"], reverse=True)
        mean_top = round(float(np.mean([r["activation"] for r in results[:3]])), 4)
        return results, mean_top

    def _run_berg_raw_mean(self, arr_224) -> float:
        """Run BERG on a 224×224 uint8 array. Returns mean raw activation across all models."""
        import numpy as np
        batch = arr_224.transpose(2, 0, 1)[np.newaxis, ...].astype(np.uint8)
        vals = []
        for model in self.berg_models.values():
            resp = self.berg.encode(model, batch)
            vals.append(float(np.mean(resp[0])))
        return float(np.mean(vals)) if vals else 0.0

    def _ablation_heatmap(self, img_rgb) -> bytes:
        """
        10-patch ablation heatmap (2 rows × 5 cols).
        Masks each patch with mean fill, measures BERG score drop vs baseline.
        Produces a spatially meaningful heatmap unique to this image.
        """
        import numpy as np
        import matplotlib.cm as cm
        from PIL import Image as PILImage
        from scipy.ndimage import gaussian_filter

        # Preprocess to 224×224 (same pipeline as _run_berg)
        h, w = img_rgb.shape[:2]
        side = min(h, w)
        top = (h - side) // 2
        left = (w - side) // 2
        cropped = img_rgb[top:top+side, left:left+side]
        pil_224 = PILImage.fromarray(cropped).resize((224, 224), PILImage.LANCZOS)
        arr_224 = np.array(pil_224, dtype=np.uint8)

        fill = int(arr_224.mean())
        baseline = self._run_berg_raw_mean(arr_224)

        n_rows, n_cols = 2, 5
        importance = np.zeros((224, 224), dtype=np.float32)

        for r in range(n_rows):
            for c in range(n_cols):
                r0 = r * (224 // n_rows)
                r1 = (r + 1) * (224 // n_rows) if r < n_rows - 1 else 224
                c0 = c * (224 // n_cols)
                c1 = (c + 1) * (224 // n_cols) if c < n_cols - 1 else 224
                masked = arr_224.copy()
                masked[r0:r1, c0:c1] = fill
                delta = max(0.0, baseline - self._run_berg_raw_mean(masked))
                importance[r0:r1, c0:c1] = delta

        importance = gaussian_filter(importance, sigma=224 * 0.18)
        mn, mx = importance.min(), importance.max()
        importance = (importance - mn) / (mx - mn + 1e-8)

        # Upsample importance map to original image dimensions before blending
        h_orig, w_orig = img_rgb.shape[:2]
        importance_up = np.array(
            PILImage.fromarray((importance * 255).astype(np.uint8)).resize(
                (w_orig, h_orig), PILImage.BILINEAR
            ),
            dtype=np.float32,
        ) / 255.0

        colormap = cm.get_cmap("viridis")
        heatmap_rgb = (colormap(importance_up)[:, :, :3] * 255).astype(np.float32)
        blended = (img_rgb.astype(np.float32) * 0.50 + heatmap_rgb * 0.50).clip(0, 255).astype(np.uint8)

        out = io.BytesIO()
        PILImage.fromarray(blended).save(out, format="PNG", optimize=True)
        return out.getvalue()

    def _process(self, body: dict) -> None:
        """
        Background thread: download thumbnail → BERG inference → heatmap → Supabase.
        Called from run_inference via a daemon thread so the HTTP response returns
        immediately without waiting for inference to complete.
        """
        import numpy as np
        import cv2
        import urllib.request
        from supabase import create_client

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

        # ── Download image ────────────────────────────────────────────────────
        if thumbnail_url:
            try:
                req = urllib.request.Request(
                    thumbnail_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; Brainiac/1.0)"},
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    image_bytes = resp.read()
            except Exception as e:
                fail(f"Thumbnail download failed: {e}"); return
        elif storage_key:
            try:
                image_bytes = bytes(db.storage.from_("creatives").download(storage_key))
            except Exception as e:
                fail(f"Storage download failed: {e}"); return
        else:
            fail("No thumbnail_url or storage_key provided"); return

        # ── Decode ────────────────────────────────────────────────────────────
        # Use PIL instead of cv2 — PIL silently ignores bad ICC/iCCP chunks
        # that cause libpng to return None from cv2.imdecode.
        try:
            from PIL import Image as PILImage
            pil_img = PILImage.open(io.BytesIO(image_bytes)).convert("RGB")
            img_rgb = np.array(pil_img, dtype=np.uint8)
            # Re-encode as clean JPEG (strips all metadata incl. bad ICC profiles)
            # so generate_heatmap never sees the corrupt chunk.
            clean_buf = io.BytesIO()
            pil_img.save(clean_buf, format="JPEG", quality=95)
            clean_bytes = clean_buf.getvalue()
        except Exception as e:
            fail(f"Image decode failed: {e}"); return

        # ── Inference ─────────────────────────────────────────────────────────
        if self.mock_mode:
            roi_data, mean_top_roi_score = mock_roi_scores(img_rgb)
            berg_keys = set(BERG_REGISTRY.keys())
            roi_data = [r for r in roi_data if r["region_key"] in berg_keys]
            roi_data.sort(key=lambda x: x["activation"], reverse=True)
        else:
            if self.berg_load_error:
                fail(f"BERG load error: {self.berg_load_error}"); return
            try:
                roi_data, mean_top_roi_score = self._run_berg(img_rgb)
            except Exception as e:
                fail(f"BERG inference failed: {e}"); return

        # ── Heatmap ───────────────────────────────────────────────────────────
        try:
            if self.mock_mode:
                heatmap_bytes = generate_heatmap(clean_bytes, roi_data)
            else:
                heatmap_bytes = self._ablation_heatmap(img_rgb)
        except Exception as e:
            fail(f"Heatmap generation failed: {e}"); return

        # ── Upload heatmap ────────────────────────────────────────────────────
        heatmap_key = f"{analysis_id}.png"
        try:
            db.storage.from_("heatmaps").upload(
                heatmap_key, heatmap_bytes,
                {"content-type": "image/png", "upsert": "true"},
            )
            heatmap_url = db.storage.from_("heatmaps").get_public_url(heatmap_key)
        except Exception as e:
            fail(f"Heatmap upload failed: {e}"); return

        # ── Write results ─────────────────────────────────────────────────────
        db.table("analyses").update({
            "status": "complete",
            "input_storage_key": thumbnail_url or storage_key,
            "heatmap_storage_key": heatmap_key,
            "heatmap_url": heatmap_url,
            "roi_data": roi_data,
            "mean_top_roi_score": mean_top_roi_score,
            "completed_at": datetime.datetime.utcnow().isoformat(),
        }).eq("id", analysis_id).execute()

    @modal.fastapi_endpoint(method="POST", label="brainiac-thumbnail-inference")
    def run_inference(self, body: dict) -> dict:
        """
        Fire-and-forget endpoint. Returns {"status": "queued"} immediately so
        Vercel never times out waiting. Actual inference runs in a daemon thread.
        Body: { analysis_id, supabase_url, thumbnail_url? | storage_key? }
        """
        import threading

        analysis_id: str = body.get("analysis_id", "unknown")
        if not body.get("analysis_id"):
            return {"status": "error", "error": "analysis_id required"}

        thread = threading.Thread(target=self._process, args=(body,), daemon=False)
        thread.start()
        return {"status": "queued", "analysis_id": analysis_id}
