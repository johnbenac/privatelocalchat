// Prepare a picture for a provider that can see images: downscale so requests stay small.
export async function prepareImage(file, maxSide = 1568) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 }) : await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  const dataUrl = await new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsDataURL(blob); });
  return { dataUrl, width: w, height: h, size: blob.size };
}
