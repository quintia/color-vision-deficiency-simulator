import { FILTERS, applyCvdFilter } from "./filter.js";

const fileInput = document.getElementById("file-input");
const filterSelect = document.getElementById("filter-select");
const canvasWrap = document.getElementById("canvas-wrap");
const canvas = document.getElementById("canvas");
const emptyState = document.getElementById("empty");
const dropHint = document.getElementById("drop-hint");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const zoomRange = document.getElementById("zoom-range");
const zoomIn = document.getElementById("zoom-in");
const zoomOut = document.getElementById("zoom-out");
const zoom100 = document.getElementById("zoom-100");
const zoomFit = document.getElementById("zoom-fit");

let originalImage = null;
let filteredCanvas = null;
let imageSize = { width: 0, height: 0 };

const viewState = {
  scale: 1,
  minScale: 0.2,
  maxScale: 4,
  offsetX: 0,
  offsetY: 0
};

zoomRange.min = viewState.minScale;
zoomRange.max = viewState.maxScale;
zoomRange.value = viewState.scale;

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function clampScale(value) {
  return clamp(value, viewState.minScale, viewState.maxScale);
}

function render() {
  if (!filteredCanvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const drawWidth = imageSize.width * viewState.scale;
  const drawHeight = imageSize.height * viewState.scale;
  const originX = (canvas.width - drawWidth) / 2 + viewState.offsetX;
  const originY = (canvas.height - drawHeight) / 2 + viewState.offsetY;

  ctx.drawImage(filteredCanvas, originX, originY, drawWidth, drawHeight);
}

function updateZoomUI() {
  zoomRange.value = viewState.scale.toFixed(2);
}

function setScale(newScale, anchor = null) {
  const clamped = clampScale(newScale);
  if (!anchor) {
    viewState.scale = clamped;
    updateZoomUI();
    render();
    return;
  }

  const drawWidth = imageSize.width * viewState.scale;
  const drawHeight = imageSize.height * viewState.scale;
  const originX = (canvas.width - drawWidth) / 2 + viewState.offsetX;
  const originY = (canvas.height - drawHeight) / 2 + viewState.offsetY;

  const imageX = (anchor.x - originX) / viewState.scale;
  const imageY = (anchor.y - originY) / viewState.scale;

  viewState.scale = clamped;

  const nextDrawWidth = imageSize.width * viewState.scale;
  const nextDrawHeight = imageSize.height * viewState.scale;
  const nextOriginX = anchor.x - imageX * viewState.scale;
  const nextOriginY = anchor.y - imageY * viewState.scale;

  viewState.offsetX = nextOriginX - (canvas.width - nextDrawWidth) / 2;
  viewState.offsetY = nextOriginY - (canvas.height - nextDrawHeight) / 2;

  updateZoomUI();
  render();
}

function fitToFrame() {
  if (!imageSize.width) return;
  const scale = Math.min(
    canvas.width / imageSize.width,
    canvas.height / imageSize.height
  );
  viewState.scale = clampScale(scale);
  viewState.offsetX = 0;
  viewState.offsetY = 0;
  updateZoomUI();
  render();
}

function applyFilter(name) {
  if (!originalImage) return;
  const imageData = applyCvdFilter(originalImage, name);
  filteredCanvas.getContext("2d", { willReadFrequently: true }).putImageData(imageData, 0, 0);
  render();
}

async function loadImage(file) {
  const image = await createImageBitmap(file);

  const maxWidth = 1400;
  const scale = Math.min(1, maxWidth / image.width);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0, width, height);
  originalImage = sourceCtx.getImageData(0, 0, width, height);

  filteredCanvas = document.createElement("canvas");
  filteredCanvas.width = width;
  filteredCanvas.height = height;

  imageSize = { width, height };

  emptyState.style.display = "none";
  fitToFrame();
  applyFilter(filterSelect.value);
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  loadImage(file).catch((error) => {
    console.error(error);
  });
});

function handleFileDrop(file) {
  if (!file || !file.type.startsWith("image/")) return;
  loadImage(file).catch((error) => {
    console.error(error);
  });
}

canvasWrap.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dropHint.classList.add("active");
});

canvasWrap.addEventListener("dragover", (event) => {
  event.preventDefault();
});

canvasWrap.addEventListener("dragleave", (event) => {
  if (event.currentTarget === canvasWrap) {
    dropHint.classList.remove("active");
  }
});

canvasWrap.addEventListener("drop", (event) => {
  event.preventDefault();
  dropHint.classList.remove("active");
  const file = event.dataTransfer?.files?.[0];
  handleFileDrop(file);
});

filterSelect.addEventListener("change", () => {
  applyFilter(filterSelect.value);
});

zoomIn.addEventListener("click", () => {
  setScale(viewState.scale * 1.1);
});

zoomOut.addEventListener("click", () => {
  setScale(viewState.scale / 1.1);
});

zoom100.addEventListener("click", () => {
  viewState.offsetX = 0;
  viewState.offsetY = 0;
  setScale(1);
});

zoomFit.addEventListener("click", () => {
  fitToFrame();
});

zoomRange.addEventListener("input", (event) => {
  setScale(parseFloat(event.target.value));
});

canvas.addEventListener("wheel", (event) => {
  if (!imageSize.width) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  const delta = event.deltaY < 0 ? 1.08 : 1 / 1.08;
  setScale(viewState.scale * delta, anchor);
}, { passive: false });

let dragging = false;
let lastPoint = { x: 0, y: 0 };

canvas.addEventListener("pointerdown", (event) => {
  if (!imageSize.width) return;
  dragging = true;
  lastPoint = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const dx = event.clientX - lastPoint.x;
  const dy = event.clientY - lastPoint.y;
  viewState.offsetX += dx;
  viewState.offsetY += dy;
  lastPoint = { x: event.clientX, y: event.clientY };
  render();
});

canvas.addEventListener("pointerup", (event) => {
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointerleave", () => {
  dragging = false;
});

const resizeObserver = new ResizeObserver(() => {
  const rect = canvas.getBoundingClientRect();
  const nextWidth = Math.max(1, Math.floor(rect.width));
  const nextHeight = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    render();
  }
});

resizeObserver.observe(canvas);
