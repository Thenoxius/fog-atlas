// Builds MapRecords from uploaded files or fetched collection blobs:
// decodes the image, renders a library thumbnail, and fills in metadata.
// Scene membership is left to the caller.

import type { MapRecord } from './db';
import { randomUUID } from './uuid';

const THUMB_WIDTH = 480;

export async function buildRecordFromBlob(image: Blob, name: string): Promise<MapRecord> {
  const bitmap = await createImageBitmap(image);
  const scale = Math.min(1, THUMB_WIDTH / bitmap.width);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.max(1, Math.round(bitmap.width * scale));
  thumbCanvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = thumbCanvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const thumbnail = await new Promise<Blob>((resolve, reject) =>
    thumbCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('thumbnail failed'))), 'image/jpeg', 0.82)
  );

  const now = Date.now();
  const record: MapRecord = {
    id: randomUUID(),
    name,
    width: bitmap.width,
    height: bitmap.height,
    createdAt: now,
    updatedAt: now,
    image,
    fog: null,
    thumbnail,
  };
  bitmap.close();
  return record;
}

export function buildRecordFromFile(file: File): Promise<MapRecord> {
  return buildRecordFromBlob(file, file.name.replace(/\.[^.]+$/, ''));
}
