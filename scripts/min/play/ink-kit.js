/* scripts/play/ink-kit.js (source 41e8255f35193f34), made smaller by tools/minify.mjs: edit the source, then run node tools/minify.mjs */
(function () {
"use strict";
if (window.HariniInk) {
return;
}
var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
function cssVar(el, name, fallback) {
var v = window.getComputedStyle(el || document.documentElement).getPropertyValue(name);
return v && v.trim() ? v.trim() : fallback;
}
function theme(el) {
var dark = Boolean(el && el.closest && el.closest(".project-viewer.is-active"));
if (dark) {
return {
dark: true,
ink: cssVar(el, "--project-text", "#f7f4ed"),
paper: cssVar(el, "--project-bg", "#050505"),
soft: cssVar(el, "--project-text-soft", "rgba(255,255,255,0.62)"),
line: cssVar(el, "--project-line", "rgba(255,255,255,0.28)")
};
}
return {
dark: false,
ink: cssVar(el, "--color-ink", "#151412"),
paper: cssVar(el, "--color-paper", "#faf8f3"),
soft: cssVar(el, "--color-ink-soft", "#625d54"),
line: cssVar(el, "--color-line", "rgba(21,20,18,0.14)")
};
}
function stage(host, opts) {
var o = opts || {};
var canvas = document.createElement("canvas");
var ctx = canvas.getContext("2d");
var s = { canvas: canvas, ctx: ctx, w: 0, h: 0, dpr: 1 };
var observer = null;
canvas.className = o.className || "ink-stage";
canvas.setAttribute("aria-hidden", "true");
canvas.style.display = "block";
canvas.style.width = "100%";
canvas.style.height = "100%";
host.appendChild(canvas);
s.resize = function () {
var rect = host.getBoundingClientRect();
var dpr = Math.min(window.devicePixelRatio || 1, o.maxDpr || 2);
s.w = Math.max(1, rect.width);
s.h = Math.max(1, rect.height);
s.dpr = dpr;
canvas.width = Math.round(s.w * dpr);
canvas.height = Math.round(s.h * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
ctx.lineCap = "round";
ctx.lineJoin = "round";
if (o.onResize) {
o.onResize(s);
}
};
s.clear = function () {
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
};
s.destroy = function () {
if (observer) {
observer.disconnect();
}
window.removeEventListener("resize", s.resize);
if (canvas.parentNode) {
canvas.parentNode.removeChild(canvas);
}
};
if ("ResizeObserver" in window) {
observer = new ResizeObserver(function () {
s.resize();
});
observer.observe(host);
} else {
window.addEventListener("resize", s.resize);
}
s.resize();
return s;
}
function hair(s, k) {
return Math.max((k || 1) * 1.25, 1 / ((s && s.dpr) || 1));
}
function pointer(el, h) {
var active = null;
function pos(event) {
var r = el.getBoundingClientRect();
return { x: event.clientX - r.left, y: event.clientY - r.top };
}
function down(event) {
if (active !== null) {
return;
}
active = event.pointerId;
if (el.setPointerCapture) {
try {
el.setPointerCapture(event.pointerId);
} catch (error) {
}
}
var p = pos(event);
if (h.down) {
h.down(p.x, p.y, event);
}
}
function move(event) {
var p = pos(event);
if (h.move) {
h.move(p.x, p.y, event, active === event.pointerId);
}
}
function up(event) {
if (active !== event.pointerId) {
return;
}
active = null;
var p = pos(event);
if (h.up) {
h.up(p.x, p.y, event);
}
}
el.addEventListener("pointerdown", down);
el.addEventListener("pointermove", move);
el.addEventListener("pointerup", up);
el.addEventListener("pointercancel", up);
return function () {
el.removeEventListener("pointerdown", down);
el.removeEventListener("pointermove", move);
el.removeEventListener("pointerup", up);
el.removeEventListener("pointercancel", up);
};
}
function loop(step, draw, el) {
var STEP = 1 / 120;
var raf = 0;
var last = 0;
var acc = 0;
var on = false;
var visible = true;
var io = null;
function frame(now) {
raf = 0;
if (!on) {
return;
}
var dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
last = now;
acc += dt;
while (acc >= STEP) {
step(STEP);
acc -= STEP;
}
draw(acc / STEP);
schedule();
}
function schedule() {
if (on && visible && !document.hidden && !raf) {
raf = window.requestAnimationFrame(frame);
}
}
function wake() {
last = 0;
schedule();
}
document.addEventListener("visibilitychange", wake);
if (el && "IntersectionObserver" in window) {
io = new IntersectionObserver(function (entries) {
visible = entries[0] ? entries[0].isIntersecting : true;
wake();
});
io.observe(el);
}
return {
start: function () {
if (!on) {
on = true;
wake();
}
},
stop: function () {
on = false;
if (raf) {
window.cancelAnimationFrame(raf);
raf = 0;
}
document.removeEventListener("visibilitychange", wake);
if (io) {
io.disconnect();
}
},
running: function () {
return on;
}
};
}
var physics = window.HariniPhysics || {
gravityFor: function (h) {
return 3.0 * h;
},
restitution: function (v, h) {
return Math.min(0.58, Math.max(0.35, 0.58 - (0.08 * Math.abs(v)) / h));
}
};
function memory(key) {
var k = "harini-play-" + key;
return {
done: function () {
try {
return window.sessionStorage.getItem(k) === "1";
} catch (error) {
return false;
}
},
set: function () {
try {
window.sessionStorage.setItem(k, "1");
} catch (error) {
}
}
};
}
function teardown() {
var fns = [];
return {
add: function (fn) {
fns.push(fn);
},
run: function () {
while (fns.length) {
try {
fns.pop()();
} catch (error) {
console.error(error);
}
}
}
};
}
function el(tag, cls, text) {
var e = document.createElement(tag);
if (cls) {
e.className = cls;
}
if (text !== undefined) {
e.textContent = text;
}
return e;
}
window.HariniInk = {
stage: stage,
theme: theme,
hair: hair,
pointer: pointer,
loop: loop,
physics: physics,
memory: memory,
teardown: teardown,
el: el,
get reducedMotion() {
return reduce.matches;
}
};
})();
