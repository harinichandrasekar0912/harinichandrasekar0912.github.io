/* scripts/project-viewer.js (source 32999743d1acd5b8), made smaller by tools/minify.mjs: edit the source, then run node tools/minify.mjs */
(function () {
var SCRIPT_DIR = (document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^\/]*$/, "") : "") || "scripts/";
function clamp(value, min, max) {
return Math.min(Math.max(value, min), max);
}
function easeInOutCubic(t) {
return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function escapeHtml(value) {
return String(value)
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#039;");
}
function noop() {}
function metaHtml(value) {
return escapeHtml(value)
.replace(/ · /g, " · ")
.replace(/ (\d{1,2})(?=$|[\s,.])/g, " $1");
}
var scriptLoads = {};
function loadScript(src) {
if (!scriptLoads[src]) {
scriptLoads[src] = new Promise(function (resolve, reject) {
var el = document.createElement("script");
el.src = src;
el.async = true;
el.onload = function () {
resolve();
};
el.onerror = function () {
delete scriptLoads[src];
reject(new Error("could not load " + src));
};
document.head.appendChild(el);
});
}
return scriptLoads[src];
}
function playScript(name) {
return SCRIPT_DIR + "play/" + name + ".js";
}
function loadPiece(name) {
return loadScript(playScript("ink-kit")).then(function () {
return loadScript(playScript(name));
});
}
function wait(ms) {
return new Promise(function (resolve) {
window.setTimeout(resolve, ms);
});
}
var supportsAvif = false;
(function detectAvif() {
var probe = new Image();
probe.onload = function () {
supportsAvif = probe.width > 0 && probe.height > 0;
};
probe.onerror = function () {
supportsAvif = false;
};
probe.src =
"data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAAB4AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgQAMAAAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAmbWRhdBIACggYADaICGg0IDIQHEeHhd3TTTTCxsAAkDWX8A==";
})();
var BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
var FLIGHT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
var COLOUR_EASE = "cubic-bezier(0.3, 0.2, 0.4, 1)";
function imageUrl(path) {
if (!path) {
return path;
}
return supportsAvif && /\.webp$/i.test(path) ? path.replace(/\.webp$/i, ".avif") : path;
}
function init() {
var projects = window.HariniProjectData || [];
var triggers = Array.prototype.slice.call(document.querySelectorAll("[data-project-trigger]"));
var viewer = document.querySelector("[data-project-viewer]");
var frame = document.querySelector("[data-project-frame]");
var hero = document.querySelector("[data-project-hero]");
var story = document.querySelector("[data-project-story]");
var track = document.querySelector("[data-project-track]");
var closeButton = document.querySelector("[data-project-close]");
var progress = document.querySelector("[data-project-progress]");
var progressBar = document.querySelector("[data-project-progress-bar]");
if (!viewer || !frame || !hero || !story || !track || !closeButton || !progress || !progressBar || triggers.length === 0) {
return;
}
closeButton.tabIndex = -1;
closeButton.setAttribute("aria-hidden", "true");
var defaultViewerLabel = viewer.getAttribute("aria-label") || "focused project view";
var outsideViewer = Array.prototype.slice.call(document.querySelectorAll("body > main, body > .skip-link"));
var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
var activeTrigger = null;
var activeProject = null;
var currentShift = 0;
var maxShift = 0;
var touchY = 0;
var revealTimer = 0;
var clearTrackTimer = 0;
var pendingShift = 0;
var shiftFrame = 0;
var openToken = 0;
var activeClone = null;
var isClosingProject = false;
var viewportWidth = window.innerWidth;
var viewportHeight = window.innerHeight;
function readViewport() {
viewportWidth = window.innerWidth;
viewportHeight = window.innerHeight;
}
window.addEventListener("resize", readViewport, { passive: true });
function notifyProjectState(name, project) {
var p = project || activeProject;
document.dispatchEvent(new CustomEvent(name, { detail: { id: p ? p.id : null, project: p || null } }));
}
window.HariniProjectPanels = window.HariniProjectPanels || {};
window.HariniProjectRituals = window.HariniProjectRituals || {};
var mountedPanels = [];
function pieceContext(project, token) {
return {
project: project,
viewer: viewer,
story: story,
track: track,
isStackedMode: isStackedMode,
reducedMotion: reducedMotion.matches,
imageUrl: imageUrl,
refresh: updateMaxShift,
token: token,
next: function () {
if (!isStackedMode()) {
stepPanel(1);
}
},
open: function (id) {
openById(id);
},
close: function () {
closeProject();
}
};
}
function unmountPanels() {
mountedPanels.forEach(function (entry) {
try {
if (entry.def && entry.def.unmount) {
entry.def.unmount(entry.handle);
}
} catch (error) {
console.error("Panel unmount failed", error);
}
});
mountedPanels = [];
}
function mountPanels(project, token) {
Array.prototype.forEach.call(track.querySelectorAll("[data-panel-type]"), function (article) {
var type = article.getAttribute("data-panel-type");
var panel = project.panels[Number(article.getAttribute("data-panel-index"))];
var figure = article.querySelector("[data-panel-mount]");
function mount() {
var def = window.HariniProjectPanels[type];
if (token !== openToken || !def || !figure.isConnected) {
return;
}
try {
mountedPanels.push({ def: def, handle: def.mount(figure, panel, pieceContext(project, token)) });
} catch (error) {
console.error("Panel mount failed", error);
}
updateMaxShift();
}
if (window.HariniProjectPanels[type]) {
mount();
} else {
loadPiece(panel.script || type).then(mount, function (error) {
console.error(error);
});
}
});
}
function isStackedMode() {
return viewportWidth <= 767;
}
function isTabletLandscapeTouchViewport() {
const isTabletLandscapeTouch =
window.matchMedia("(min-width: 768px) and (max-width: 1180px) and (orientation: landscape) and (pointer: coarse)").matches;
return isTabletLandscapeTouch;
}
function findProject(id) {
return projects.find(function (project) {
return project.id === id;
});
}
function setOutsideInert(on) {
outsideViewer.forEach(function (element) {
element.inert = on;
if (on) {
element.setAttribute("inert", "");
} else {
element.removeAttribute("inert");
}
});
}
function keyBelongsToTarget(event) {
var target = event.target;
if (!target || target.nodeType !== 1) {
return false;
}
if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
return true;
}
return Boolean(target.closest && target.closest("[data-panel-interactive]"));
}
function focusablesInViewer() {
return Array.prototype.slice.call(viewer.querySelectorAll(
'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
)).filter(function (element) {
return element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest("[inert]");
});
}
function trapTab(event) {
var focusables = focusablesInViewer();
var first = focusables[0];
var last = focusables[focusables.length - 1];
var active = document.activeElement;
if (!first) {
event.preventDefault();
viewer.focus({ preventScroll: true });
return;
}
if (event.shiftKey && (active === first || active === viewer || !viewer.contains(active))) {
event.preventDefault();
last.focus({ preventScroll: true });
} else if (!event.shiftKey && (active === last || !viewer.contains(active))) {
event.preventDefault();
first.focus({ preventScroll: true });
}
}
function wheelPixels(event) {
var unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportHeight : 1;
var dx = (event.deltaX || 0) * unit;
var dy = (event.deltaY || 0) * unit;
return Math.abs(dx) > Math.abs(dy) ? dx : dy;
}
function scrollStoryBy(amount) {
story.scrollTop = clamp(story.scrollTop + amount, 0, story.scrollHeight - story.clientHeight);
}
function setProgress() {
var amount = maxShift > 0 ? currentShift / maxShift : 0;
progressBar.style.transform = "scaleX(" + clamp(amount, 0, 1) + ")";
}
function applyShift(value) {
track.style.transform = value ? "translate3d(" + -value + "px, 0, 0)" : "";
}
function fitIntro() {
var figure = introFigure();
var copy = track.querySelector(".project-panel-intro .project-panel-copy");
var band;
var rest;
var room;
var widest;
var floor;
var defaultTop;
var size;
var top;
viewer.style.removeProperty("--intro-size");
viewer.style.removeProperty("--intro-top");
if (!isStackedMode() || !figure || !copy) {
return;
}
band = parseFloat(window.getComputedStyle(viewer, "::after").height) || 0;
rest = copy.getBoundingClientRect().bottom - figure.getBoundingClientRect().bottom;
room = viewportHeight - band - 12 - rest;
widest = Math.min(viewportWidth * 0.9, 520);
floor = Math.min(widest, viewportWidth * 0.6);
defaultTop = clamp(viewportHeight * 0.14, 80, 112);
size = Math.min(widest, Math.max(room - defaultTop, Math.min(floor, room - 40)));
size = Math.max(size, 140);
top = clamp(room - size, 40, defaultTop);
viewer.style.setProperty("--intro-size", Math.floor(size) + "px");
viewer.style.setProperty("--intro-top", Math.floor(top) + "px");
}
function setViewerVars(trigger, measuredRect) {
var rect = measuredRect || tileBox(trigger).getBoundingClientRect();
var vw = viewportWidth;
var vh = viewportHeight;
var stacked = isStackedMode();
var side = rect.left + rect.width / 2 > vw / 2 ? "right" : "left";
var topBuffer = stacked ? Math.max(88, vh * 0.12) : clamp(vh * 0.07, 48, 88);
var bottomUiZone = stacked ? clamp(vh * 0.14, 104, 150) : clamp(vh * 0.16, 120, 180);
var maxFocusHeight = Math.max(240, vh - topBuffer - bottomUiZone);
var mobileFocusWidth = Math.min(vw * 0.9, 520);
var focusHeight = stacked ? Math.min(mobileFocusWidth, maxFocusHeight, 520) : maxFocusHeight;
var focusWidth = stacked ? mobileFocusWidth : Math.min(vw * 0.54, focusHeight * 1.25, 780);
var panelPeek = stacked || side === "right" ? 0 : clamp(vw * 0.16, 72, 220);
var panelWidth = stacked ? vw : vw - panelPeek;
var focusLeft = stacked ? (vw - focusWidth) / 2 : side === "right" ? vw - focusWidth : 0;
var focusTop = stacked ? topBuffer : topBuffer;
viewer.dataset.projectMode = stacked ? "stacked" : "horizontal";
viewer.dataset.projectSide = side;
viewer.style.setProperty("--tile-left", rect.left + "px");
viewer.style.setProperty("--tile-top", rect.top + "px");
viewer.style.setProperty("--tile-width", rect.width + "px");
viewer.style.setProperty("--tile-height", rect.height + "px");
viewer.style.setProperty("--focus-left", focusLeft + "px");
viewer.style.setProperty("--focus-top", focusTop + "px");
viewer.style.setProperty("--focus-width", focusWidth + "px");
viewer.style.setProperty("--focus-height", focusHeight + "px");
viewer.style.setProperty("--project-top-buffer", topBuffer + "px");
viewer.style.setProperty("--project-bottom-ui-zone", bottomUiZone + "px");
viewer.style.setProperty("--project-panel-peek", panelPeek + "px");
viewer.style.setProperty("--panel-width", panelWidth + "px");
}
function waitForFrame() {
return new Promise(function (resolve) {
window.requestAnimationFrame(resolve);
});
}
function waitForLayoutFrames(count) {
var frames = Math.max(1, count || 2);
var chain = Promise.resolve();
while (frames > 0) {
chain = chain.then(waitForFrame);
frames -= 1;
}
return chain;
}
function waitForLayout() {
return waitForLayoutFrames(2);
}
function waitForPhoneLayout() {
if (!isStackedMode()) {
return Promise.resolve();
}
return waitForLayout().then(waitForLayout);
}
function waitForProjectMeasurementLayout() {
if (isTabletLandscapeTouchViewport()) {
return waitForLayoutFrames(3);
}
return waitForPhoneLayout();
}
function waitForImageLoad(img) {
return new Promise(function (resolve) {
img.addEventListener("load", resolve, { once: true });
img.addEventListener("error", resolve, { once: true });
});
}
function ensureImageReady(img) {
if (!img) {
return Promise.resolve();
}
if (img.decode) {
return img.decode().catch(function () {
return img.complete ? undefined : waitForImageLoad(img);
});
}
return img.complete ? Promise.resolve() : waitForImageLoad(img);
}
function removeActiveClone() {
if (activeClone) {
if (typeof activeClone._stopFlight === "function") {
activeClone._stopFlight();
}
if (activeClone.parentElement) {
activeClone.parentElement.removeChild(activeClone);
}
}
activeClone = null;
}
function tileBox(trigger) {
return (trigger && trigger.querySelector("[data-tile-media]")) || trigger;
}
function tileFilter(trigger) {
var image = trigger && trigger.querySelector("img");
var filter = image ? window.getComputedStyle(image).filter : "";
return filter && filter !== "none" ? filter : "grayscale(1)";
}
function createOpenClone(trigger, project, rect) {
var sourceImage = trigger.querySelector("img");
var clone = document.createElement("div");
var cloneImage = document.createElement("img");
clone.className = "project-open-clone";
clone.style.borderRadius = cornerRadius(tileBox(trigger));
applyBox(clone, rect);
cloneImage.style.filter = tileFilter(trigger);
cloneImage.src = sourceImage ? sourceImage.currentSrc || sourceImage.src : project.image;
cloneImage.alt = "";
cloneImage.decoding = "async";
clone.appendChild(cloneImage);
document.body.appendChild(clone);
activeClone = clone;
return {
element: clone,
image: cloneImage
};
}
function applyBox(element, rect) {
element.style.left = rect.left + "px";
element.style.top = rect.top + "px";
element.style.width = rect.width + "px";
element.style.height = rect.height + "px";
}
function cornerRadius(element) {
var style = window.getComputedStyle(element);
return [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
.map(function (value) {
return String(value || "0px").split(" ")[0];
})
.join(" ");
}
function boxKeyframe(rect, radius) {
var keyframe = {
left: rect.left + "px",
top: rect.top + "px",
width: rect.width + "px",
height: rect.height + "px"
};
if (radius) {
keyframe.borderRadius = radius;
}
return keyframe;
}
function sameBox(a, b) {
return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
}
function flyBetween(element, from, to, duration, extra) {
var options = extra || {};
var image = element.querySelector("img");
var hasFilter = Boolean(image && options.filterFrom && options.filterTo);
applyBox(element, from);
if (options.radiusFrom) {
element.style.borderRadius = options.radiusFrom;
}
if (hasFilter) {
image.style.filter = options.filterFrom;
}
if (!element.animate || reducedMotion.matches || (sameBox(from, to) && (!options.radiusTo || options.radiusFrom === options.radiusTo))) {
applyBox(element, to);
if (options.radiusTo) {
element.style.borderRadius = options.radiusTo;
}
if (hasFilter) {
image.style.filter = options.filterTo;
}
return Promise.resolve(true);
}
return new Promise(function (resolve) {
var settled = false;
var timer = 0;
var animation = element.animate([boxKeyframe(from, options.radiusFrom), boxKeyframe(to, options.radiusTo)], {
duration: duration,
easing: FLIGHT_EASE,
fill: "both"
});
var colourAnimation = hasFilter
? image.animate([{ filter: options.filterFrom }, { filter: options.filterTo }], { duration: duration, easing: COLOUR_EASE, fill: "both" })
: null;
function settle(arrived) {
if (settled) {
return;
}
settled = true;
window.clearTimeout(timer);
element._stopFlight = null;
if (arrived) {
applyBox(element, to);
if (options.radiusTo) {
element.style.borderRadius = options.radiusTo;
}
if (hasFilter) {
image.style.filter = options.filterTo;
}
}
animation.cancel();
if (colourAnimation) {
colourAnimation.cancel();
}
resolve(arrived);
}
element._stopFlight = function () {
settle(false);
};
animation.onfinish = function () {
settle(true);
};
animation.oncancel = function () {
settle(false);
};
timer = window.setTimeout(function () {
settle(true);
}, duration + 600);
});
}
function stopFlight(element) {
var rect = element.getBoundingClientRect();
var radius = cornerRadius(element);
var image = element.querySelector("img");
var filter = image ? window.getComputedStyle(image).filter : "none";
if (typeof element._stopFlight === "function") {
element._stopFlight();
}
applyBox(element, rect);
element.style.borderRadius = radius;
if (image) {
image.style.filter = filter === "none" ? "grayscale(0)" : filter;
}
return rect;
}
function openFlightDuration() {
if (reducedMotion.matches) {
return 1;
}
return isTabletLandscapeTouchViewport() || isStackedMode() ? 1100 : 1000;
}
function closeFlightDuration() {
if (reducedMotion.matches) {
return 1;
}
return isTabletLandscapeTouchViewport() || isStackedMode() ? 1000 : 940;
}
function introFigure() {
return track.querySelector(".project-panel-intro .project-panel-image");
}
function introImage() {
return track.querySelector(".project-panel-intro .project-panel-image img");
}
function introFigureRect() {
var figure = introFigure();
return figure ? figure.getBoundingClientRect() : frame.getBoundingClientRect();
}
function prepareProjectOpen(trigger, project, rect) {
activeTrigger = trigger;
activeProject = project;
currentShift = 0;
pendingShift = 0;
window.clearTimeout(revealTimer);
window.clearTimeout(clearTrackTimer);
closeButton.disabled = false;
isClosingProject = false;
if (shiftFrame) {
window.cancelAnimationFrame(shiftFrame);
shiftFrame = 0;
}
unmountPanels();
viewer.classList.add("is-active", "is-preparing");
viewer.classList.remove("is-ready", "is-closing", "is-expanded", "is-landed", "is-shrinking", "is-ritual");
viewer.setAttribute("aria-hidden", "false");
viewer.setAttribute("aria-label", "project: " + project.title);
setOutsideInert(true);
closeButton.tabIndex = 0;
closeButton.removeAttribute("aria-hidden");
document.body.classList.add("is-project-open", "is-project-dark");
document.body.classList.remove("is-project-closing");
notifyProjectState("harini:project-open");
setViewerVars(trigger, rect);
fillProject(project);
fitIntro();
observePanelImages();
applyShift(0);
track.style.transition = "";
frame.style.cssText = "";
hero.style.filter = "";
}
function revealProjectContent(token) {
if (token !== openToken || !viewer.classList.contains("is-active") || viewer.classList.contains("is-ready")) {
return;
}
viewer.classList.remove("is-preparing");
viewer.classList.add("is-ready");
viewer.focus({ preventScroll: true });
}
function updateMaxShift() {
if (isStackedMode()) {
maxShift = 0;
currentShift = 0;
applyShift(0);
setProgress();
return;
}
maxShift = Math.max(0, track.scrollWidth - story.clientWidth);
currentShift = clamp(currentShift, 0, maxShift);
applyShift(currentShift);
setProgress();
}
function setShift(value, quick) {
if (isStackedMode()) {
return;
}
currentShift = clamp(value, 0, maxShift);
track.classList.toggle("is-dragging", Boolean(quick));
applyShift(currentShift);
setProgress();
if (quick) {
window.setTimeout(function () {
track.classList.remove("is-dragging");
}, 120);
}
}
function stepPanel(direction) {
var panels = track.children;
var target = currentShift;
var index;
for (index = 0; index < panels.length; index += 1) {
var left = panels[index].offsetLeft;
if (direction > 0 && left > currentShift + 8) {
target = left;
break;
}
if (direction < 0 && left < currentShift - 8) {
target = left;
}
}
if (direction > 0 && target === currentShift) {
target = maxShift;
}
setShift(target, false);
}
function queueShift(delta) {
if (isStackedMode()) {
return;
}
pendingShift += delta;
if (shiftFrame) {
return;
}
shiftFrame = window.requestAnimationFrame(function () {
setShift(currentShift + pendingShift, true);
pendingShift = 0;
shiftFrame = 0;
});
}
function animateScrollToTop(element) {
var startTop = element.scrollTop;
var duration = reducedMotion.matches ? 1 : clamp(Math.abs(startTop) * 0.45, 500, 1200);
if (startTop <= 1 || reducedMotion.matches) {
element.scrollTop = 0;
return Promise.resolve();
}
return new Promise(function (resolve) {
var startTime = performance.now();
function step(now) {
var raw = clamp((now - startTime) / duration, 0, 1);
var eased = easeInOutCubic(raw);
element.scrollTop = startTop * (1 - eased);
if (raw < 1) {
window.requestAnimationFrame(step);
return;
}
element.scrollTop = 0;
resolve();
}
window.requestAnimationFrame(step);
});
}
function animateShiftToStart() {
var startShift = currentShift;
var duration = reducedMotion.matches ? 1 : clamp(Math.abs(startShift) * 0.45, 500, 1200);
if (startShift <= 1 || reducedMotion.matches) {
setShift(0, false);
return Promise.resolve();
}
return new Promise(function (resolve) {
var startTime = performance.now();
var previousTransition = track.style.transition;
track.style.transition = "none";
function step(now) {
var raw = clamp((now - startTime) / duration, 0, 1);
var eased = easeInOutCubic(raw);
currentShift = startShift * (1 - eased);
applyShift(currentShift);
setProgress();
if (raw < 1) {
window.requestAnimationFrame(step);
return;
}
currentShift = 0;
applyShift(0);
setProgress();
track.style.transition = previousTransition;
resolve();
}
window.requestAnimationFrame(step);
});
}
function animateProjectReturnToStart() {
if (isStackedMode()) {
return animateScrollToTop(story);
}
return animateShiftToStart();
}
function fillProject(project) {
var initialImageClass = viewer.dataset.projectSide === "left" ? "project-panel-image is-initial-left-edge" : "project-panel-image";
var stepTotal = String(project.panels.length).padStart(2, "0");
hero.src = imageUrl(project.image);
hero.alt = "";
track.innerHTML = project.panels.map(function (panel, index) {
if (index === 0) {
return [
'<article class="project-panel project-panel-intro">',
'<figure class="',
initialImageClass,
'">',
'<img src="',
escapeHtml(imageUrl(project.image)),
'" alt="',
escapeHtml(project.alt || ""),
'" decoding="async">',
"</figure>",
'<div class="project-panel-copy">',
'<p class="project-step">01 / ',
stepTotal,
"</p>",
"<h3>",
escapeHtml(project.title),
"</h3>",
"<p>",
escapeHtml(project.summary),
"</p>",
project.meta ? '<p class="project-meta">' + metaHtml(project.meta) + "</p>" : "",
"</div>",
"</article>"
].join("");
}
if (panel.type) {
return [
'<article class="project-panel project-panel-custom is-' + escapeHtml(panel.type) + '" data-panel-type="' + escapeHtml(panel.type) + '" data-panel-index="' + index + '" style="--ratio:' + (panel.ratio > 0 ? panel.ratio : 1.25).toFixed(3) + '">',
'<figure class="project-panel-image project-panel-custom-figure" data-panel-mount></figure>',
'<div class="project-panel-copy">',
'<p class="project-step">',
String(index + 1).padStart(2, "0"),
" / ",
stepTotal,
"</p>",
panel.heading ? "<h3>" + escapeHtml(panel.heading) + "</h3>" : "",
panel.body ? "<p>" + escapeHtml(panel.body) + "</p>" : "",
'<div class="project-panel-extra" data-panel-extra></div>',
"</div>",
"</article>"
].join("");
}
var ratio = panel.ratio > 0 ? panel.ratio : 8 / 7;
var shape = ratio > 2.2 ? " is-wide" : ratio > 1.45 ? " is-landscape" : "";
var imageSrc = imageUrl(panel.image || project.image);
return [
'<article class="project-panel' + shape + (panel.colour ? " is-colour" : "") + '" style="--ratio:' + ratio.toFixed(3) + '">',
'<figure class="project-panel-image project-panel-placeholder is-loading">',
index === 1
? '<img src="' + escapeHtml(imageSrc) + '"'
: '<img src="' + BLANK_IMAGE + '" data-src="' + escapeHtml(imageSrc) + '"',
' alt="',
escapeHtml(panel.alt || project.alt || ""),
'" decoding="async">',
"</figure>",
'<div class="project-panel-copy">',
'<p class="project-step">',
String(index + 1).padStart(2, "0"),
" / ",
stepTotal,
"</p>",
"<h3>",
escapeHtml(panel.heading),
"</h3>",
"<p>",
escapeHtml(panel.body),
"</p>",
panel.link ? '<button class="project-link" type="button" data-open-project="' + escapeHtml(panel.link.open) + '">' + escapeHtml(panel.link.label) + "</button>" : "",
"</div>",
"</article>"
].join("");
}).join("");
var lastCopy = project.liveUrl ? track.querySelector(".project-panel:last-child .project-panel-copy") : null;
if (lastCopy) {
lastCopy.insertAdjacentHTML("beforeend", [
'<p class="project-live"><a href="',
escapeHtml(project.liveUrl),
'" target="_blank" rel="noopener">',
escapeHtml(project.liveLabel || "open the live work \u2197"),
"</a></p>"
].join(""));
}
watchPanelImages();
mountPanels(project, openToken);
}
function watchPanelImages() {
Array.prototype.forEach.call(track.querySelectorAll(".project-panel-image.is-loading img"), function (img) {
var figure = img.parentElement;
function settle() {
if (!img.hasAttribute("data-src")) {
figure.classList.remove("is-loading");
}
}
img.addEventListener("load", settle);
img.addEventListener("error", function () {
figure.classList.remove("is-loading");
});
if (img.complete && img.naturalWidth > 1) {
settle();
}
});
}
var panelObserver = null;
function loadPanelImage(img) {
var src = img.getAttribute("data-src");
if (src) {
img.removeAttribute("data-src");
img.src = src;
if (img.decode) {
img.decode().catch(noop);
}
}
}
function disconnectPanelObserver() {
if (panelObserver) {
panelObserver.disconnect();
panelObserver = null;
}
}
function observePanelImages() {
var pending = Array.prototype.slice.call(track.querySelectorAll(".project-panel")).filter(function (panel) {
return panel.querySelector("img[data-src]");
});
disconnectPanelObserver();
if (!("IntersectionObserver" in window)) {
Array.prototype.forEach.call(track.querySelectorAll("img[data-src]"), loadPanelImage);
return;
}
panelObserver = new IntersectionObserver(function (entries) {
entries.forEach(function (entry) {
if (entry.isIntersecting) {
var img = entry.target.querySelector("img[data-src]");
if (img) {
loadPanelImage(img);
}
panelObserver.unobserve(entry.target);
}
});
}, { root: story, rootMargin: isStackedMode() ? "1400px 0px" : "0px 1600px" });
pending.forEach(function (panel) {
panelObserver.observe(panel);
});
}
var warmedProjects = {};
function warmProject(project) {
if (!project || warmedProjects[project.id]) {
return;
}
warmedProjects[project.id] = true;
if (project.ritual) {
loadPiece(project.ritual).catch(noop);
}
(project.panels || []).forEach(function (panel) {
if (panel && panel.type) {
loadPiece(panel.script || panel.type).catch(noop);
}
});
[project.image, project.panels && project.panels[1] && project.panels[1].image].forEach(function (path) {
if (path) {
var image = new Image();
image.decoding = "async";
image.src = imageUrl(path);
if (image.decode) {
image.decode().catch(noop);
}
}
});
}
async function openProject(trigger) {
if (viewer.classList.contains("is-active")) {
return;
}
var project = findProject(trigger.getAttribute("data-project-trigger"));
if (!project) {
return;
}
var token = openToken + 1;
readViewport();
var tileRect = tileBox(trigger).getBoundingClientRect();
var startFilter = tileFilter(trigger);
var cloneParts;
openToken = token;
removeActiveClone();
cloneParts = createOpenClone(trigger, project, tileRect);
prepareProjectOpen(trigger, project, tileRect);
await Promise.all([
Promise.race([ensureImageReady(cloneParts.image), wait(300)]),
waitForLayout()
]);
await waitForProjectMeasurementLayout();
if (token !== openToken) {
return;
}
var targetRect = introFigureRect();
trigger.classList.add("is-project-source");
viewer.classList.add("is-expanded");
updateMaxShift();
cloneParts.element.classList.add("is-moving");
var flight = flyBetween(cloneParts.element, tileRect, targetRect, openFlightDuration(), {
radiusFrom: cornerRadius(tileBox(trigger)),
radiusTo: cornerRadius(introFigure()),
filterFrom: startFilter,
filterTo: "grayscale(0)"
});
if (!project.ritual) {
revealTimer = window.setTimeout(function () {
revealProjectContent(token);
}, reducedMotion.matches ? 1 : isStackedMode() ? 520 : 440);
}
await flight;
if (token !== openToken) {
return;
}
await Promise.race([ensureImageReady(introImage()), wait(4000)]);
if (token !== openToken) {
return;
}
window.clearTimeout(revealTimer);
if (project.ritual) {
viewer.classList.add("is-landed");
await waitForLayoutFrames(2);
if (token !== openToken) {
return;
}
removeActiveClone();
await runRitual(project, token);
if (token !== openToken) {
return;
}
revealProjectContent(token);
return;
}
revealProjectContent(token);
viewer.classList.add("is-landed");
await waitForLayoutFrames(2);
if (token !== openToken) {
return;
}
removeActiveClone();
}
function runRitual(project, token) {
var host = document.createElement("div");
host.className = "project-ritual";
host.setAttribute("data-panel-interactive", "");
viewer.appendChild(host);
viewer.classList.add("is-ritual");
function finish() {
viewer.classList.remove("is-ritual");
if (host.parentNode) {
host.parentNode.removeChild(host);
}
}
function start() {
var ritual = window.HariniProjectRituals[project.ritual];
if (token !== openToken || typeof ritual !== "function") {
return undefined;
}
return ritual(host, pieceContext(project, token));
}
var ready = window.HariniProjectRituals[project.ritual] ? Promise.resolve() : loadPiece(project.ritual);
return ready.then(start).catch(function (error) {
console.error("Ritual failed", error);
}).then(finish, finish);
}
function clearTrack() {
if (!viewer.classList.contains("is-active")) {
track.innerHTML = "";
story.scrollTop = 0;
}
}
function finishClose() {
var trigger = activeTrigger;
viewer.classList.remove("is-active", "is-expanded", "is-ready", "is-closing", "is-preparing", "is-landed", "is-shrinking");
viewer.setAttribute("aria-hidden", "true");
viewer.setAttribute("aria-label", defaultViewerLabel);
closeButton.tabIndex = -1;
closeButton.setAttribute("aria-hidden", "true");
setOutsideInert(false);
document.body.classList.remove("is-project-open", "is-project-dark", "is-project-closing");
disconnectPanelObserver();
frame.style.cssText = "";
hero.style.filter = "";
applyShift(0);
var closedProject = activeProject;
unmountPanels();
viewer.classList.remove("is-ritual");
Array.prototype.forEach.call(viewer.querySelectorAll(".project-ritual"), function (el) {
el.parentNode.removeChild(el);
});
activeProject = null;
closeButton.disabled = false;
isClosingProject = false;
removeActiveClone();
if (trigger) {
trigger.classList.remove("is-project-source");
}
notifyProjectState("harini:project-closed", closedProject);
if (trigger) {
trigger.focus({ preventScroll: true });
}
activeTrigger = null;
window.clearTimeout(clearTrackTimer);
clearTrackTimer = window.setTimeout(clearTrack, 80);
}
async function closeProject() {
if (!viewer.classList.contains("is-active") || isClosingProject) {
return;
}
isClosingProject = true;
pendingShift = 0;
openToken += 1;
var token = openToken;
var flying = activeClone;
var shrinker = flying || frame;
var from;
var fromRadius;
var fromFilter = "grayscale(0)";
window.clearTimeout(revealTimer);
if (shiftFrame) {
window.cancelAnimationFrame(shiftFrame);
shiftFrame = 0;
}
closeButton.disabled = true;
document.body.classList.add("is-project-closing");
notifyProjectState("harini:project-closing");
if (flying) {
from = stopFlight(flying);
fromRadius = flying.style.borderRadius;
fromFilter = flying.querySelector("img").style.filter || fromFilter;
} else {
await animateProjectReturnToStart();
if (token !== openToken || !viewer.classList.contains("is-active")) {
return;
}
from = introFigureRect();
fromRadius = cornerRadius(introFigure());
applyBox(frame, from);
frame.style.borderRadius = fromRadius;
}
viewer.classList.remove("is-ready");
viewer.classList.add("is-closing");
if (!flying) {
await waitForLayoutFrames(2);
if (token !== openToken) {
return;
}
}
var tileRect = activeTrigger ? tileBox(activeTrigger).getBoundingClientRect() : from;
viewer.classList.add("is-shrinking");
viewer.classList.remove("is-expanded");
await flyBetween(shrinker, from, tileRect, closeFlightDuration(), {
radiusFrom: fromRadius,
radiusTo: activeTrigger ? cornerRadius(tileBox(activeTrigger)) : fromRadius,
filterFrom: fromFilter,
filterTo: "grayscale(1)"
});
if (token !== openToken) {
return;
}
finishClose();
}
triggers.forEach(function (trigger) {
var warm = function () {
warmProject(findProject(trigger.getAttribute("data-project-trigger")));
};
trigger.addEventListener("pointerenter", warm, { passive: true });
trigger.addEventListener("focus", warm);
trigger.addEventListener("touchstart", warm, { passive: true });
trigger.addEventListener("click", function () {
openProject(trigger).catch(function (error) {
console.error("Project open failed", error);
viewer.classList.add("is-landed");
removeActiveClone();
revealProjectContent(openToken);
});
});
});
closeButton.addEventListener("click", closeProject);
track.addEventListener("click", function (event) {
var link = event.target.closest ? event.target.closest("[data-open-project]") : null;
if (link) {
openById(link.getAttribute("data-open-project"));
}
});
document.addEventListener("harini:project-close-request", closeProject);
viewer.addEventListener("wheel", function (event) {
if (!viewer.classList.contains("is-expanded")) {
return;
}
if (viewer.classList.contains("is-ritual")) {
event.preventDefault();
return;
}
if (isStackedMode()) {
return;
}
event.preventDefault();
if (!isClosingProject) {
queueShift(wheelPixels(event) * 1.15);
}
}, { passive: false });
viewer.addEventListener("touchstart", function (event) {
if (event.touches.length > 0) {
touchY = event.touches[0].clientY;
}
}, { passive: true });
viewer.addEventListener("touchmove", function (event) {
if (!viewer.classList.contains("is-expanded") || event.touches.length === 0) {
return;
}
if (isStackedMode()) {
return;
}
if (viewer.classList.contains("is-ritual")) {
return;
}
var nextY = event.touches[0].clientY;
var delta = touchY - nextY;
touchY = nextY;
event.preventDefault();
if (!isClosingProject) {
queueShift(delta * 1.25);
}
}, { passive: false });
document.addEventListener("keydown", function (event) {
var key = event.key;
var forward = key === "ArrowDown" || key === "ArrowRight";
var back = key === "ArrowUp" || key === "ArrowLeft";
if (!viewer.classList.contains("is-active")) {
return;
}
if (key === "Tab") {
trapTab(event);
return;
}
if (!viewer.classList.contains("is-expanded")) {
return;
}
if (keyBelongsToTarget(event)) {
if (key === "Escape" && !/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
closeProject();
}
return;
}
if (key === "Escape") {
closeProject();
return;
}
if (viewer.classList.contains("is-ritual")) {
return;
}
if (!forward && !back && key !== "PageDown" && key !== "PageUp" && key !== "Home" && key !== "End") {
return;
}
event.preventDefault();
if (isClosingProject) {
return;
}
if (isStackedMode()) {
if (key === "Home") {
story.scrollTop = 0;
} else if (key === "End") {
story.scrollTop = story.scrollHeight;
} else {
scrollStoryBy((key === "PageDown" || key === "PageUp" ? 0.85 : 0.15) * story.clientHeight * (forward || key === "PageDown" ? 1 : -1));
}
return;
}
if (key === "Home") {
setShift(0, false);
} else if (key === "End") {
setShift(maxShift, false);
} else {
stepPanel(forward || key === "PageDown" ? 1 : -1);
}
});
window.addEventListener("resize", function () {
if (!viewer.classList.contains("is-active") || !activeTrigger || !activeProject) {
return;
}
setViewerVars(activeTrigger);
fitIntro();
updateMaxShift();
});
function openById(id, trigger) {
var source = trigger || document.querySelector('[data-project-trigger="' + id + '"]');
if (!source) {
return;
}
if (viewer.classList.contains("is-active")) {
var once = function (event) {
document.removeEventListener("harini:project-closed", once);
window.setTimeout(function () {
openProject(source).catch(noop);
}, 60);
};
document.addEventListener("harini:project-closed", once);
closeProject();
return;
}
openProject(source).catch(noop);
}
api.open = openById;
api.close = closeProject;
api.refresh = updateMaxShift;
api.isOpen = function () {
return viewer.classList.contains("is-active");
};
}
var api = {
init: init,
imageUrl: imageUrl,
open: noop,
close: noop,
refresh: noop,
isOpen: function () {
return false;
}
};
window.HariniProjectViewer = api;
})();
