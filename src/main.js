import "./style.css";
import { extractContour, contourAspect } from "./contour.js";
import { defaults } from "./geometry.js";
import { createViewer } from "./viewer.js";

const $ = (id) => document.getElementById(id);
const definitions = [
  ["height", "Wall height above base", 2, 50, 0.5],
  ["wall", "Wall thickness", 0.4, 5, 0.1],
  ["taper", "Taper starts at", 0, 49, 0.5],
  ["tip", "Cutting edge thickness", 0.1, 5, 0.1],
  ["base", "Base thickness", 1, 15, 0.5],
  ["margin", "Base margin", 0.5, 20, 0.5],
];
$("parameters").innerHTML = definitions
  .map(
    ([key, label, min, max, step]) =>
      `<div class="parameter"><label for="${key}">${label}</label><div class="number-wrap"><input id="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${defaults[key]}" required /><span>mm</span></div></div>`,
  )
  .join("");

const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});
let viewer,
  image,
  sourceName = "",
  request = 0,
  loadId = 0,
  valid = false,
  aspect = null;
function setStatus(message, type = "") {
  $("status").textContent = message;
  $("status").className = type;
}
try {
  viewer = createViewer($("viewer"));
} catch {
  setStatus(
    "The 3D preview requires WebGL. Please use a browser with hardware acceleration.",
    "error",
  );
}

function invalidate() {
  request++;
  valid = false;
  $("download").disabled = true;
  $("busy").hidden = true;
  $("convert").disabled = !image;
}
function settingsChanged() {
  invalidate();
  if (image)
    setStatus(
      "Settings changed. Click Convert again to update your STL.",
      "notice",
    );
}
function syncSize() {
  const width = $("size").valueAsNumber;
  if (Number.isFinite(width)) $("size-slider").value = width;
  $("footprint-height").disabled = !aspect;
  $("footprint-height").value =
    aspect && Number.isFinite(width)
      ? Math.round(width * aspect * 100) / 100
      : "";
}
function refreshAspect() {
  aspect = null;
  if (image) {
    try {
      aspect = contourAspect(
        extractContour(image, Number($("threshold").value), $("invert").checked)
          .points,
      );
    } catch {
      /* The worker reports detection errors when Convert is clicked. */
    }
  }
  syncSize();
}
function generate() {
  if (!image) return;
  invalidate();
  $("convert").disabled = true;
  $("busy").hidden = false;
  setStatus("Creating your cookie cutter …");
  const parameters = Object.fromEntries(
    definitions.map(([key]) => [key, $(key).valueAsNumber]),
  );
  parameters.size = $("size").valueAsNumber;
  worker.postMessage({
    id: request,
    image,
    parameters,
    threshold: Number($("threshold").value),
    invert: $("invert").checked,
  });
}
worker.onmessage = ({ data }) => {
  if (data.id !== request) return;
  $("busy").hidden = true;
  $("convert").disabled = !image;
  if (data.error) {
    setStatus(data.error, "error");
    return;
  }
  const r = data.result;
  viewer?.setModel(r, true);
  $("empty").hidden = true;
  $("stats").hidden = false;
  $("view-reset").hidden = false;
  $("viewer-hint").hidden = false;
  const fmt = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  $("bounds").textContent =
    `${fmt(r.bounds.max[0] - r.bounds.min[0])} × ${fmt(r.bounds.max[1] - r.bounds.min[1])} mm`;
  $("total-height").textContent =
    `${fmt(r.bounds.max[2] - r.bounds.min[2])} mm`;
  $("volume").textContent = `${fmt(r.volume / 1000)} cm³`;
  setStatus(
    data.warnings.length
      ? data.warnings.join(" ")
      : "Done. Your cookie cutter is ready to download.",
    data.warnings.length ? "warning" : "",
  );
  valid = !!viewer;
  $("download").disabled = !valid;
};
worker.onerror = () => {
  invalidate();
  setStatus(
    "Could not load the geometry engine. Please reload the page.",
    "error",
  );
};

// SVG is decoded as an image, never inserted into the page. Accept only plain
// local shape elements; scripts, external references and embedded HTML are rejected.
async function imageBlob(file) {
  if (
    !file.name.toLowerCase().endsWith(".svg") &&
    file.type !== "image/svg+xml"
  )
    return file;
  const xml = new DOMParser().parseFromString(
    await file.text(),
    "image/svg+xml",
  );
  const elements = new Set([
    "svg",
    "g",
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
    "title",
    "desc",
  ]);
  const attributes = new Set([
    "xmlns",
    "width",
    "height",
    "viewBox",
    "preserveAspectRatio",
    "d",
    "points",
    "x",
    "y",
    "x1",
    "x2",
    "y1",
    "y2",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "fill",
    "fill-rule",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "opacity",
    "transform",
    "id",
    "version",
  ]);
  if (
    xml.documentElement.localName !== "svg" ||
    xml.querySelector("parsererror")
  )
    throw new Error("The SVG file is invalid.");
  for (const element of xml.querySelectorAll("*")) {
    if (!elements.has(element.localName))
      throw new Error(
        "Please use a simple SVG silhouette without embedded content.",
      );
    for (const attribute of element.attributes) {
      if (
        !attributes.has(attribute.name) ||
        (/url\s*\(|javascript:|https?:/i.test(attribute.value) &&
          attribute.name !== "xmlns")
      )
        throw new Error(
          "This SVG contains unsupported styles or external content. Please export it as a PNG.",
        );
    }
  }
  return new Blob([new XMLSerializer().serializeToString(xml)], {
    type: "image/svg+xml",
  });
}
async function loadFile(file) {
  if (!file) return;
  if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
    setStatus("Please choose a PNG, SVG, JPG or WebP file.", "error");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    setStatus("Please choose an image no larger than 20 MB.", "error");
    return;
  }
  const token = ++loadId;
  image = null;
  refreshAspect();
  invalidate();
  viewer?.clear();
  $("source").hidden = true;
  $("stats").hidden = true;
  $("empty").hidden = false;
  $("view-reset").hidden = true;
  $("viewer-hint").hidden = true;
  setStatus("Opening your image locally …");
  let url;
  try {
    const blob = await imageBlob(file);
    url = URL.createObjectURL(blob);
    const decoded = new Image();
    decoded.src = url;
    await decoded.decode();
    if (token !== loadId) return;
    const width = decoded.naturalWidth,
      height = decoded.naturalHeight;
    if (!width || !height || width > 16000 || height > 16000)
      throw new Error(
        "Please use an image no larger than 16,000 pixels per side.",
      );
    const scale = Math.min(1, 508 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale) + 4;
    canvas.height = Math.ceil(height * scale) + 4;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(decoded, 2, 2, canvas.width - 4, canvas.height - 4);
    image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    refreshAspect();
    sourceName = file.name;
    $("source-name").textContent = sourceName;
    $("source-description").textContent =
      `${width} × ${height} px · loaded locally`;
    $("source-image").src = canvas.toDataURL("image/png");
    $("source").hidden = false;
    $("convert").disabled = false;
    setStatus("Image loaded. Click Convert to create your shape.");
  } catch (error) {
    if (token === loadId)
      setStatus(error.message || "Could not open this image.", "error");
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
$("file").addEventListener("change", () => {
  loadFile($("file").files[0]);
  $("file").value = "";
});
$("convert").addEventListener("click", generate);
$("parameters").addEventListener("input", settingsChanged);
$("threshold").addEventListener("input", () => {
  refreshAspect();
  $("threshold-value").textContent = $("threshold").value;
  settingsChanged();
});
$("invert").addEventListener("change", () => {
  refreshAspect();
  settingsChanged();
});
$("reset").addEventListener("click", () => {
  for (const [key, value] of Object.entries(defaults)) $(key).value = value;
  syncSize();
  settingsChanged();
});
$("view-reset").addEventListener("click", () => viewer?.reset());
const drop = $("drop-zone");
for (const event of ["dragenter", "dragover"])
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.add("dragging");
  });
for (const event of ["dragleave", "drop"])
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.remove("dragging");
  });
drop.addEventListener("drop", (e) => loadFile(e.dataTransfer.files[0]));
$("download").addEventListener("click", () => {
  if (!valid || !viewer) return;
  const blob = new Blob([viewer.exportSTL()], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ausstecherle-${sourceName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9äöüß-]/gi, "-")}-${$("size").value}mm.stl`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("STL downloaded. Import it in millimeters in your slicer.");
});

$("size-slider").addEventListener("input", () => {
  $("size").value = $("size-slider").value;
  syncSize();
  settingsChanged();
});
$("size").addEventListener("input", () => {
  syncSize();
  settingsChanged();
});
$("footprint-height").addEventListener("input", () => {
  const height = $("footprint-height").valueAsNumber;
  if (!aspect || !Number.isFinite(height)) {
    $("size").value = "";
    invalidate();
    return;
  }
  $("size").value = Math.round((height / aspect) * 1000) / 1000;
  $("size-slider").value = $("size").value;
  settingsChanged();
});
