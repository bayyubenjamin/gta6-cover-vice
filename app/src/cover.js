// Vice Cover Studio — the cover engine.
//
// Draws GTA-style multi-panel poster art from the user's own photo, entirely
// in canvas 2D: a diagonal panel grid, a procedurally drawn neon skyline, a
// real per-pixel cinematic grade, and bold condensed display type. Everything
// is deterministic: the same photo, caption, size, layout and grade always
// draw the same cover. No network, no randomness without a seed, no
// dependencies.

export const SIZES = {
  square: { w: 1080, h: 1080, label: '1080 x 1080' },
  portrait: { w: 1080, h: 1350, label: '1080 x 1350' },
  wide: { w: 1920, h: 1080, label: '1920 x 1080' },
};

export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    shadow: { r: 1.1, g: 0.94, b: 1.06 },
    highlight: { r: 1.07, g: 1.0, b: 0.9 },
    saturation: 1.18,
    contrast: 0.32,
  },
  neon: {
    label: 'Neon Nights',
    shadow: { r: 0.9, g: 1.06, b: 1.14 },
    highlight: { r: 1.03, g: 1.02, b: 1.0 },
    saturation: 1.22,
    contrast: 0.36,
  },
};

/** Deterministic PRNG (mulberry32): the skyline is the same on every render. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The grade: a per-pixel cinematic grade baked once per photo, then reused.
// ---------------------------------------------------------------------------

const gradedCache = new WeakMap();

/**
 * Grades `photo` once and returns an offscreen canvas holding the graded
 * image (long side at most 1400 px, so the pixel loop stays fast). The result
 * is cached per photo and grade name, so typing a caption never re-grades.
 */
export function getGradedPhoto(photo, gradeName) {
  const grade = GRADES[gradeName] ?? GRADES.sunset;
  let byGrade = gradedCache.get(photo);
  if (!byGrade) {
    byGrade = new Map();
    gradedCache.set(photo, byGrade);
  }
  const cached = byGrade.get(gradeName);
  if (cached) return cached;

  const scale = Math.min(1, 1400 / Math.max(photo.naturalWidth, photo.naturalHeight));
  const w = Math.max(2, Math.round(photo.naturalWidth * scale));
  const h = Math.max(2, Math.round(photo.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  // Mild S-curve for contrast, baked into one lookup table.
  const curve = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) {
    const t = v / 255;
    const s = t * t * (3 - 2 * t);
    curve[v] = Math.round(255 * (t + (s - t) * grade.contrast));
  }
  for (let i = 0; i < data.length; i += 4) {
    let r = curve[data[i]];
    let g = curve[data[i + 1]];
    let b = curve[data[i + 2]];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Saturation around the luminance.
    r = lum + (r - lum) * grade.saturation;
    g = lum + (g - lum) * grade.saturation;
    b = lum + (b - lum) * grade.saturation;
    // Split tone: shadows one way, highlights the other.
    const tint = lum < 128 ? grade.shadow : grade.highlight;
    data[i] = Math.max(0, Math.min(255, r * tint.r));
    data[i + 1] = Math.max(0, Math.min(255, g * tint.g));
    data[i + 2] = Math.max(0, Math.min(255, b * tint.b));
  }
  ctx.putImageData(image, 0, 0);
  byGrade.set(gradeName, canvas);
  return canvas;
}

// ---------------------------------------------------------------------------
// Panel geometry: the poster grid.
// ---------------------------------------------------------------------------

/**
 * Returns the panels for a canvas of `w` x `h`: each panel has a polygon
 * (points in canvas space, clockwise) and a crop describing which part of
 * the photo it shows: focus point (0..1) and zoom. Landscape and square put
 * a tall hero on the left and three vignettes stacked on the right; portrait
 * puts a wide hero on top and three vignettes in a row below it. The
 * `diagonal` layout slants the shared edges; `grid` keeps them straight.
 */
export function computePanels(w, h, layout) {
  const gap = Math.max(10, Math.round(w * 0.006));
  const stripH = Math.round(h * 0.21);
  const areaH = h - stripH - gap;
  const slant = layout === 'diagonal' ? Math.round(w * 0.032) : 0;
  const panels = [];

  if (h > w) {
    // Portrait: hero on top, three vignettes in a row below.
    const heroH = Math.round(areaH * 0.56);
    const rowY = heroH + gap;
    const rowH = areaH - rowY;
    const colW = (w - 2 * gap) / 3;
    panels.push({
      poly: [
        [0, 0],
        [w, 0],
        [w - slant, heroH],
        [0, heroH],
      ],
      crop: { fx: 0.5, fy: 0.3, zoom: 1.0 },
    });
    const crops = [
      { fx: 0.22, fy: 0.5, zoom: 1.15 },
      { fx: 0.78, fy: 0.55, zoom: 1.7 },
      { fx: 0.5, fy: 0.12, zoom: 1.1 },
    ];
    for (let i = 0; i < 3; i += 1) {
      const x0 = i * (colW + gap);
      panels.push({
        poly: [
          [x0, rowY],
          [x0 + colW, rowY],
          [x0 + colW, rowY + rowH],
          [x0, rowY + rowH],
        ],
        crop: crops[i],
      });
    }
    return { panels, stripY: areaH + gap, stripH, gap };
  }

  // Landscape and square: hero on the left, three vignettes stacked right.
  const heroW = Math.round(w * 0.56);
  const colX = heroW + gap;
  const colW = w - colX;
  const rowH = (areaH - 2 * gap) / 3;
  panels.push({
    poly: [
      [0, 0],
      [heroW, 0],
      [heroW - slant, areaH],
      [0, areaH],
    ],
    crop: { fx: 0.5, fy: 0.3, zoom: 1.0 },
  });
  const crops = [
    { fx: 0.5, fy: 0.5, zoom: 1.0 },
    { fx: 0.18, fy: 0.78, zoom: 1.6 },
    { fx: 0.5, fy: 0.12, zoom: 1.05 },
  ];
  for (let i = 0; i < 3; i += 1) {
    const y0 = i * (rowH + gap);
    const lean = slant * (1 - i / 2);
    panels.push({
      poly: [
        [colX, y0],
        [w, y0],
        [w, y0 + rowH],
        [colX - lean, y0 + rowH],
      ],
      crop: crops[i],
    });
  }
  return { panels, stripY: areaH + gap, stripH, gap };
}

/**
 * The source rectangle of `photo` that cover-fits a panel of `pw` x `ph`,
 * centred on the focus point and zoomed in by `zoom`. Clamped so the rect
 * never leaves the photo.
 */
export function coverCropRect(photoW, photoH, pw, ph, fx, fy, zoom) {
  const panelAspect = pw / ph;
  const photoAspect = photoW / photoH;
  let sw;
  let sh;
  if (photoAspect > panelAspect) {
    sh = photoH / zoom;
    sw = sh * panelAspect;
  } else {
    sw = photoW / zoom;
    sh = sw / panelAspect;
  }
  const cx = Math.max(sw / 2, Math.min(photoW - sw / 2, fx * photoW));
  const cy = Math.max(sh / 2, Math.min(photoH - sh / 2, fy * photoH));
  return { x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh };
}

function tracePoly(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
}

function polygonBounds(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// The skyline: drawn, never an image. Seeded, so it never changes.
// ---------------------------------------------------------------------------

/** Draws a neon sunset skyline inside the rectangle (x, y, w, h). */
export function drawSkyline(ctx, x, y, w, h, seed) {
  const rand = seededRandom(seed);
  // Sky: indigo at the top, magenta at the horizon.
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, '#160a2e');
  sky.addColorStop(0.55, '#4b1157');
  sky.addColorStop(0.8, '#c22769');
  sky.addColorStop(1, '#ff7a3d');
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);

  // Sun disc with scanline gaps, low over the horizon.
  const sunR = h * 0.34;
  const sunX = x + w * 0.76;
  const sunY = y + h * 0.52;
  const sun = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sun.addColorStop(0, '#fff3b0');
  sun.addColorStop(0.6, '#ffb347');
  sun.addColorStop(1, '#ff5e62');
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  // Cut the gaps out of the sun's lower half.
  ctx.fillStyle = sky;
  let gapY = sunY + sunR * 0.05;
  let gapH = 2;
  while (gapY < sunY + sunR) {
    ctx.fillRect(sunX - sunR - 1, gapY, sunR * 2 + 2, gapH);
    gapY += gapH + Math.max(6, sunR * 0.16);
    gapH += 2;
  }

  // Building silhouettes with lit windows.
  const horizon = y + h * 0.72;
  ctx.fillStyle = '#0a0618';
  let bx = x;
  while (bx < x + w) {
    const bw = w * (0.04 + rand() * 0.06);
    const bh = h * (0.18 + rand() * 0.42);
    ctx.fillRect(bx, horizon - bh, bw, bh + (y + h - horizon));
    // Lit windows: warm and pink dots, seeded.
    const cols = Math.max(1, Math.floor(bw / 14));
    const rows = Math.max(1, Math.floor(bh / 18));
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        if (rand() < 0.32) {
          ctx.fillStyle = rand() < 0.6 ? '#ffd166' : '#ff5e8a';
          ctx.fillRect(bx + 5 + c * 14, horizon - bh + 6 + r * 18, 5, 7);
          ctx.fillStyle = '#0a0618';
        }
      }
    }
    bx += bw + w * 0.008;
  }

  // Two palm silhouettes at the edges.
  drawPalm(ctx, x + w * 0.04, y + h, h * 0.62, -1);
  drawPalm(ctx, x + w * 0.97, y + h, h * 0.55, 1);
}

/** A palm tree silhouette: a leaning trunk and six fronds. */
function drawPalm(ctx, baseX, baseY, height, lean) {
  ctx.strokeStyle = '#0a0618';
  ctx.fillStyle = '#0a0618';
  ctx.lineWidth = Math.max(3, height * 0.03);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(baseX + lean * height * 0.12, baseY - height * 0.55, baseX + lean * height * 0.2, baseY - height);
  ctx.stroke();
  const topX = baseX + lean * height * 0.2;
  const topY = baseY - height;
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI * (0.08 + (i / 5) * 0.84);
    const dir = lean > 0 ? -1 : 1;
    const endX = topX + dir * Math.cos(angle) * height * 0.42;
    const endY = topY + Math.sin(angle) * height * 0.3 + height * 0.12;
    ctx.lineWidth = Math.max(2, height * 0.018);
    ctx.beginPath();
    ctx.moveTo(topX, topY);
    ctx.quadraticCurveTo(topX + (endX - topX) * 0.5, topY - height * 0.14, endX, endY);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// The cover itself.
// ---------------------------------------------------------------------------

function fitCaptionFont(ctx, text, maxWidth, startSize) {
  let size = startSize;
  ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
  while (size > 20 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
  }
  return size;
}

/**
 * Draws the whole cover onto `canvas` (which must already be at its export
 * size). `photo` is an image element or null; `opts` carries caption,
 * tagline, size key, layout and grade. With no photo the panels fall back
 * to the graded skyline palette so the cover never renders empty.
 */
export function drawCover(canvas, photo, opts) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const caption = (opts.caption ?? 'Sunset Heist').trim().toUpperCase() || 'SUNSET HEIST';
  const tagline = (opts.tagline ?? 'Vice City').trim().toUpperCase();
  const layout = opts.layout === 'grid' ? 'grid' : 'diagonal';
  const gradeName = GRADES[opts.grade] ? opts.grade : 'sunset';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const { panels, stripY, stripH, gap } = computePanels(w, h, layout);
  const graded = photo ? getGradedPhoto(photo, gradeName) : null;

  for (const panel of panels) {
    const bounds = polygonBounds(panel.poly);
    ctx.save();
    tracePoly(ctx, panel.poly);
    ctx.clip();
    if (graded) {
      const src = coverCropRect(
        graded.width,
        graded.height,
        bounds.w,
        bounds.h,
        panel.crop.fx,
        panel.crop.fy,
        panel.crop.zoom,
      );
      ctx.drawImage(graded, src.x, src.y, src.w, src.h, bounds.x, bounds.y, bounds.w, bounds.h);
    } else {
      const g = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h);
      g.addColorStop(0, '#3b1157');
      g.addColorStop(1, '#ff5e62');
      ctx.fillStyle = g;
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }
    // Soft vignette inside the panel for depth.
    const vg = ctx.createRadialGradient(
      bounds.x + bounds.w / 2,
      bounds.y + bounds.h / 2,
      Math.min(bounds.w, bounds.h) * 0.35,
      bounds.x + bounds.w / 2,
      bounds.y + bounds.h / 2,
      Math.max(bounds.w, bounds.h) * 0.75,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,2,16,0.32)');
    ctx.fillStyle = vg;
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.restore();
    // Crisp white frame around the panel.
    tracePoly(ctx, panel.poly);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(4, w * 0.004);
    ctx.stroke();
  }

  // The title strip: procedural skyline, darkened toward the bottom.
  drawSkyline(ctx, 0, stripY, w, stripH, 20261120 + w * 7 + h);
  const shade = ctx.createLinearGradient(0, stripY, 0, stripY + stripH);
  shade.addColorStop(0, 'rgba(8,5,20,0)');
  shade.addColorStop(0.55, 'rgba(8,5,20,0.28)');
  shade.addColorStop(1, 'rgba(8,5,20,0.66)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, stripY, w, stripH);
  // Neon rule on top of the strip.
  const rule = ctx.createLinearGradient(0, 0, w, 0);
  rule.addColorStop(0, '#ff2e88');
  rule.addColorStop(0.5, '#ff7a3d');
  rule.addColorStop(1, '#22d3ee');
  ctx.fillStyle = rule;
  ctx.fillRect(0, stripY, w, Math.max(3, h * 0.004));

  // Lettering: tagline small and spaced, caption huge with a hard shadow.
  // The block sits high enough in the strip to leave dark air below it.
  ctx.save();
  ctx.translate(w / 2, stripY + stripH * 0.56);
  ctx.rotate(-0.021);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (tagline) {
    const tagSize = Math.max(16, Math.round(stripH * 0.13));
    ctx.font = `bold ${tagSize}px 'Arial Narrow', sans-serif`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(tagSize * 0.42)}px`;
    ctx.fillStyle = '#ff5ea8';
    ctx.fillText(tagline, 0, -stripH * 0.34);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
  const capSize = fitCaptionFont(ctx, caption, w * 0.92, Math.round(stripH * 0.48));
  ctx.font = `${capSize}px Anton, 'Arial Narrow', sans-serif`;
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = Math.round(capSize * 0.06);
  ctx.shadowOffsetY = Math.round(capSize * 0.06);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(caption, 0, stripH * 0.2);
  ctx.restore();
}
