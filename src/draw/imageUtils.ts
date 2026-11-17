/**
 * imageUtils.ts — client-side image pre-processing for Draw mode.
 *
 * Steps:
 *  1. Resize so the longest side ≤ 1024 px (preserving aspect ratio).
 *  2. Convert to grayscale.
 *  3. Boost contrast (simple linear stretch).
 *  4. Reject very blurry images (Laplacian variance below threshold).
 *  5. Export as JPEG ~0.7 quality (target < 150 KB).
 */

export class BlurryImageError extends Error {
  constructor() {
    super('Hold steady and try again')
    this.name = 'BlurryImageError'
  }
}

const MAX_SIDE = 1024
const JPEG_QUALITY = 0.7
const BLUR_THRESHOLD = 60 // variance of Laplacian; below this → too blurry

/** Convert a File/Blob to a HTMLImageElement. */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}

/**
 * Compute variance of Laplacian (a simple blur metric).
 * Returns a higher value for sharper images.
 */
function laplacianVariance(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const { data } = ctx.getImageData(0, 0, w, h)
  // We already have grayscale — use R channel only.
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0]
  let sum = 0
  let sumSq = 0
  let count = 0

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let val = 0
      let ki = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ni = ((y + dy) * w + (x + dx)) * 4
          val += kernel[ki++] * data[ni]
        }
      }
      sum += val
      sumSq += val * val
      count++
    }
  }
  const mean = sum / count
  return sumSq / count - mean * mean
}

/**
 * Process an image file:
 *  - Resize, grayscale, contrast-boost.
 *  - Throws BlurryImageError if too blurry.
 *  - Returns a base64 JPEG string (no "data:…" prefix) and a preview data-URL.
 */
export async function processImage(file: File): Promise<{ base64: string; previewUrl: string }> {
  const img = await loadImage(file)

  // Compute target size
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Draw original to canvas
  ctx.drawImage(img, 0, 0, w, h)

  // Convert to grayscale and boost contrast
  const imageData = ctx.getImageData(0, 0, w, h)
  const { data } = imageData

  // Find min/max for contrast stretch
  let min = 255
  let max = 0
  for (let i = 0; i < data.length; i += 4) {
    // luminance
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    if (gray < min) min = gray
    if (gray > max) max = gray
  }
  const range = max - min || 1

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    const stretched = Math.round(((gray - min) / range) * 255)
    data[i] = stretched
    data[i + 1] = stretched
    data[i + 2] = stretched
    // alpha unchanged
  }
  ctx.putImageData(imageData, 0, 0)

  // Blur check
  const variance = laplacianVariance(ctx, w, h)
  if (variance < BLUR_THRESHOLD) {
    throw new BlurryImageError()
  }

  // Export JPEG
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const base64 = dataUrl.split(',')[1]

  return { base64, previewUrl: dataUrl }
}
