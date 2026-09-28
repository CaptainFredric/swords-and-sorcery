// Axis-aligned rectangles on the ground plane (pure, so the floor layout can be tested without three.js).

/**
 * What is left of the rectangle [xa, xb] x [za, zb] once `covers` (rectangles { minX, maxX, minZ, maxZ }) are taken
 * out of it: a list of rectangles, possibly empty.
 */
export function subtractRects(rect, covers) {
  let pieces = [rect];
  for (const cover of covers) {
    const next = [];
    for (const piece of pieces) {
      const ix0 = Math.max(piece.xa, cover.minX);
      const ix1 = Math.min(piece.xb, cover.maxX);
      const iz0 = Math.max(piece.za, cover.minZ);
      const iz1 = Math.min(piece.zb, cover.maxZ);
      if (ix1 - ix0 < 1e-6 || iz1 - iz0 < 1e-6) {
        next.push(piece);
        continue;
      }
      // the parts beside the overlap (full depth), then above and below it (its width only)
      if (ix0 - piece.xa > 1e-6) next.push({ xa: piece.xa, xb: ix0, za: piece.za, zb: piece.zb });
      if (piece.xb - ix1 > 1e-6) next.push({ xa: ix1, xb: piece.xb, za: piece.za, zb: piece.zb });
      if (iz0 - piece.za > 1e-6) next.push({ xa: ix0, xb: ix1, za: piece.za, zb: iz0 });
      if (piece.zb - iz1 > 1e-6) next.push({ xa: ix0, xb: ix1, za: iz1, zb: piece.zb });
    }
    pieces = next;
  }
  return pieces;
}
