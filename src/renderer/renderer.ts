// Renderer process — drawing canvas + optional region selection + report panel logic
export {};

declare global {
  interface Window {
    snapport: {
      closeOverlay: () => void;
      sendReport: (payload: {
        webhookUrl: string;
        comment: string;
        imageDataUrl: string;
      }) => Promise<{ ok: boolean; status?: number; error?: string }>;
      onScreenshot: (callback: (dataUrl: string | null) => void) => void;
      onUpdateAvailable: (callback: () => void) => void;
      onUpdateDownloaded: (callback: () => void) => void;
      installUpdate: () => void;
    };
  }
}

// ── Canvas setup ──────────────────────────────────────────

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

function resizeCanvas(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// ── Screenshot background ─────────────────────────────────

const screenshotBg = document.getElementById("screenshot-bg") as HTMLImageElement;
let screenshotDataUrl: string | null = null;

window.snapport.onScreenshot((dataUrl) => {
  screenshotDataUrl = dataUrl;
  if (dataUrl) {
    screenshotBg.src = dataUrl;
    screenshotBg.style.display = "block";
  }
});

// ── Update banner ─────────────────────────────────────────

const updateBanner = document.getElementById("update-banner")!;
const updateMsg = document.getElementById("update-msg")!;
const updateInstallBtn = document.getElementById("update-install-btn")!;
const updateDismissBtn = document.getElementById("update-dismiss-btn")!;

window.snapport.onUpdateAvailable(() => {
  updateMsg.textContent = "Downloading update…";
  updateInstallBtn.classList.add("hidden");
  updateBanner.classList.remove("hidden");
});

window.snapport.onUpdateDownloaded(() => {
  updateMsg.textContent = "Update ready —";
  updateInstallBtn.classList.remove("hidden");
  updateBanner.classList.remove("hidden");
});

updateInstallBtn.addEventListener("click", () => window.snapport.installUpdate());
updateDismissBtn.addEventListener("click", () => updateBanner.classList.add("hidden"));

// ── Element references ────────────────────────────────────

const selectionOverlay = document.getElementById("selection-overlay")!;
const selectionHint = document.getElementById("selection-hint")!;
const maskCutout = document.getElementById("mask-cutout")!;
const selectionBorder = document.getElementById("selection-border")!;
const toolbar = document.getElementById("toolbar")!;
const reportPanel = document.getElementById("report-panel")!;
const regionBtn = document.getElementById("region-btn")!;

// ── State ─────────────────────────────────────────────────

type Phase = "annotate" | "selecting";
type Tool = "pen" | "rect" | "arrow";

let phase: Phase = "annotate";
let activeTool: Tool = "pen";
let activeColor = "#EF4444";
let brushSize = 4;
let isDrawing = false;
let startX = 0;
let startY = 0;

// Selection region (screen coordinates) — null means fullscreen
let selStartX = 0;
let selStartY = 0;
let selRegion: { x: number; y: number; w: number; h: number } | null = null;
let isSelecting = false;

// Snapshot stack for undo
const snapshots: ImageData[] = [];

function saveSnapshot(): void {
  snapshots.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

// ── Full-screen "selected" state (no dimming) ────────────
// Setting the SVG mask cutout to cover the entire viewport makes
// the dark overlay fully transparent → screen appears bright.

function setFullScreenSelected(): void {
  maskCutout.setAttribute("x", "0");
  maskCutout.setAttribute("y", "0");
  maskCutout.setAttribute("width", String(window.innerWidth));
  maskCutout.setAttribute("height", String(window.innerHeight));
  selectionBorder.style.display = "none";
}

// On launch the whole screen should be bright (no dark overlay)
setFullScreenSelected();
window.addEventListener("resize", () => {
  if (!selRegion && phase !== "selecting") setFullScreenSelected();
});

// ── Region selection ──────────────────────────────────────

regionBtn.addEventListener("click", () => {
  if (selRegion) {
    // Already have a region — clear it and go back to fullscreen
    clearRegion();
    return;
  }
  // Enter selection mode
  enterSelectionMode();
});

function enterSelectionMode(): void {
  phase = "selecting";
  // Reset cutout to zero so the full dark overlay is visible
  maskCutout.setAttribute("x", "0");
  maskCutout.setAttribute("y", "0");
  maskCutout.setAttribute("width", "0");
  maskCutout.setAttribute("height", "0");
  selectionHint.classList.remove("hidden");
  toolbar.classList.add("hidden");
  reportPanel.classList.add("hidden");
  canvas.style.cursor = "crosshair";
}

function clearRegion(): void {
  selRegion = null;
  phase = "annotate";
  regionBtn.classList.remove("active");
  document.body.classList.remove("has-region");

  // Restore full-screen selected state (no dimming)
  setFullScreenSelected();

  canvas.style.cursor = "crosshair";
}

function updateSelectionVisual(x: number, y: number, w: number, h: number): void {
  const nx = w < 0 ? x + w : x;
  const ny = h < 0 ? y + h : y;
  const nw = Math.abs(w);
  const nh = Math.abs(h);

  maskCutout.setAttribute("x", String(nx));
  maskCutout.setAttribute("y", String(ny));
  maskCutout.setAttribute("width", String(nw));
  maskCutout.setAttribute("height", String(nh));

  selectionBorder.style.display = "block";
  selectionBorder.style.left = nx + "px";
  selectionBorder.style.top = ny + "px";
  selectionBorder.style.width = nw + "px";
  selectionBorder.style.height = nh + "px";
}

function finalizeSelection(): void {
  if (!selRegion) return;

  const { w, h } = selRegion;
  // Ignore tiny accidental clicks (< 20px)
  if (w < 20 || h < 20) {
    clearRegion();
    exitSelectionMode();
    return;
  }

  phase = "annotate";
  regionBtn.classList.add("active");
  document.body.classList.add("has-region");
  exitSelectionMode();
}

function exitSelectionMode(): void {
  selectionHint.classList.add("hidden");
  toolbar.classList.remove("hidden");
  reportPanel.classList.remove("hidden");
  canvas.style.cursor = "crosshair";
}

// ── Mouse event handlers ──────────────────────────────────

canvas.addEventListener("mousedown", (e) => {
  if (phase === "selecting") {
    isSelecting = true;
    selStartX = e.clientX;
    selStartY = e.clientY;
    selectionHint.classList.add("hidden");
    return;
  }

  // Annotate phase — check if click is inside region (if set)
  if (selRegion && !isInsideRegion(e.clientX, e.clientY)) return;

  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  saveSnapshot();

  if (activeTool === "pen") {
    ctx.beginPath();
    ctx.moveTo(e.clientX, e.clientY);
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (phase === "selecting") {
    if (!isSelecting) return;
    updateSelectionVisual(selStartX, selStartY, e.clientX - selStartX, e.clientY - selStartY);
    return;
  }

  // Update cursor based on whether mouse is inside region
  if (selRegion) {
    canvas.style.cursor = isInsideRegion(e.clientX, e.clientY) ? "crosshair" : "not-allowed";
  }

  if (!isDrawing) return;

  ctx.strokeStyle = activeColor;
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (activeTool === "pen") {
    ctx.lineTo(clampX(e.clientX), clampY(e.clientY));
    ctx.stroke();
  } else {
    const snap = snapshots[snapshots.length - 1];
    if (snap) ctx.putImageData(snap, 0, 0);

    if (activeTool === "rect") {
      ctx.beginPath();
      ctx.strokeRect(startX, startY, clampX(e.clientX) - startX, clampY(e.clientY) - startY);
    } else if (activeTool === "arrow") {
      drawArrow(startX, startY, clampX(e.clientX), clampY(e.clientY));
    }
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (phase === "selecting") {
    if (!isSelecting) return;
    isSelecting = false;

    const w = e.clientX - selStartX;
    const h = e.clientY - selStartY;
    const nx = w < 0 ? selStartX + w : selStartX;
    const ny = h < 0 ? selStartY + h : selStartY;

    selRegion = { x: nx, y: ny, w: Math.abs(w), h: Math.abs(h) };
    finalizeSelection();
    return;
  }

  isDrawing = false;
  ctx.beginPath();
});

canvas.addEventListener("mouseleave", () => {
  if (phase === "selecting") return;
  if (isDrawing) {
    isDrawing = false;
    ctx.beginPath();
  }
});

// ── Region helpers ────────────────────────────────────────

function isInsideRegion(x: number, y: number): boolean {
  if (!selRegion) return true;
  return x >= selRegion.x && x <= selRegion.x + selRegion.w &&
         y >= selRegion.y && y <= selRegion.y + selRegion.h;
}

function clampX(x: number): number {
  if (!selRegion) return x;
  return Math.max(selRegion.x, Math.min(selRegion.x + selRegion.w, x));
}

function clampY(y: number): number {
  if (!selRegion) return y;
  return Math.max(selRegion.y, Math.min(selRegion.y + selRegion.h, y));
}

// ── Drawing helpers ───────────────────────────────────────

function drawArrow(fromX: number, fromY: number, toX: number, toY: number): void {
  const headLen = Math.max(12, brushSize * 3);
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle - Math.PI / 6),
    toY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle + Math.PI / 6),
    toY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

// ── Toolbar interactions ──────────────────────────────────

document.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTool = btn.dataset.tool as Tool;
  });
});

document.querySelectorAll<HTMLButtonElement>(".color-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".color-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeColor = btn.dataset.color ?? "#EF4444";
  });
});

const brushInput = document.getElementById("brush-size") as HTMLInputElement;
brushInput.addEventListener("input", () => {
  brushSize = parseInt(brushInput.value, 10);
});

document.getElementById("undo-btn")!.addEventListener("click", () => {
  const snap = snapshots.pop();
  if (snap) ctx.putImageData(snap, 0, 0);
});

document.getElementById("clear-btn")!.addEventListener("click", () => {
  saveSnapshot();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// ── Webhook URL persistence ───────────────────────────────

const WEBHOOK_KEY = "snapport_webhook_url";
const webhookInput = document.getElementById("webhook-input") as HTMLInputElement;
webhookInput.value = localStorage.getItem(WEBHOOK_KEY) ?? "";
webhookInput.addEventListener("change", () => {
  localStorage.setItem(WEBHOOK_KEY, webhookInput.value.trim());
});

// ── Image loading helper ──────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── Send report ───────────────────────────────────────────

const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const commentInput = document.getElementById("comment-input") as HTMLInputElement;
const statusMsg = document.getElementById("status-msg") as HTMLDivElement;

sendBtn.addEventListener("click", async () => {
  const webhookUrl = webhookInput.value.trim();
  const comment = commentInput.value.trim();

  if (!webhookUrl) {
    setStatus("Please enter a webhook URL.", "error");
    webhookInput.focus();
    return;
  }

  try {
    new URL(webhookUrl);
  } catch {
    setStatus("Invalid URL — please check the webhook address.", "error");
    webhookInput.focus();
    return;
  }

  sendBtn.disabled = true;

  if (!screenshotDataUrl) {
    setStatus("No screenshot available.", "error");
    sendBtn.disabled = false;
    return;
  }

  setStatus("Sending…", "");

  // Save the drawings (annotations only, transparent background)
  const drawingsData = canvas.toDataURL("image/png");

  // Composite: screenshot first, then drawings on top
  const compositeCanvas = document.createElement("canvas");
  const screenshotImg = await loadImage(screenshotDataUrl);
  const drawingsImg = await loadImage(drawingsData);

  // Use full screenshot dimensions for the source (may differ from canvas if DPI scaled)
  const imgW = screenshotImg.naturalWidth;
  const imgH = screenshotImg.naturalHeight;
  const scaleX = imgW / canvas.width;
  const scaleY = imgH / canvas.height;

  if (selRegion) {
    // Crop to the selected region (scale region coords to screenshot resolution)
    const sx = Math.round(selRegion.x * scaleX);
    const sy = Math.round(selRegion.y * scaleY);
    const sw = Math.round(selRegion.w * scaleX);
    const sh = Math.round(selRegion.h * scaleY);
    compositeCanvas.width = sw;
    compositeCanvas.height = sh;
    const compCtx = compositeCanvas.getContext("2d")!;
    compCtx.drawImage(screenshotImg, sx, sy, sw, sh, 0, 0, sw, sh);
    // Draw annotations scaled to match
    compCtx.drawImage(
      drawingsImg,
      selRegion.x, selRegion.y, selRegion.w, selRegion.h,
      0, 0, sw, sh
    );
  } else {
    // Full screenshot
    compositeCanvas.width = imgW;
    compositeCanvas.height = imgH;
    const compCtx = compositeCanvas.getContext("2d")!;
    compCtx.drawImage(screenshotImg, 0, 0, imgW, imgH);
    // Draw annotations scaled to full screenshot resolution
    compCtx.drawImage(drawingsImg, 0, 0, imgW, imgH);
  }

  const imageDataUrl = compositeCanvas.toDataURL("image/png");

  const result = await window.snapport.sendReport({
    webhookUrl,
    comment,
    imageDataUrl,
  });

  if (result.ok) {
    setStatus("Report sent successfully!", "success");
    commentInput.value = "";
    setTimeout(() => window.snapport.closeOverlay(), 1200);
  } else {
    setStatus(
      result.error
        ? `Error: ${result.error}`
        : `Server returned ${result.status}`,
      "error"
    );
    sendBtn.disabled = false;
  }
});

function setStatus(msg: string, type: "" | "success" | "error"): void {
  statusMsg.textContent = msg;
  statusMsg.className = type;
}

// ── Keyboard shortcuts ────────────────────────────────────

document.addEventListener("keydown", (e) => {
  // Escape handling
  if (e.key === "Escape") {
    if (phase === "selecting") {
      // Cancel selection, go back to annotate
      isSelecting = false;
      clearRegion();
      exitSelectionMode();
      return;
    }
    window.snapport.closeOverlay();
    return;
  }

  // Don't steal shortcuts when typing in inputs
  if (isInputFocused(e)) return;

  if (phase !== "annotate") return;

  switch (e.key) {
    case "p":
    case "P":
      selectTool("pen");
      break;
    case "r":
    case "R":
      selectTool("rect");
      break;
    case "a":
    case "A":
      selectTool("arrow");
      break;
    case "z":
    case "Z":
      if (e.ctrlKey || e.metaKey) {
        const snap = snapshots.pop();
        if (snap) ctx.putImageData(snap, 0, 0);
      }
      break;
  }
});

function isInputFocused(e: KeyboardEvent): boolean {
  return (
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement
  );
}

function selectTool(tool: Tool): void {
  activeTool = tool;
  document.querySelectorAll(".tool-btn").forEach((btn) => {
    const b = btn as HTMLButtonElement;
    b.classList.toggle("active", b.dataset.tool === tool);
  });
}
