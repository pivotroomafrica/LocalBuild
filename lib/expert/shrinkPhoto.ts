/** Longest side of a stored expert photo. Cards and the profile page show
 * it at a few hundred pixels, so this stays sharp on high-density screens. */
const MAX_SIDE = 800;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Encodes a canvas as WebP (JPEG where the browser can't encode WebP). */
export async function canvasToPhotoFile(canvas: HTMLCanvasElement, baseName: string): Promise<File | null> {
  let blob = await toBlob(canvas, "image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.85);
  if (!blob) return null;
  const extension = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `${baseName || "photo"}.${extension}`, { type: blob.type });
}

/**
 * Shrinks a photo in the browser before upload (WebP, or JPEG where the
 * browser can't encode WebP). A phone photo of several MB becomes roughly
 * 50-150 KB, which keeps page loads fast and Supabase transfer low. Returns
 * the original file if anything fails; the server still checks type and size.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    let blob = await toBlob(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") blob = await toBlob(canvas, "image/jpeg", 0.85);
    if (!blob || blob.size >= file.size) return file;

    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.${extension}`, { type: blob.type });
  } catch {
    return file;
  }
}
