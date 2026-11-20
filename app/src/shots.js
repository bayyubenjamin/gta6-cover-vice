// Vice Cover Studio — fixed screenshot scenes.
//
// `?shot=N` drives one reproducible scene so the screenshots are the
// same every time they are taken. Cover shots hide the editor chrome and
// fill the viewport with the exported cover; the editor shot shows the
// app with a photo loaded. Every scene sets window.__shotReady only
// after the font is in and the cover is fully drawn, so the screenshot
// tool never catches a half-rendered frame.
//
//   ?shot=1  cover, landscape 1920x1080, pier photo, "SUNSET HEIST"
//   ?shot=2  editor with a photo loaded (boulevard, "BOULEVARD QUEEN")
//   ?shot=3  cover, portrait 1080x1350, boulevard photo
//   ?shot=4  cover, square 1080x1080, neon photo, grade Neon Nights
//
// Overrides: &photo=<sample name>, &caption=<text>, &tagline=<text>,
// &grade=<sunset|neon>, &layout=<left|right|stack>.

(function () {
  'use strict';

  var SHOTS = {
    1: { kind: 'cover', size: 'landscape', photo: 'pier', caption: 'SUNSET HEIST', tagline: 'A Vice City story', layout: 'left', grade: 'sunset' },
    2: { kind: 'editor', size: 'landscape', photo: 'boulevard', caption: 'BOULEVARD QUEEN', tagline: 'Queen of the boulevard', layout: 'left', grade: 'sunset' },
    3: { kind: 'cover', size: 'portrait', photo: 'boulevard', caption: 'BOULEVARD QUEEN', tagline: 'Queen of the boulevard', layout: 'right', grade: 'sunset' },
    4: { kind: 'cover', size: 'square', photo: 'neon', caption: 'NEON NIGHTS', tagline: 'The city never sleeps', layout: 'left', grade: 'neon' }
  };

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function applyOverrides(shot, q) {
    var next = {
      kind: shot.kind,
      size: shot.size,
      photo: shot.photo,
      caption: shot.caption,
      tagline: shot.tagline,
      layout: shot.layout,
      grade: shot.grade
    };
    if (q.get('photo')) next.photo = q.get('photo');
    if (q.get('caption')) next.caption = q.get('caption');
    if (q.get('tagline')) next.tagline = q.get('tagline');
    if (q.get('grade')) next.grade = q.get('grade');
    if (q.get('layout')) next.layout = q.get('layout');
    if (q.get('size')) next.size = q.get('size');
    // &seed= re-seeds the skyline, for determinism checks. Default is
    // the fixed seed, so an unseeded shot is always the same poster.
    if (q.get('seed')) next.seed = parseInt(q.get('seed'), 10) || 20261120;
    return next;
  }

  // Draw the cover to fill the viewport exactly, for a cover shot.
  function showCoverShot(scene) {
    document.body.classList.add('cover-shot');
    var canvas = document.getElementById('preview');
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var size = window.ViceApp.sizes[scene.size] || window.ViceApp.sizes.landscape;
    // The viewport aspect matches the export aspect by construction, so
    // draw at the export size scaled to the viewport.
    return window.ViceCover.waitForAnton().then(function () {
      var ctx = canvas.getContext('2d');
      window.ViceCover.drawCover(ctx, window.ViceApp.state.photo, {
        width: w,
        height: h,
        caption: scene.caption,
        tagline: scene.tagline,
        layout: scene.layout,
        grade: scene.grade,
        seed: scene.seed
      });
      return size;
    });
  }

  // Let the browser settle before the screenshot: wait for the font to
  // be applied to the DOM text (not just loaded) and for two animation
  // frames to paint. Without this, the editor shot can catch the header
  // in its fallback font on a slow first paint, and the screenshot is
  // not byte-identical on retake.
  function settlePaint() {
    var fonts = (document.fonts && document.fonts.ready) || Promise.resolve();
    return fonts.then(function () {
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(resolve);
        });
      });
    });
  }

  // The editor shot: keep the normal UI, just make sure the right photo
  // and caption are in place and the preview has rendered.
  function showEditorShot(scene) {
    var captionEl = document.getElementById('caption');
    var taglineEl = document.getElementById('tagline');
    var sizeEl = document.getElementById('size');
    var layoutEl = document.getElementById('layout');
    var gradeEl = document.getElementById('grade');
    if (captionEl) captionEl.value = scene.caption;
    if (taglineEl) taglineEl.value = scene.tagline;
    if (sizeEl) sizeEl.value = scene.size;
    if (layoutEl) layoutEl.value = scene.layout;
    if (gradeEl) gradeEl.value = scene.grade;
    window.ViceApp.readControls();
    return window.ViceApp.renderPreview().then(settlePaint);
  }

  function runShot() {
    var q = params();
    var shotNum = q.get('shot');
    if (!shotNum || !SHOTS[shotNum]) {
      window.__shotReady = true;
      return Promise.resolve();
    }
    var scene = applyOverrides(SHOTS[shotNum], q);
    window.__shotName = 'shot-' + shotNum + '-' + scene.kind + '-' + scene.size;
    return window.ViceApp.ready().then(function () {
      return window.ViceApp.loadSample(scene.photo);
    }).then(function () {
      window.ViceApp.state.caption = scene.caption;
      window.ViceApp.state.tagline = scene.tagline;
      window.ViceApp.state.size = scene.size;
      window.ViceApp.state.layout = scene.layout;
      window.ViceApp.state.grade = scene.grade;
      if (scene.kind === 'cover') return showCoverShot(scene);
      return showEditorShot(scene);
    }).then(function () {
      window.__shotReady = true;
    }).catch(function (err) {
      // Never leave the screenshot tool hanging: signal ready even on
      // failure so the run fails loudly in the image, not in a timeout.
      window.__shotError = String(err && err.message ? err.message : err);
      window.__shotReady = true;
    });
  }

  window.ViceShots = { shots: SHOTS, run: runShot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runShot);
  } else {
    runShot();
  }
})();
