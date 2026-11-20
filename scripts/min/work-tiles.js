/* scripts/work-tiles.js (source 6e363390b4bbbcd4), made smaller by tools/minify.mjs: edit the source, then run node tools/minify.mjs */
(function () {
"use strict";
var html = document.documentElement;
var reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
var SPRING = [0, 1, -0.38, 0.14, -0.05, 0];
var SPRING_AT = [0, 0.2, 0.46, 0.7, 0.87, 1];
var WAKE_FALLBACK_MS = 7000;
var WAKE_AFTER_LEAVE_MS = 350;
function clamp(value, min, max) {
return Math.min(max, Math.max(min, value));
}
function layout() {
return html.getAttribute("data-tiles") || "cantilever";
}
function pictureFrom(element) {
if (!element || element.nodeType !== 1) {
return null;
}
return (element.closest && element.closest(".work-tile-media")) || (element.querySelector && element.querySelector(".work-tile-media"));
}
function fixedEdge(picture) {
var rect = picture.getBoundingClientRect();
var width = html.clientWidth;
var atLeft = rect.left <= 0.5;
var atRight = rect.right >= width - 0.5;
if (atLeft && !atRight) {
return "left";
}
if (atRight && !atLeft) {
return "right";
}
return "none";
}
function rollHint(picture) {
if (layout() === "sheet") {
return "right";
}
var edge = fixedEdge(picture);
return edge === "none" ? "left" : edge;
}
function markRollHints() {
Array.prototype.forEach.call(document.querySelectorAll(".work-tile-media"), function (picture) {
picture.setAttribute("data-ball-roll", rollHint(picture));
});
}
function flex(picture, strength) {
var power = clamp(Number(strength) || 0, 0, 1);
if (!power || reducedMotion.matches || !picture.animate) {
return;
}
var rect = picture.getBoundingClientRect();
var edge = layout() === "sheet" ? "none" : fixedEdge(picture);
var dip = (html.clientWidth < 768 ? 3 : 4.5) * power;
var frames;
if (edge === "none") {
frames = SPRING.map(function (share, index) {
return { offset: SPRING_AT[index], transform: "translateY(" + (share * dip * 0.6).toFixed(2) + "px)", easing: "ease-in-out" };
});
} else {
var degrees = (Math.atan(dip / Math.max(1, rect.width)) * 180) / Math.PI * (edge === "left" ? 1 : -1);
var origin = edge === "left" ? "0% 50%" : "100% 50%";
frames = SPRING.map(function (share, index) {
return { offset: SPRING_AT[index], transform: "rotate(" + (share * degrees).toFixed(4) + "deg)", transformOrigin: origin, easing: "ease-in-out" };
});
}
if (picture._flex) {
picture._flex.cancel();
}
picture._flex = picture.animate(frames, { duration: Math.round(240 + 90 * power) });
}
function wake(picture) {
var tile = picture.closest(".work-tile");
if (!tile || !html.hasAttribute("data-tiles-wake")) {
return;
}
window.clearTimeout(tile._sleep);
tile.classList.add("is-woken");
tile._sleep = window.setTimeout(function () {
tile.classList.remove("is-woken");
}, WAKE_FALLBACK_MS);
}
function sleep(picture) {
var tiles = picture ? [picture.closest(".work-tile")] : Array.prototype.slice.call(document.querySelectorAll(".work-tile.is-woken"));
tiles.forEach(function (tile) {
if (!tile) {
return;
}
window.clearTimeout(tile._sleep);
tile._sleep = window.setTimeout(function () {
tile.classList.remove("is-woken");
}, WAKE_AFTER_LEAVE_MS);
});
}
function onContact(event) {
var detail = event.detail || {};
var picture = pictureFrom(detail.element) || pictureFrom(event.target);
if (!picture) {
return;
}
flex(picture, detail.strength == null ? 1 : detail.strength);
wake(picture);
}
function onLeave(event) {
var detail = event.detail || {};
sleep(pictureFrom(detail.element) || pictureFrom(event.target));
}
function addDebugButton() {
var button = document.createElement("button");
button.type = "button";
button.className = "tiles-debug";
button.textContent = "fake ball contact";
button.addEventListener("click", function () {
var picture = document.querySelector(".work-tile-media");
var rect = picture.getBoundingClientRect();
var send = function (name, strength) {
picture.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { element: picture, x: rect.left + rect.width * 0.8, strength: strength } }));
};
[[0, 1], [430, 0.75], [770, 0.5], [1030, 0.25]].forEach(function (step) {
window.setTimeout(function () {
send("navball:contact", step[1]);
}, step[0]);
});
window.setTimeout(function () {
send("navball:leave");
}, 2600);
});
document.body.appendChild(button);
}
function init() {
window.addEventListener("navball:contact", onContact, true);
window.addEventListener("navball:leave", onLeave, true);
markRollHints();
window.addEventListener("resize", markRollHints, { passive: true });
if (html.hasAttribute("data-tiles-debug")) {
addDebugButton();
}
}
if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", init);
} else {
init();
}
})();
