/* scripts/main.js (source 9d8b5ea7f8b205cf), made smaller by tools/minify.mjs: edit the source, then run node tools/minify.mjs */
(function () {
var SCRIPT_DIR = (document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[^\/]*$/, "") : "") || "scripts/";
const CONTACT_FORM_ENDPOINT = "https://formspree.io/f/mwlpdepp";
var CONTACT_FORM_ENDPOINT_PLACEHOLDER = "REPLACE_WITH_YOUR_FORM_ENDPOINT";
var CONTACT_FORM_ENDPOINT_ALT_PLACEHOLDER = "PASTE_YOUR_FORMSPREE_ENDPOINT_HERE";
function initContactForm() {
var form = document.querySelector("[data-contact-form]");
var response = document.querySelector("[data-form-response]");
var submitButton = form ? form.querySelector('[type="submit"]') : null;
var fields = form ? {
name: form.querySelector('[name="name"]'),
email: form.querySelector('[name="email"]'),
message: form.querySelector('[name="message"]')
} : null;
var expandingTextareas = Array.prototype.slice.call(document.querySelectorAll("[data-auto-expand]"));
var isSubmittingContactForm = false;
if (!form || !response || !submitButton || !fields || !fields.name || !fields.email || !fields.message) {
return;
}
function showResponse(message) {
response.textContent = message;
response.classList.toggle("is-visible", Boolean(message));
}
if (!response.id) {
response.id = "contact-form-response";
}
function clearField(field) {
field.removeAttribute("aria-invalid");
field.removeAttribute("aria-describedby");
}
function clearInvalidState() {
Object.keys(fields).forEach(function (key) {
clearField(fields[key]);
});
}
function markInvalid(fieldNames) {
fieldNames.forEach(function (fieldName) {
fields[fieldName].setAttribute("aria-invalid", "true");
fields[fieldName].setAttribute("aria-describedby", response.id);
});
}
function emailIsValid(email) {
return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isEndpointConfigured() {
return CONTACT_FORM_ENDPOINT &&
CONTACT_FORM_ENDPOINT !== CONTACT_FORM_ENDPOINT_PLACEHOLDER &&
CONTACT_FORM_ENDPOINT !== CONTACT_FORM_ENDPOINT_ALT_PLACEHOLDER;
}
function getTrimmedValues() {
return {
name: fields.name.value.trim(),
email: fields.email.value.trim(),
message: fields.message.value.trim()
};
}
function validate(values) {
var missing = [];
if (!values.name) {
missing.push("name");
}
if (!values.email) {
missing.push("email");
}
if (!values.message) {
missing.push("message");
}
if (missing.length > 1) {
return {
message: "please complete all fields before sending.",
fields: missing
};
}
if (missing.length === 1) {
if (missing[0] === "name") {
return {
message: "please fill in your name.",
fields: missing
};
}
if (missing[0] === "email") {
return {
message: "please fill in your email.",
fields: missing
};
}
return {
message: "please write a message.",
fields: missing
};
}
if (!emailIsValid(values.email)) {
return {
message: "please enter a valid email address.",
fields: ["email"]
};
}
return null;
}
function createContactFormData(values) {
var subject = values.name + " has contacted you through your personal website";
var body = "Name: " + values.name + "\nEmail: " + values.email + "\n\nMessage:\n" + values.message;
var formData = new FormData();
formData.append("name", values.name);
formData.append("email", values.email);
formData.append("message", values.message);
formData.append("body", body);
formData.append("_subject", subject);
formData.append("subject", subject);
formData.append("reply_to", values.email);
formData.append("_replyto", values.email);
formData.append("replyTo", values.email);
return formData;
}
function formspreeErrorMessage(result) {
if (!result) {
return "";
}
if (result.errors && result.errors.length) {
return result.errors.map(function (error) {
return error.message;
}).join(" ");
}
return result.error || result.message || "";
}
function userMessageForSubmitError(error) {
var status = error && error.status;
if (status === 429) {
return "too many attempts. please wait and try again.";
}
if (status === 400 || status === 422) {
return "please check the form details and try again.";
}
if (status === 403) {
return "something went wrong. please try again later.";
}
if (status === 404) {
return "something went wrong. please try again later.";
}
if (status >= 500) {
return "form service is temporarily unavailable. please try again later.";
}
return "something went wrong. please try again.";
}
function submitContactForm(values) {
var formData = createContactFormData(values);
return fetch(CONTACT_FORM_ENDPOINT, {
method: "POST",
body: formData,
headers: {
Accept: "application/json"
}
}).then(function (submitResponse) {
return submitResponse.json().catch(function () {
return null;
}).then(function (result) {
var error;
var message;
if (!submitResponse.ok) {
console.error("Contact form submission failed", {
status: submitResponse.status,
statusText: submitResponse.statusText,
result: result
});
message = formspreeErrorMessage(result);
error = new Error(message || "Form submission failed with status " + submitResponse.status);
error.status = submitResponse.status;
error.statusText = submitResponse.statusText;
error.result = result;
throw error;
}
return result;
});
});
}
function expandTextarea(textarea) {
textarea.style.height = "auto";
textarea.style.height = textarea.scrollHeight + "px";
}
expandingTextareas.forEach(function (textarea) {
expandTextarea(textarea);
textarea.addEventListener("input", function () {
expandTextarea(textarea);
});
});
Object.keys(fields).forEach(function (key) {
fields[key].addEventListener("input", function () {
clearField(fields[key]);
});
});
form.addEventListener("submit", function (event) {
var values;
var validation;
event.preventDefault();
if (isSubmittingContactForm) {
return;
}
clearInvalidState();
values = getTrimmedValues();
validation = validate(values);
if (validation) {
markInvalid(validation.fields);
showResponse(validation.message);
fields[validation.fields[0]].focus();
return;
}
fields.name.value = values.name;
fields.email.value = values.email;
fields.message.value = values.message;
if (!isEndpointConfigured()) {
console.warn("Contact form endpoint is missing. Add your secure form endpoint to CONTACT_FORM_ENDPOINT.");
showResponse("the form isn't working just yet. please try again later.");
return;
}
isSubmittingContactForm = true;
submitButton.disabled = true;
submitButton.textContent = "sending";
showResponse("");
submitContactForm(values).then(function () {
form.reset();
expandingTextareas.forEach(function (textarea) {
expandTextarea(textarea);
});
showResponse("sent. i'll get back to you soon.");
}).catch(function (error) {
if (!error || !error.status) {
console.error("Contact form submission failed", error);
}
showResponse(userMessageForSubmitError(error));
}).finally(function () {
isSubmittingContactForm = false;
submitButton.disabled = false;
submitButton.textContent = "go";
});
});
}
function initArchivePlaceholders() {
var items = Array.prototype.slice.call(document.querySelectorAll(".archive-item"));
var container = document.querySelector(".archive-bars");
var activeItem = null;
function setActive(item) {
if (!container) {
return;
}
if (activeItem && activeItem !== item) {
activeItem.classList.remove("is-active");
}
activeItem = item;
if (activeItem) {
activeItem.classList.add("is-active");
container.classList.add("has-active-archive-item");
} else {
container.classList.remove("has-active-archive-item");
}
}
function clearActive(item) {
if (activeItem !== item) {
return;
}
item.classList.remove("is-active");
activeItem = null;
if (container) {
container.classList.remove("has-active-archive-item");
}
}
items.forEach(function (item) {
item.addEventListener("click", function () {
item.blur();
});
item.addEventListener("pointerenter", function () {
setActive(item);
});
item.addEventListener("pointerleave", function () {
clearActive(item);
});
item.addEventListener("focus", function () {
var keyboardFocus = true;
try {
keyboardFocus = item.matches(":focus-visible");
} catch (error) {
keyboardFocus = true;
}
if (keyboardFocus) {
setActive(item);
}
});
item.addEventListener("blur", function () {
clearActive(item);
});
});
}
function initPlaceholderLinks() {
var links = Array.prototype.slice.call(document.querySelectorAll('a[href="#"]'));
links.forEach(function (link) {
link.addEventListener("click", function (event) {
event.preventDefault();
});
});
}
function initViewportEdgeBlur() {
var topThreshold = 32;
var clearTopThreshold = 56;
var bottomThreshold = 48;
var clearBottomThreshold = 84;
var frame = 0;
var currentState = "";
function setScrollState(nextState) {
if (nextState === currentState) {
return;
}
currentState = nextState;
document.body.classList.toggle("is-scroll-top", nextState === "top");
document.body.classList.toggle("is-scroll-middle", nextState === "middle");
document.body.classList.toggle("is-scroll-bottom", nextState === "bottom");
}
function readScrollState() {
var scrollY = window.scrollY || window.pageYOffset;
var scrollHeight = document.documentElement.scrollHeight;
var bottomDistance = scrollHeight - (scrollY + window.innerHeight);
if (currentState === "top" && scrollY < clearTopThreshold) {
return "top";
}
if (currentState === "bottom" && bottomDistance < clearBottomThreshold) {
return "bottom";
}
if (scrollY <= topThreshold) {
return "top";
}
if (bottomDistance <= bottomThreshold) {
return "bottom";
}
return "middle";
}
function update() {
frame = 0;
setScrollState(readScrollState());
}
function queueUpdate() {
if (frame) {
return;
}
frame = window.requestAnimationFrame(update);
}
update();
window.addEventListener("scroll", queueUpdate, { passive: true });
window.addEventListener("resize", queueUpdate, { passive: true });
window.addEventListener("load", queueUpdate, { once: true });
}
function isLightPicture(img) {
var canvas = document.createElement("canvas");
var context = canvas.getContext && canvas.getContext("2d", { willReadFrequently: true });
var data;
var sum = 0;
var i;
if (!context) {
return false;
}
canvas.width = 16;
canvas.height = 16;
try {
context.drawImage(img, 0, 0, 16, 16);
data = context.getImageData(0, 0, 16, 16).data;
} catch (error) {
return false;
}
for (i = 0; i < data.length; i += 4) {
sum += ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * data[i + 3] + 247 * (255 - data[i + 3])) / 255;
}
return sum / (data.length / 4) / 255 > 0.7;
}
function initImageVignette() {
var holders = Array.prototype.slice.call(document.querySelectorAll(".work-tile-media, .archive-bar, .about-portrait"));
var topEdge = document.querySelector(".viewport-edge-blur-top");
var bottomEdge = document.querySelector(".viewport-edge-blur-bottom");
var frame = 0;
var topHeight = 0;
var bottomHeight = 0;
if (holders.length === 0 || !topEdge || !bottomEdge) {
return;
}
var strips = holders.map(function (holder) {
var top = document.createElement("span");
var bottom = document.createElement("span");
top.className = "edge-vignette edge-vignette-top";
bottom.className = "edge-vignette edge-vignette-bottom";
top.setAttribute("aria-hidden", "true");
bottom.setAttribute("aria-hidden", "true");
holder.appendChild(top);
holder.appendChild(bottom);
return { top: top, bottom: bottom };
});
holders.forEach(function (holder) {
var img = holder.querySelector("img");
function judge() {
holder.classList.toggle("is-light-picture", isLightPicture(img));
}
if (!img) {
return;
}
if (img.complete && img.naturalWidth > 0) {
judge();
}
img.addEventListener("load", judge);
});
function measureEdges() {
topHeight = topEdge.getBoundingClientRect().height;
bottomHeight = bottomEdge.getBoundingClientRect().height;
document.documentElement.style.setProperty("--vig-top-h", topHeight + "px");
document.documentElement.style.setProperty("--vig-bottom-h", bottomHeight + "px");
}
function setStrip(strip, visible, shift) {
if (!visible) {
if (strip.style.display === "block") {
strip.style.display = "";
}
return;
}
if (strip.style.display !== "block") {
strip.style.display = "block";
}
strip.style.transform = "translateY(" + shift + "px)";
}
function update() {
var viewHeight = window.innerHeight;
var body = document.body;
var topOn = !body.classList.contains("is-scroll-top");
var bottomOn = !body.classList.contains("is-scroll-bottom");
frame = 0;
if (body.classList.contains("is-project-open")) {
return;
}
var rects = holders.map(function (holder) {
return holder.getBoundingClientRect();
});
rects.forEach(function (rect, index) {
var top = Math.round(rect.top);
var gap = Math.round(viewHeight - rect.bottom);
var reachesTop = topOn && top < topHeight && rect.bottom > 0;
var reachesBottom = bottomOn && gap < bottomHeight && rect.top < viewHeight;
setStrip(strips[index].top, reachesTop, -top);
setStrip(strips[index].bottom, reachesBottom, gap);
});
}
function queueUpdate() {
if (!frame) {
frame = window.requestAnimationFrame(update);
}
}
measureEdges();
update();
window.addEventListener("scroll", queueUpdate, { passive: true });
window.addEventListener("resize", function () {
measureEdges();
queueUpdate();
}, { passive: true });
window.addEventListener("load", function () {
measureEdges();
queueUpdate();
}, { once: true });
if (window.MutationObserver) {
new MutationObserver(function () {
if (!document.body.classList.contains("is-project-open")) {
queueUpdate();
}
}).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
}
function initPlusDisc() {
var nav = document.querySelector(".nav-object");
var core = nav && nav.querySelector(".nav-core");
var PICTURE = "img, picture, video, canvas, .work-tile-media, .archive-bar, .about-portrait";
var frame = 0;
var centre = null;
var over = false;
if (!core || !document.elementsFromPoint) {
return;
}
function measure() {
var rect = core.getBoundingClientRect();
centre = rect.width ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
}
function update() {
var hits;
var next = false;
var i;
frame = 0;
if (!centre) {
return;
}
hits = document.elementsFromPoint(centre.x, centre.y);
for (i = 0; i < hits.length; i += 1) {
if (!hits[i].closest(".nav-object, [data-travel-ball]")) {
next = Boolean(hits[i].closest(PICTURE));
break;
}
}
if (next !== over) {
over = next;
nav.classList.toggle("is-over-picture", over);
}
}
function queueUpdate() {
if (!frame) {
frame = window.requestAnimationFrame(update);
}
}
measure();
queueUpdate();
window.addEventListener("scroll", queueUpdate, { passive: true });
window.addEventListener("resize", function () {
measure();
queueUpdate();
}, { passive: true });
window.addEventListener("load", function () {
measure();
queueUpdate();
}, { once: true });
}
function initTileImageFade() {
Array.prototype.forEach.call(document.querySelectorAll(".work-tile img"), function (img) {
if (img.complete && img.naturalWidth > 0) {
return;
}
function settle() {
img.classList.remove("is-loading");
}
img.classList.add("is-loading");
img.addEventListener("load", settle, { once: true });
img.addEventListener("error", settle, { once: true });
});
}
function initContactLinks() {
Array.prototype.forEach.call(document.querySelectorAll(".contact-links a"), function (link) {
var href = (link.getAttribute("href") || "").trim();
function disable() {
link.setAttribute("aria-disabled", "true");
link.classList.add("is-unset");
}
link.addEventListener("click", function (event) {
if (link.getAttribute("aria-disabled") === "true") {
event.preventDefault();
}
});
if (!href || href === "#" || /^mailto:\s*$/i.test(href) || link.hasAttribute("data-pending")) {
disable();
}
});
}
function initThemeColour() {
var meta = document.querySelector('meta[name="theme-color"]');
var paper = meta ? meta.getAttribute("content") : "";
if (!meta) {
return;
}
document.addEventListener("harini:project-open", function () {
var stage = window.getComputedStyle(document.documentElement).getPropertyValue("--color-stage").trim();
meta.setAttribute("content", stage || "#050505");
});
document.addEventListener("harini:project-closed", function () {
meta.setAttribute("content", paper);
});
}
function initProjectViewerWhenIdle() {
var requested = false;
var ready = false;
var pendingTrigger = null;
var intents = ["pointerdown", "touchstart", "keydown"];
function onEarlyClick(event) {
var trigger = !ready && event.target && event.target.closest ? event.target.closest("[data-project-trigger]") : null;
if (trigger) {
pendingTrigger = trigger;
request();
}
}
function start() {
ready = true;
document.removeEventListener("click", onEarlyClick, true);
if (window.HariniProjectViewer) {
window.HariniProjectViewer.init();
}
if (pendingTrigger && document.contains(pendingTrigger)) {
pendingTrigger.click();
}
pendingTrigger = null;
}
function addScript(name, onload) {
var el = document.createElement("script");
el.src = SCRIPT_DIR + name;
el.async = false;
if (onload) {
el.onload = onload;
}
document.head.appendChild(el);
}
function request() {
if (requested) {
return;
}
requested = true;
intents.forEach(function (type) {
document.removeEventListener(type, request, true);
});
addScript("project-data.js");
addScript("project-viewer.js", start);
}
function whenIdle() {
if (window.requestIdleCallback) {
window.requestIdleCallback(request, { timeout: 2000 });
} else {
window.setTimeout(request, 300);
}
}
document.addEventListener("click", onEarlyClick, true);
intents.forEach(function (type) {
document.addEventListener(type, request, { capture: true, passive: true });
});
if (document.readyState === "complete") {
whenIdle();
} else {
window.addEventListener("load", whenIdle, { once: true });
}
}
function initWarmImages() {
var started = false;
function warm() {
if (started) {
return;
}
started = true;
var queue = Array.prototype.slice.call(document.querySelectorAll("#about img, #work img, #archive img")).filter(function (img) {
return img.getAttribute("loading") === "lazy";
});
function next() {
var img = queue.shift();
if (!img) {
return;
}
img.setAttribute("loading", "eager");
var done = function () {
var later = window.requestIdleCallback || function (cb) { return window.setTimeout(cb, 120); };
later(next);
};
if (img.complete && img.naturalWidth) {
(img.decode ? img.decode() : Promise.resolve()).then(done, done);
} else {
img.addEventListener("load", function () {
(img.decode ? img.decode() : Promise.resolve()).then(done, done);
}, { once: true });
img.addEventListener("error", done, { once: true });
}
}
next();
}
function afterLoad() {
window.setTimeout(function () {
if (window.requestIdleCallback) {
window.requestIdleCallback(warm, { timeout: 3000 });
} else {
warm();
}
}, 1500);
}
if (document.readyState === "complete") {
afterLoad();
} else {
window.addEventListener("load", afterLoad, { once: true });
}
}
document.addEventListener("DOMContentLoaded", function () {
if (window.HariniNavigationBall) {
window.HariniNavigationBall.init();
}
initProjectViewerWhenIdle();
initContactForm();
initArchivePlaceholders();
initPlaceholderLinks();
initViewportEdgeBlur();
initTileImageFade();
initImageVignette();
initPlusDisc();
initContactLinks();
initThemeColour();
initWarmImages();
});
})();
