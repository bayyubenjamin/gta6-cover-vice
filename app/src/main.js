// Vice Cover Studio — wires the page: pick a photo, type a caption, choose
// a size, layout and grade, export the cover as a PNG. A `?shot=` query sets
// up a fixed scene for a screenshot instead (./shots.js). Photos are read on
// the person's own machine and never leave it.
import { drawCover, SIZES, GRADES } from './cover.js';
import { loadImage, runShot } from './shots.js';

const canvas = document.getElementById('cover');
const captionInput = document.getElementById('caption');
const taglineInput = document.getElementById('tagline');
const status = document.getElementById('status');
const exportButton = document.getElementById('export');
const photoInput = document.getElementById('photo');

const state = {
  photo: null,
  photoName: 'boulevard',
  caption: 'Sunset Heist',
  tagline: 'Vice City',
  size: 'wide',
  layout: 'diagonal',
  grade: 'sunset',
};

let redrawQueued = false;

function redraw() {
  const size = SIZES[state.size];
  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  drawCover(canvas, state.photo, {
    caption: state.caption,
    tagline: state.tagline,
    size: state.size,
    layout: state.layout,
    grade: state.grade,
  });
}

function queueRedraw() {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => {
    redrawQueued = false;
    redraw();
  });
}

async function loadSample(name) {
  state.photoName = name;
  state.photo = await loadImage(`samples/${name}.jpg`);
  document.querySelectorAll('[data-sample]').forEach((button) => {
    button.classList.toggle('active', button.dataset.sample === name);
  });
  redraw();
}

function bindSegmented(groupId, key) {
  document.querySelectorAll(`#${groupId} [data-value]`).forEach((button) => {
    button.addEventListener('click', () => {
      state[key] = button.dataset.value;
      document.querySelectorAll(`#${groupId} [data-value]`).forEach((other) => {
        other.classList.toggle('active', other === button);
      });
      queueRedraw();
    });
  });
}

photoInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  state.photo = await loadImage(URL.createObjectURL(file));
  state.photoName = file.name;
  document.querySelectorAll('[data-sample]').forEach((button) => {
    button.classList.remove('active');
  });
  status.textContent = `Loaded ${file.name}.`;
  redraw();
});

document.querySelectorAll('[data-sample]').forEach((button) => {
  button.addEventListener('click', () => {
    loadSample(button.dataset.sample).catch(() => {
      status.textContent = 'That sample photo did not load.';
    });
  });
});

captionInput.addEventListener('input', () => {
  state.caption = captionInput.value;
  queueRedraw();
});
taglineInput.addEventListener('input', () => {
  state.tagline = taglineInput.value;
  queueRedraw();
});

bindSegmented('size-picker', 'size');
bindSegmented('layout-picker', 'layout');
bindSegmented('grade-picker', 'grade');

exportButton.addEventListener('click', () => {
  const size = SIZES[state.size];
  canvas.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'Export failed. Try again.';
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vice-cover-${size.w}x${size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status.textContent = `Saved vice-cover-${size.w}x${size.h}.png`;
  }, 'image/png');
});

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  runShot(shot, params, async (scene) => {
    state.photo = scene.photo;
    state.photoName = params.get('photo') ?? 'boulevard';
    state.caption = scene.caption;
    state.tagline = scene.tagline;
    state.size = scene.size;
    state.layout = scene.layout;
    state.grade = scene.grade;
    captionInput.value = scene.caption;
    taglineInput.value = scene.tagline;
    document.querySelectorAll('[data-sample]').forEach((button) => {
      button.classList.toggle('active', button.dataset.sample === state.photoName);
    });
    document.querySelectorAll('#size-picker [data-value]').forEach((button) => {
      button.classList.toggle('active', button.dataset.value === scene.size);
    });
    document.querySelectorAll('#layout-picker [data-value]').forEach((button) => {
      button.classList.toggle('active', button.dataset.value === scene.layout);
    });
    document.querySelectorAll('#grade-picker [data-value]').forEach((button) => {
      button.classList.toggle('active', button.dataset.value === scene.grade);
    });
    redraw();
  }).catch(() => {
    status.textContent = 'The screenshot scene did not load.';
    window.__shotReady = true;
  });
} else {
  loadSample('boulevard').catch(() => {
    status.textContent = 'Pick a photo to begin.';
    redraw();
  });
}
