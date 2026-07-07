// Processes an uploaded portrait image into a small square thumbnail —
// center-cropped so non-square source photos/art still fill a circular
// avatar cleanly — mirroring the thumbnail pattern in mapImport.ts.

const PORTRAIT_SIZE = 160;

export async function buildPortraitBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_SIZE;
  canvas.height = PORTRAIT_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('portrait processing failed'))), 'image/webp', 0.85)
  );
}
