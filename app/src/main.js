// Vice Cover Studio — editor wiring.
//
// Connects the controls (photo upload, sample picker, caption, size,
// layout, grade, export) to the render engine in cover.js. The preview
// re-renders on every change, always after the Anton font is ready, so
// the lettering never falls back to a system font.

(function () {
  'use strict';

  var SIZES = {
    square: { label: 'Square 1080 x 1080', w: 1080, h: 1080 },
    portrait: { label: 'Portrait 1080 x 1350', w: 1080, h: 1350 },
    landscape: { label: 'Landscape 1920 x 1080', w: 1920, h: 1080 }
  };

  var SAMPLES = {
    boulevard: { label: 'Boulevard — midday', file: 'samples/boulevard.jpg' },
    neon: { label: 'Neon — night street', file: 'samples/neon.png' },
    pier: { label: 'Pier — sunset', file: 'samples/pier.jpg' }
  };

  var state = {
    photo: null,
    photoName: '',
    caption: 'VICE CITY',
    tagline: 'A new story begins',
    size: 'landscape',
    layout: 'left',
    grade: 'sunset'
  };

  var els = {};
  var renderQueued = false;
  var fontsReady = false;

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function currentSize() {
    return SIZES[state.size] || SIZES.landscape;
  }

  // Load an image element from a URL and wait until it decodes.
  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Could not load image: ' + url)); };
      img.src = url;
    });
  }

  function loadSample(name) {
    var sample = SAMPLES[name];
    if (!sample) return Promise.reject(new Error('Unknown sample: ' + name));
    setStatus('Loading sample: ' + sample.label + '…');
    return loadImage(sample.file).then(function (img) {
      state.photo = img;
      state.photoName = sample.label;
      markSampleButtons(name);
      return renderPreview();
    });
  }

  function markSampleButtons(activeName) {
    var buttons = document.querySelectorAll('[data-sample]');
    var i;
    for (i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute('data-sample') === activeName) {
        buttons[i].classList.add('active');
      } else {
        buttons[i].classList.remove('active');
      }
    }
  }

  function loadUpload(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      setStatus('Please choose an image file.');
      return Promise.resolve();
    }
    setStatus('Loading your photo…');
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        loadImage(reader.result).then(function (img) {
          state.photo = img;
          state.photoName = file.name;
          markSampleButtons('');
          resolve(renderPreview());
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // Re-render the preview. Always waits for Anton first (the font-race
  // fix), and coalesces rapid changes into a single render.
  function renderPreview() {
    if (renderQueued) return Promise.resolve();
    renderQueued = true;
    return Promise.resolve().then(function () {
      return fontsReady ? null : window.ViceCover.waitForAnton().then(function () {
        fontsReady = true;
      });
    }).then(function () {
      renderQueued = false;
      if (!state.photo || !els.preview) return;
      var size = currentSize();
      var scale = Math.min(1, 880 / size.w);
      var pw = Math.round(size.w * scale);
      var ph = Math.round(size.h * scale);
      if (els.preview.width !== pw) els.preview.width = pw;
      if (els.preview.height !== ph) els.preview.height = ph;
      var ctx = els.preview.getContext('2d');
      window.ViceCover.drawCover(ctx, state.photo, {
        width: pw,
        height: ph,
        caption: state.caption,
        tagline: state.tagline,
        layout: state.layout,
        grade: state.grade
      });
      setStatus(
        'Preview: ' + size.label + ' · layout ' + state.layout +
        ' · grade ' + state.grade + ' · photo: ' + state.photoName
      );
    });
  }

  // Export the full-size PNG and trigger a download.
  function exportPNG() {
    if (!state.photo) {
      setStatus('Load a photo first.');
      return Promise.resolve();
    }
    setStatus('Rendering export…');
    return window.ViceCover.waitForAnton().then(function () {
      var size = currentSize();
      var canvas = window.ViceCover.renderCover(state.photo, {
        width: size.w,
        height: size.h,
        caption: state.caption,
        tagline: state.tagline,
        layout: state.layout,
        grade: state.grade
      });
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob) {
            setStatus('Export failed: the browser could not make the PNG.');
            resolve();
            return;
          }
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'vice-cover-' + state.layout + '-' + state.grade + '-' + size.w + 'x' + size.h + '.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
          setStatus('Exported vice-cover-' + state.layout + '-' + state.grade + '-' + size.w + 'x' + size.h + '.png');
          resolve();
        }, 'image/png');
      });
    });
  }

  function readControls() {
    state.caption = els.caption.value || 'VICE CITY';
    state.tagline = els.tagline.value || '';
    state.size = els.size.value;
    state.layout = els.layout.value;
    state.grade = els.grade.value;
  }

  function bindControls() {
    els.photoInput.addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (file) loadUpload(file);
    });
    var sampleButtons = document.querySelectorAll('[data-sample]');
    var i;
    for (i = 0; i < sampleButtons.length; i++) {
      sampleButtons[i].addEventListener('click', function (ev) {
        var name = ev.currentTarget.getAttribute('data-sample');
        loadSample(name);
      });
    }
    var inputs = [els.caption, els.tagline, els.size, els.layout, els.grade];
    for (i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener('input', function () {
        readControls();
        renderPreview();
      });
      inputs[i].addEventListener('change', function () {
        readControls();
        renderPreview();
      });
    }
    els.exportBtn.addEventListener('click', exportPNG);
    // Keyboard shortcut: press "e" anywhere outside a text field to
    // export the current cover.
    document.addEventListener('keydown', function (ev) {
      var tag = (ev.target && ev.target.tagName) || '';
      if (ev.key === 'e' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
        exportPNG();
      }
    });
  }

  // Boot the editor: grab the elements, wire the controls, load the
  // default sample and render the first preview.
  function init() {
    els = {
      preview: $('preview'),
      status: $('status'),
      photoInput: $('photo-input'),
      caption: $('caption'),
      tagline: $('tagline'),
      size: $('size'),
      layout: $('layout'),
      grade: $('grade'),
      exportBtn: $('export-btn')
    };
    bindControls();
    readControls();
    return loadSample('boulevard');
  }

  var readyPromise = null;
  function ready() {
    if (!readyPromise) readyPromise = init();
    return readyPromise;
  }

  window.ViceApp = {
    state: state,
    sizes: SIZES,
    samples: SAMPLES,
    loadSample: loadSample,
    loadUpload: loadUpload,
    renderPreview: renderPreview,
    exportPNG: exportPNG,
    readControls: readControls,
    ready: ready
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
