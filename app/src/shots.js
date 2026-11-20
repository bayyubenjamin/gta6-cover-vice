// Fixed scenes for screenshots: `?shot=editor` shows the page with a sample
// photo loaded; `?shot=cover` shows the cover alone, full-bleed. `photo`
// picks the sample (samples/<photo>.jpg), `caption` and `tagline` the words,
// `size` the export size, `layout` the panel layout, `grade` the colour
// grade. window.__shotReady is set once the scene has painted, so a
// screenshot tool knows when to capture.

/** Loads an image from a URL, resolving to the image once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cannot load ${url}`));
    img.src = url;
  });
}

function markReady() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__shotReady = true;
  }));
}

export async function runShot(shot, query, setup) {
  const photoName = query.get('photo') ?? 'boulevard';
  const caption = query.get('caption') ?? 'Sunset Heist';
  const tagline = query.get('tagline') ?? 'Vice City';
  const size = query.get('size') ?? 'wide';
  const layout = query.get('layout') ?? 'diagonal';
  const grade = query.get('grade') ?? 'sunset';
  if (shot === 'cover') document.body.classList.add('shot-cover');
  const scene = {
    photo: await loadImage(`samples/${photoName}.jpg`),
    caption,
    tagline,
    size,
    layout,
    grade,
  };
  await setup(scene);
  // The display font must be in before the capture, or the lettering falls
  // back to a generic sans and the shot is not the real cover.
  try {
    await Promise.race([
      document.fonts.load('100px Anton').then(() => document.fonts.ready),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // A missing font still renders: the canvas falls back to Arial Narrow.
  }
  // The first draw may have run before Anton arrived, leaving fallback
  // lettering baked into the canvas; draw once more now that the font is
  // in, so the shot is reproducible instead of a race.
  await setup(scene);
  markReady();
}
