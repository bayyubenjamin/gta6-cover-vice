// Vice Cover Studio — render engine.
//
// Turns one photo plus a caption into a GTA-style five-panel poster:
// a hero portrait, three re-cropped vignettes of the same photo, and a
// procedurally drawn neon skyline strip with bold lettering. Everything
// is deterministic: one fixed seed drives the skyline, and the colour
// grade is computed per pixel, so the same inputs always draw the same
// poster. Loaded as a classic script; all names below are globals.

(function () {
  'use strict';

  // Seeded random: mulberry32. One seed in, one repeatable stream out.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clampByte(v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return v | 0;
  }

  // The two cinematic grades. Each tints the shadows toward teal and
  // the highlights toward a warm or pink colour, then adds a little
  // contrast. shadowAmt / highAmt are the strongest mix at the extremes.
  var GRADES = {
    sunset: {
      label: 'Vice Sunset',
      shadow: [0, 138, 148],
      shadowAmt: 0.55,
      high: [255, 176, 102],
      highAmt: 0.5,
      contrast: 1.08
    },
    neon: {
      label: 'Neon Nights',
      shadow: [0, 118, 172],
      shadowAmt: 0.6,
      high: [255, 110, 190],
      highAmt: 0.55,
      contrast: 1.1
    }
  };

  function gradeNames() {
    return Object.keys(GRADES);
  }

  // Apply one grade to an ImageData in place, pixel by pixel.
  function applyGrade(imageData, gradeName) {
    var cfg = GRADES[gradeName] || GRADES.sunset;
    var d = imageData.data;
    var i, r, g, b, lum, t, sAmt, hAmt;
    for (i = 0; i < d.length; i += 4) {
      r = d[i];
      g = d[i + 1];
      b = d[i + 2];
      lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      t = lum / 255;
      // Shadows drift toward teal; the darker the pixel, the stronger.
      sAmt = (1 - t) * (1 - t) * cfg.shadowAmt;
      r = r * (1 - sAmt) + cfg.shadow[0] * sAmt;
      g = g * (1 - sAmt) + cfg.shadow[1] * sAmt;
      b = b * (1 - sAmt) + cfg.shadow[2] * sAmt;
      // Highlights drift toward warm (sunset) or pink (neon).
      hAmt = t * t * cfg.highAmt;
      r = r * (1 - hAmt) + cfg.high[0] * hAmt;
      g = g * (1 - hAmt) + cfg.high[1] * hAmt;
      b = b * (1 - hAmt) + cfg.high[2] * hAmt;
      // A gentle S-curve for contrast.
      r = 128 + (r - 128) * cfg.contrast;
      g = 128 + (g - 128) * cfg.contrast;
      b = 128 + (b - 128) * cfg.contrast;
      d[i] = clampByte(r);
      d[i + 1] = clampByte(g);
      d[i + 2] = clampByte(b);
    }
    return imageData;
  }

  // Bake the grade into the photo once, on an offscreen canvas, and
  // cache it per photo + grade so a re-render is cheap. The bake is
  // capped at 1600 px on the long side to keep the per-pixel pass fast.
  var gradedCache = new Map();
  function getGradedPhoto(img, gradeName) {
    var key = (img.currentSrc || img.src || '') + '|' + gradeName;
    var hit = gradedCache.get(key);
    if (hit) return hit;
    var scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * scale));
    var h = Math.max(1, Math.round(img.naturalHeight * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    var data = ctx.getImageData(0, 0, w, h);
    applyGrade(data, gradeName);
    ctx.putImageData(data, 0, 0);
    gradedCache.set(key, canvas);
    return canvas;
  }

  // Layouts. Each returns the poster geometry for a canvas of width x
  // height: the hero panel, three vignettes and the title strip. Every
  // panel is a polygon (for the diagonal cuts) plus a crop describing
  // which part of the photo it shows: cx/cy is the focus point (0..1)
  // and zoom is how far in (1 = fit the panel, higher = closer).
  function computePanels(width, height, layout) {
    var titleH = Math.round(height * 0.22);
    var photoH = height - titleH;
    var slant = Math.round(width * 0.025);
    var heroW = Math.round(width * 0.55);
    var panels = { title: { x: 0, y: photoH, w: width, h: titleH } };

    if (layout === 'right') {
      // Hero on the right, vignettes stacked on the left.
      panels.hero = {
        points: [[width - heroW, 0], [width, 0], [width, photoH], [width - heroW - slant, photoH]],
        bounds: { x: width - heroW - slant, y: 0, w: heroW + slant, h: photoH },
        crop: { cx: 0.5, cy: 0.45, zoom: 1.0 }
      };
      panels.vignettes = vignetteColumn(width, photoH, heroW, slant, true);
    } else if (layout === 'stack') {
      // Hero across the top, three vignettes in a row underneath.
      var heroH = Math.round(photoH * 0.55);
      panels.hero = {
        points: [[0, 0], [width, 0], [width, heroH], [0, heroH]],
        bounds: { x: 0, y: 0, w: width, h: heroH },
        crop: { cx: 0.5, cy: 0.4, zoom: 1.0 }
      };
      panels.vignettes = vignetteRow(width, photoH, heroH, slant);
    } else {
      // 'left' (default): hero on the left, vignettes stacked right.
      panels.hero = {
        points: [[0, 0], [heroW, 0], [heroW + slant, photoH], [0, photoH]],
        bounds: { x: 0, y: 0, w: heroW + slant, h: photoH },
        crop: { cx: 0.5, cy: 0.45, zoom: 1.0 }
      };
      panels.vignettes = vignetteColumn(width, photoH, heroW, slant, false);
    }
    return panels;
  }

  // Three stacked vignettes beside the hero. The left edge of each one
  // follows the hero's slanted edge; the dividers between them slope a
  // little so the whole column feels diagonal too. The OUTER edges — the
  // top of the first vignette and the bottom of the last — stay flat on
  // the canvas edge: a divider that dips past the canvas leaves a black
  // triangle nothing ever paints over.
  function vignetteColumn(width, photoH, heroW, slant, mirrored) {
    var crops = [
      { cx: 0.5, cy: 0.5, zoom: 0.72 },   // wide: the whole scene
      { cx: 0.62, cy: 0.55, zoom: 1.6 },  // detail: zoomed in close
      { cx: 0.5, cy: 0.16, zoom: 1.05 }   // sky: the top of the photo
    ];
    var out = [];
    var rowH = photoH / 3;
    var dip = slant * 0.35;
    var i, yTop, yBot;
    for (i = 0; i < 3; i++) {
      yTop = Math.round(rowH * i);
      yBot = Math.round(rowH * (i + 1));
      if (mirrored) {
        // Vignettes on the left, hero on the right. The right edge of
        // each vignette follows the hero's slanted left edge.
        var xTR = width - heroW - slant + (slant * yTop) / photoH;
        var xBR = width - heroW - slant + (slant * yBot) / photoH;
        // Divider dips toward the outer (left) edge; outer edges flat.
        var topL = i === 0 ? yTop : yTop - dip;
        var botL = i === 2 ? yBot : yBot - dip;
        out.push({
          points: [[0, topL], [xTR, yTop], [xBR, yBot], [0, botL]],
          bounds: { x: 0, y: Math.min(topL, yTop), w: xBR, h: Math.max(botL, yBot) - Math.min(topL, yTop) },
          crop: crops[i]
        });
      } else {
        // Vignettes on the right, hero on the left. The left edge of
        // each vignette follows the hero's slanted right edge.
        var xTL = heroW + (slant * yTop) / photoH;
        var xBL = heroW + (slant * yBot) / photoH;
        // Divider dips toward the outer (right) edge; outer edges flat.
        var topR = i === 0 ? yTop : yTop - dip;
        var botR = i === 2 ? yBot : yBot - dip;
        out.push({
          points: [[xTL, yTop], [width, topR], [width, botR], [xBL, yBot]],
          bounds: { x: xTL, y: Math.min(yTop, topR), w: width - xTL, h: Math.max(yBot, botR) - Math.min(yTop, topR) },
          crop: crops[i]
        });
      }
    }
    return out;
  }

  // Three vignettes side by side under the hero, dividers slanted.
  function vignetteRow(width, photoH, heroH, slant) {
    var crops = [
      { cx: 0.5, cy: 0.5, zoom: 0.72 },
      { cx: 0.62, cy: 0.55, zoom: 1.6 },
      { cx: 0.5, cy: 0.16, zoom: 1.05 }
    ];
    var out = [];
    var colW = width / 3;
    var i, x0, x1;
    for (i = 0; i < 3; i++) {
      x0 = Math.round(colW * i);
      x1 = Math.round(colW * (i + 1));
      out.push({
        points: [[x0, heroH], [x1, heroH], [x1 + slant * 0.4, photoH], [x0 + slant * 0.4, photoH]],
        bounds: { x: x0, y: heroH, w: x1 - x0 + slant * 0.4, h: photoH - heroH },
        crop: crops[i]
      });
    }
    return out;
  }

  // Which rectangle of the source image fills a panel of the given size,
  // centred on (cx, cy) at the given zoom. Classic cover-fit math, with
  // one guard that matters: a zoom below 1 asks to show MORE than the
  // whole photo, which is impossible — the source rectangle would spill
  // past the image and drawImage would leave those parts unpainted
  // (a black triangle in the panel). So the rectangle is first fitted
  // to the image, then zoomed in from there, never out past the edges.
  function coverSourceRect(sw, sh, bw, bh, cx, cy, zoom) {
    var panelAspect = bw / bh;
    // The largest rectangle of the panel's aspect that fits the image.
    var rwFit = Math.min(sw, sh * panelAspect);
    var rhFit = rwFit / panelAspect;
    // Zoom in from the fit (zoom > 1 = closer). Zoom < 1 is capped at
    // the fit: you cannot show more than the whole photo.
    var rw = Math.min(rwFit, rwFit / zoom);
    var rh = Math.min(rhFit, rhFit / zoom);
    var sx = cx * sw - rw / 2;
    var sy = cy * sh - rh / 2;
    if (sx < 0) sx = 0;
    if (sy < 0) sy = 0;
    if (sx + rw > sw) sx = sw - rw;
    if (sy + rh > sh) sy = sh - rh;
    return { sx: sx, sy: sy, sw: rw, sh: rh };
  }

  function clipPolygon(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    var i;
    for (i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.clip();
  }

  // Draw one panel: clip to its polygon, paint the graded photo's crop
  // into it, then stroke the diagonal edge in a pale line. The photo is
  // drawn to cover the polygon's own bounding box — not the stored
  // bounds — because the slanted edges and divider dips make the
  // polygon stick out past its bounds, and any part the photo does not
  // cover would show the dark background as a black triangle.
  function drawPanel(ctx, source, panel) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var i, p;
    for (i = 0; i < panel.points.length; i++) {
      p = panel.points[i];
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    var bw = maxX - minX;
    var bh = maxY - minY;
    ctx.save();
    clipPolygon(ctx, panel.points);
    var src = coverSourceRect(source.width, source.height, bw, bh, panel.crop.cx, panel.crop.cy, panel.crop.zoom);
    ctx.drawImage(source, src.sx, src.sy, src.sw, src.sh, minX, minY, bw, bh);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(panel.points[0][0], panel.points[0][1]);
    for (i = 1; i < panel.points.length; i++) ctx.lineTo(panel.points[i][0], panel.points[i][1]);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255, 235, 220, 0.85)';
    ctx.lineWidth = Math.max(2, Math.round(bh * 0.006));
    ctx.stroke();
    ctx.restore();
  }

  // The procedural skyline for the title strip. Sky gradient, a sun disc
  // with scanline gaps, seeded building silhouettes with lit windows and
  // a few palm silhouettes. Same seed, same skyline, every time.
  function drawSkyline(ctx, rect, seed, gradeName) {
    var rng = mulberry32(seed);
    var x = rect.x, y = rect.y, w = rect.w, h = rect.h;
    var horizon = y + h * 0.62;

    // Sky: deep violet up top, warm at the horizon.
    var sky = ctx.createLinearGradient(0, y, 0, y + h);
    if (gradeName === 'neon') {
      sky.addColorStop(0, '#160b2e');
      sky.addColorStop(0.55, '#3b1155');
      sky.addColorStop(1, '#ff2e88');
    } else {
      sky.addColorStop(0, '#1a0b2e');
      sky.addColorStop(0.55, '#7a1e4d');
      sky.addColorStop(1, '#ff7a3c');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h);

    // Sun disc with scanline gaps: draw the disc, then cut dark bars
    // across its lower half in the sky's top colour.
    var sunR = h * 0.34;
    var sunX = x + w * 0.76;
    var sunY = y + h * 0.42;
    var sun = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR);
    sun.addColorStop(0, '#fff6d8');
    sun.addColorStop(0.6, '#ffd166');
    sun.addColorStop(1, '#ff7a3c');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = gradeName === 'neon' ? '#3b1155' : '#7a1e4d';
    var gap, gy;
    for (gap = 0; gap < 4; gap++) {
      gy = sunY + sunR * 0.05 + gap * sunR * 0.22;
      ctx.fillRect(sunX - sunR - 2, gy, sunR * 2 + 4, Math.max(2, sunR * 0.07));
    }

    // Buildings: dark slabs along the horizon, heights from the seed.
    var bx = x;
    while (bx < x + w) {
      var bw = w * (0.04 + rng() * 0.05);
      var bh = h * (0.18 + rng() * 0.38);
      ctx.fillStyle = '#12061f';
      ctx.fillRect(bx, horizon - bh, bw, bh + (y + h - horizon));
      // Lit windows: a seeded scatter of warm or cyan dots.
      var wx, wy;
      for (wy = horizon - bh + 6; wy < horizon - 6; wy += 11) {
        for (wx = bx + 5; wx < bx + bw - 5; wx += 9) {
          if (rng() < 0.32) {
            ctx.fillStyle = rng() < 0.7 ? '#ffd166' : '#22d3ee';
            ctx.fillRect(wx, wy, 4, 6);
          }
        }
      }
      bx += bw + w * 0.006;
    }

    // Palm silhouettes: a curved trunk and fanning fronds, in the dark.
    ctx.strokeStyle = '#12061f';
    ctx.fillStyle = '#12061f';
    var p, px, py, topX, topY, f, ang;
    for (p = 0; p < 3; p++) {
      px = x + w * (0.08 + p * 0.06 + rng() * 0.03);
      py = y + h;
      topX = px + (rng() - 0.5) * w * 0.03;
      topY = y + h * (0.28 + rng() * 0.12);
      ctx.lineWidth = Math.max(3, w * 0.004);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + (topX - px) * 0.4, py - (py - topY) * 0.6, topX, topY);
      ctx.stroke();
      for (f = 0; f < 6; f++) {
        ang = Math.PI * (0.08 + (f / 5) * 0.84);
        var fx = topX + Math.cos(ang) * w * 0.035;
        var fy = topY + Math.sin(ang) * h * 0.28 - h * 0.1;
        ctx.lineWidth = Math.max(2, w * 0.0022);
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + (fx - topX) * 0.5, topY - h * 0.12, fx, fy);
        ctx.stroke();
      }
    }
  }

  // Caption lettering over the skyline: a big Anton title with a dark
  // shadow so it stays readable, plus a small letterspaced tagline.
  function drawLettering(ctx, rect, caption, tagline) {
    var pad = Math.round(rect.w * 0.03);
    var titleSize = Math.round(rect.h * 0.52);
    var tagSize = Math.round(rect.h * 0.17);
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    // A soft dark wash behind the text keeps it readable over windows.
    var wash = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    wash.addColorStop(0, 'rgba(10, 4, 18, 0)');
    wash.addColorStop(1, 'rgba(10, 4, 18, 0.55)');
    ctx.fillStyle = wash;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.font = titleSize + 'px Anton, "Arial Black", sans-serif';
    ctx.fillStyle = '#fff7ec';
    ctx.shadowColor = 'rgba(10, 4, 18, 0.8)';
    ctx.shadowBlur = Math.round(titleSize * 0.08);
    ctx.shadowOffsetY = Math.round(titleSize * 0.03);
    ctx.fillText((caption || 'VICE CITY').toUpperCase(), rect.x + pad, rect.y + rect.h - tagSize - pad * 0.4);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.font = '700 ' + tagSize + 'px "Arial Narrow", Arial, sans-serif';
    ctx.fillStyle = '#ffd166';
    var tag = (tagline || '').toUpperCase();
    if (tag) {
      // Letterspace by hand: draw the tagline with wide tracking.
      var tx = rect.x + pad;
      var ty = rect.y + rect.h - pad * 0.35;
      var ch;
      for (ch = 0; ch < tag.length; ch++) {
        ctx.fillText(tag[ch], tx, ty);
        tx += ctx.measureText(tag[ch]).width + tagSize * 0.28;
      }
    }
    ctx.restore();
  }

  // Compose the whole poster into ctx at the given size.
  function drawCover(ctx, photo, opts) {
    var width = opts.width;
    var height = opts.height;
    var layout = opts.layout || 'left';
    var gradeName = opts.grade || 'sunset';
    var seed = opts.seed == null ? 20261120 : opts.seed;
    var graded = getGradedPhoto(photo, gradeName);
    var panels = computePanels(width, height, layout);

    ctx.fillStyle = '#0d0b12';
    ctx.fillRect(0, 0, width, height);
    drawPanel(ctx, graded, panels.hero);
    var i;
    for (i = 0; i < panels.vignettes.length; i++) drawPanel(ctx, graded, panels.vignettes[i]);
    drawSkyline(ctx, panels.title, seed, gradeName);
    drawLettering(ctx, panels.title, opts.caption, opts.tagline);
    drawFrame(ctx, width, height);

    // A faint cinematic vignette over the whole poster.
    var vg = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.42,
      width / 2, height / 2, Math.max(width, height) * 0.75
    );
    vg.addColorStop(0, 'rgba(10, 4, 18, 0)');
    vg.addColorStop(1, 'rgba(10, 4, 18, 0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, width, height);
  }

  // A thin poster frame: a pale border inset a few pixels, with small
  // corner ticks. It reads as the edge of a printed poster.
  function drawFrame(ctx, width, height) {
    var inset = Math.max(6, Math.round(Math.min(width, height) * 0.008));
    var tick = Math.max(14, Math.round(Math.min(width, height) * 0.03));
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 235, 220, 0.9)';
    ctx.lineWidth = Math.max(2, Math.round(Math.min(width, height) * 0.003));
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
    ctx.lineWidth = Math.max(3, Math.round(Math.min(width, height) * 0.005));
    var corners = [
      [inset, inset, 1, 1],
      [width - inset, inset, -1, 1],
      [inset, height - inset, 1, -1],
      [width - inset, height - inset, -1, -1]
    ];
    var c;
    for (c = 0; c < corners.length; c++) {
      var cx = corners[c][0], cy = corners[c][1];
      var dx = corners[c][2], dy = corners[c][3];
      ctx.beginPath();
      ctx.moveTo(cx + dx * tick, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * tick);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Make a fresh canvas at the requested size and draw the cover in it.
  function renderCover(photo, opts) {
    var canvas = document.createElement('canvas');
    canvas.width = opts.width;
    canvas.height = opts.height;
    var ctx = canvas.getContext('2d');
    drawCover(ctx, photo, opts);
    return canvas;
  }

  // The font-race fix: never draw lettering before Anton is really in.
  // Returns a promise that resolves once the font is loaded (or, after a
  // short wait, once the browser gives up so the app never hangs).
  function waitForAnton() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var loaded = Promise.all([
      document.fonts.load('64px Anton'),
      document.fonts.load('700 20px "Arial Narrow"')
    ]).then(function () { return document.fonts.ready; });
    var timeout = new Promise(function (resolve) {
      setTimeout(resolve, 4000);
    });
    return Promise.race([loaded, timeout]);
  }

  window.ViceCover = {
    mulberry32: mulberry32,
    gradeNames: gradeNames,
    applyGrade: applyGrade,
    getGradedPhoto: getGradedPhoto,
    computePanels: computePanels,
    drawSkyline: drawSkyline,
    drawCover: drawCover,
    renderCover: renderCover,
    waitForAnton: waitForAnton
  };
})();
