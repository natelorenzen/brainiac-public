import type { ROIRegion } from '@/types'

export const ROI_REGISTRY: Record<string, { label: string; description: string }> = {
  FFA: {
    label: 'Face Detection',
    description: 'A face or face-like element is visually dominant in this image.',
  },
  V1_V2: {
    label: 'Low-Level Visual Signal',
    description: 'Strong contrast, edges, or luminance variation is present.',
  },
  V4: {
    label: 'Color and Form Processing',
    description: 'Color relationships and shape boundaries are being processed.',
  },
  LO: {
    label: 'Object Recognition',
    description: 'Distinct objects or elements are registering as meaningful visual units.',
  },
  PPA: {
    label: 'Scene Recognition',
    description: 'The background or setting is being processed as contextual information.',
  },
  VWFA: {
    label: 'Text Processing',
    description: 'Text in this image is legible and occupying visual attention.',
  },
}

/** Extract per-ROI activation scores from the raw activation map. */
export function extractROIActivations(
  activationMap: number[],
  roiVertexMap: Record<string, number[]>
): ROIRegion[] {
  const results: ROIRegion[] = []

  for (const [roiKey, vertices] of Object.entries(roiVertexMap)) {
    if (!(roiKey in ROI_REGISTRY)) continue
    if (vertices.length === 0) continue

    const sum = vertices.reduce((acc, idx) => acc + (activationMap[idx] ?? 0), 0)
    const mean = sum / vertices.length

    results.push({
      region_key: roiKey,
      label: ROI_REGISTRY[roiKey].label,
      activation: Math.round(mean * 10000) / 10000,
      description: ROI_REGISTRY[roiKey].description,
    })
  }

  return results.sort((a, b) => b.activation - a.activation)
}
