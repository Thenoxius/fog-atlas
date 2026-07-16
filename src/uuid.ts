// crypto.randomUUID() only exists in secure contexts (https / localhost).
// The app must also work over plain http — a fresh custom domain whose
// certificate hasn't been issued yet, or a LAN address at the table
// (http://192.168.x.x on the player TV) — so fall back to a UUIDv4 built
// from getRandomValues, which is available everywhere.
export function randomUUID(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return (
    h[0] + h[1] + h[2] + h[3] + '-' +
    h[4] + h[5] + '-' +
    h[6] + h[7] + '-' +
    h[8] + h[9] + '-' +
    h[10] + h[11] + h[12] + h[13] + h[14] + h[15]
  );
}
