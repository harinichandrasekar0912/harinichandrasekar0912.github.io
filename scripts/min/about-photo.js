/* scripts/about-photo.js (source 159dab89d870ee2e), made smaller by tools/minify.mjs: edit the source, then run node tools/minify.mjs */
(function () {
"use strict";
var root = document.documentElement;
var figure = document.querySelector(".about-portrait");
var img = figure && figure.querySelector("img");
if (!img) {
return;
}
var mode = root.getAttribute("data-photo");
var pixel = root.getAttribute("data-pixel") === "1";
var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var onLand = [];
var onArrive = [];
var visibleRatio = 0;
var ARRIVE = 0.5;
if ((mode !== "reveal" && !pixel) || (pixel && reduced)) {
figure.classList.add("is-pixel-ready");
return;
}
function tripRunning() {
return root.classList.contains("is-ball-animating");
}
function arrive() {
onArrive.slice().forEach(function (fn) { fn(); });
}
window.addEventListener("navball:contact", function (event) {
var d = event.detail || {};
if (d.index !== 0 || onLand.length === 0) {
return;
}
if (d.section !== "about" && !(d.element && (d.element === figure || figure.contains(d.element)))) {
return;
}
var r = img.getBoundingClientRect();
var x = typeof d.x === "number" && Number.isFinite(d.x) ? Math.max(0, Math.min(r.width, d.x - r.left)) : r.width / 2;
onLand.slice().forEach(function (fn) { fn(x, 0); });
});
if ("MutationObserver" in window) {
var wasRunning = tripRunning();
new MutationObserver(function () {
var running = tripRunning();
if (wasRunning && !running && visibleRatio >= ARRIVE) {
window.setTimeout(arrive, 0);
}
wasRunning = running;
}).observe(root, { attributes: true, attributeFilter: ["class"] });
}
if ("IntersectionObserver" in window) {
new IntersectionObserver(function (entries) {
visibleRatio = entries[entries.length - 1].isIntersecting ? entries[entries.length - 1].intersectionRatio : 0;
if (visibleRatio >= ARRIVE && !tripRunning()) {
arrive();
}
}, { threshold: [0, ARRIVE, 0.75] }).observe(figure);
}
if (mode === "reveal" && !pixel) {
var colour = function () {
if (!figure.classList.contains("is-colour")) {
figure.classList.add("is-colour");
}
onLand.length = 0;
onArrive.length = 0;
};
var section = document.getElementById("about");
var waiting = false;
var gently = function () {
if (waiting) {
return;
}
waiting = true;
var go = function () {
window.requestAnimationFrame(function () {
window.requestAnimationFrame(colour);
});
};
if (img.complete && img.naturalWidth > 0) {
go();
} else {
img.addEventListener("load", go, { once: true });
img.addEventListener("error", colour, { once: true });
}
};
onLand.push(colour);
onArrive.push(gently);
figure.addEventListener("pointerenter", function (event) {
if (event.pointerType !== "touch" && !tripRunning()) {
colour();
}
});
if (section) {
section.addEventListener("focusin", function () {
if (!tripRunning()) {
colour();
}
});
}
return;
}
var CELL = 9;
var TRAVEL = 640;
var RESOLVE = 200;
var GAP_COLOUR = "#f1eee7";
var stats = /[?&]pixelstats=1(?:&|$)/.test(window.location.search) ? (window.__aboutPixelStats = []) : null;
var P = null;
var started = false;
var source = new Image();
img.loading = "eager";
function giveUp() {
figure.classList.add("is-pixel-ready");
onLand.length = 0;
onArrive.length = 0;
if (P && P.canvas.parentNode) {
P.canvas.parentNode.removeChild(P.canvas);
}
P = null;
}
function objectPosition() {
var parts = (window.getComputedStyle(img).objectPosition || "50% 50%").split(" ");
var fx = parseFloat(parts[0]);
var fy = parseFloat(parts[1]);
return { x: Number.isFinite(fx) ? fx / 100 : 0.5, y: Number.isFinite(fy) ? fy / 100 : 0.5 };
}
function build() {
var w = figure.clientWidth;
var h = figure.clientHeight;
if (!w || !h || !source.naturalWidth) {
return;
}
var dpr = Math.min(window.devicePixelRatio || 1, 3);
var W = Math.round(w * dpr);
var H = Math.round(h * dpr);
var cols = Math.max(6, Math.round(w / CELL));
var rows = Math.max(6, Math.round(h / CELL));
var iw = source.naturalWidth;
var ih = source.naturalHeight;
var scale = Math.max(w / iw, h / ih);
var sw = w / scale;
var sh = h / scale;
var pos = objectPosition();
var small = document.createElement("canvas");
small.width = cols;
small.height = rows;
var sctx = small.getContext("2d", { willReadFrequently: true });
sctx.imageSmoothingEnabled = true;
sctx.imageSmoothingQuality = "high";
sctx.drawImage(source, (iw - sw) * pos.x, (ih - sh) * pos.y, sw, sh, 0, 0, cols, rows);
var data;
try {
data = sctx.getImageData(0, 0, cols, rows).data;
} catch (error) {
giveUp();
return;
}
var canvas = P ? P.canvas : document.createElement("canvas");
canvas.className = "about-pixels";
canvas.setAttribute("aria-hidden", "true");
canvas.width = W;
canvas.height = H;
var ctx = canvas.getContext("2d");
var gap = Math.max(1, Math.round(dpr));
var gapA = Math.floor(gap / 2);
var gapB = gap - gapA;
var n = cols * rows;
var cells = new Array(n);
ctx.fillStyle = GAP_COLOUR;
ctx.fillRect(0, 0, W, H);
for (var j = 0; j < rows; j += 1) {
var y0 = Math.round((j * H) / rows);
var y1 = Math.round(((j + 1) * H) / rows);
for (var i = 0; i < cols; i += 1) {
var x0 = Math.round((i * W) / cols);
var x1 = Math.round(((i + 1) * W) / cols);
var k = (j * cols + i) * 4;
var lum = 0.2126 * data[k] + 0.7152 * data[k + 1] + 0.0722 * data[k + 2];
var grey = Math.max(0, Math.min(255, Math.round((lum - 128) * 1.06 + 136)));
var cell = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill: "rgb(" + grey + "," + grey + "," + grey + ")", t: 0 };
cells[j * cols + i] = cell;
ctx.fillStyle = cell.fill;
ctx.fillRect(x0 + gapA, y0 + gapA, cell.w - gap, cell.h - gap);
}
}
P = { canvas: canvas, ctx: ctx, cells: cells, dpr: dpr, w: w, h: h, gapA: gapA, gap: gap };
if (!canvas.parentNode) {
figure.appendChild(canvas);
}
figure.classList.add("is-pixel-ready");
}
function ripple(px, py) {
if (started) {
return;
}
started = true;
onLand.length = 0;
onArrive.length = 0;
if (!P) {
giveUp();
return;
}
var ctx = P.ctx;
var cells = P.cells;
var dpr = P.dpr;
var ix = px * dpr;
var iy = py * dpr;
var W = P.canvas.width;
var H = P.canvas.height;
var far = Math.max(Math.hypot(ix, iy), Math.hypot(W - ix, iy), Math.hypot(ix, H - iy), Math.hypot(W - ix, H - iy), 1);
cells.forEach(function (c) {
c.t = (Math.hypot(c.x + c.w / 2 - ix, c.y + c.h / 2 - iy) / far) * TRAVEL;
});
var order = cells.slice().sort(function (a, b) { return a.t - b.t; });
var first = 0;
var t0 = 0;
var last = 0;
function frame(now) {
var cost = performance.now();
if (!t0) {
t0 = now;
}
var t = now - t0;
var active = 0;
for (var k = first; k < order.length; k += 1) {
var c = order[k];
if (c.t > t) {
break;
}
var p = (t - c.t) / RESOLVE;
ctx.clearRect(c.x, c.y, c.w, c.h);
if (p >= 1) {
if (k === first) {
first += 1;
}
continue;
}
var s = 1 - p * p;
var sw = (c.w - P.gap) * s;
var sh = (c.h - P.gap) * s;
active += 1;
ctx.globalAlpha = 1 - 0.55 * p;
ctx.fillStyle = c.fill;
ctx.fillRect(c.x + (c.w - sw) / 2, c.y + (c.h - sh) / 2, sw, sh);
}
ctx.globalAlpha = 1;
if (stats) {
stats.push({ t: Math.round(t * 10) / 10, dt: last ? Math.round((now - last) * 10) / 10 : 0, cost: Math.round((performance.now() - cost) * 1000) / 1000, active: active });
}
last = now;
if (first >= order.length) {
P.canvas.parentNode.removeChild(P.canvas);
P = null;
return;
}
window.requestAnimationFrame(frame);
}
window.requestAnimationFrame(frame);
}
onLand.push(function (x, y) { ripple(x, y); });
onArrive.push(function () {
if (visibleRatio >= ARRIVE && P) {
ripple(P.w / 2, P.h / 2);
}
});
var resizeTimer = 0;
window.addEventListener("resize", function () {
if (started || !P) {
return;
}
window.clearTimeout(resizeTimer);
resizeTimer = window.setTimeout(build, 120);
}, { passive: true });
source.addEventListener("load", function () {
build();
if (!P) {
giveUp();
} else if (visibleRatio >= ARRIVE && !tripRunning()) {
ripple(P.w / 2, P.h / 2);
}
}, { once: true });
source.addEventListener("error", giveUp, { once: true });
function loadSource() {
source.src = img.currentSrc || img.src;
}
if (img.complete && img.naturalWidth > 0) {
loadSource();
} else {
img.addEventListener("load", loadSource, { once: true });
img.addEventListener("error", giveUp, { once: true });
}
})();
