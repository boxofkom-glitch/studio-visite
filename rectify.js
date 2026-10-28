// Redressement de perspective : 4 coins d'une photo -> texture rectangulaire.

/** Homographie carré unité (u,v) -> quadrilatère [TL, TR, BR, BL] (Heckbert). */
function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    h = (dx1 * dy3 - dx3 * dy1) / det;
  }
  return {
    a: x1 - x0 + g * x1, b: x3 - x0 + h * x3, c: x0,
    d: y1 - y0 + g * y1, e: y3 - y0 + h * y3, f: y0, g, h,
  };
}

/**
 * Extrait la zone `corners` (coordonnées en pixels de `img`) vers un canvas outW x outH.
 * img : ImageBitmap / HTMLImageElement / canvas.
 */
export function rectify(img, corners, outW, outH) {
  const sw = img.width, sh = img.height;
  const sc = document.createElement('canvas');
  sc.width = sw; sc.height = sh;
  const sctx = sc.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const src = sctx.getImageData(0, 0, sw, sh).data;

  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const octx = out.getContext('2d');
  const od = octx.createImageData(outW, outH);
  const dst = od.data;
  const H = squareToQuad(corners);
  const maxX = sw - 1, maxY = sh - 1;

  let o = 0;
  for (let j = 0; j < outH; j++) {
    const v = (j + 0.5) / outH;
    for (let i = 0; i < outW; i++, o += 4) {
      const u = (i + 0.5) / outW;
      const w = H.g * u + H.h * v + 1;
      let x = (H.a * u + H.b * v + H.c) / w - 0.5;
      let y = (H.d * u + H.e * v + H.f) / w - 0.5;
      x = x < 0 ? 0 : x > maxX ? maxX : x;
      y = y < 0 ? 0 : y > maxY ? maxY : y;
      const xi = x | 0, yi = y | 0;
      const fx = x - xi, fy = y - yi;
      const x1 = xi < maxX ? xi + 1 : xi, y1 = yi < maxY ? yi + 1 : yi;
      const p00 = (yi * sw + xi) * 4, p10 = (yi * sw + x1) * 4;
      const p01 = (y1 * sw + xi) * 4, p11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[p00 + c] + (src[p10 + c] - src[p00 + c]) * fx;
        const bot = src[p01 + c] + (src[p11 + c] - src[p01 + c]) * fx;
        dst[o + c] = top + (bot - top) * fy;
      }
      dst[o + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out;
}

/** Taille de sortie : respecte les proportions réelles du mur (m), côté long <= maxSide. */
export function outputSize(realW, realH, maxSide = 2048) {
  const r = realW / realH;
  return r >= 1 ? [maxSide, Math.max(16, Math.round(maxSide / r))] : [Math.max(16, Math.round(maxSide * r)), maxSide];
}
