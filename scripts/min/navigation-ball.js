/* scripts/navigation-ball.js (source 6c511025689ad4b5), made smaller by tools/minify.mjs: edit the source, then run node tools/minify.mjs */
(function () {
"use strict";
const NAV_BALL_PATH_MODE = "bezier";
const DEBUG_NAV_TRAJECTORY_OVERLAY = false;
const DEBUG_NAV_BALL_SEQUENCE = false;
const DEBUG_PHONE_NAV_BALL = false;
const MAIN_PATH_SPEED = 430;
const MAIN_PATH_MIN_DURATION = 0.6;
const MAIN_PATH_MAX_DURATION = 6;
const BEZIER_LIFT_MIN = 40;
const BEZIER_LIFT_SPAN = 0.55;
const BEZIER_LIFT_Z = 0.65;
const BEZIER_MIN_LIFT = 10;
const FLIGHT_TOP_RISE_FACTOR = 1.5;
const FLIGHT_TOP_RISE_MIN = 100;
const FLIGHT_TOP_RISE_MAX = 170;
const DROP_FACTOR = 1.6;
const DROP_MIN = 110;
const DROP_MAX = 220;
const DROP_ROOM_SHARE = 0.75;
const DROP_FLOOR = 40;
const DROP_SECONDS_BASE = 0.62;
const DROP_SCROLL_PX_PER_SECOND = 4800;
const DROP_SECONDS_MIN = 0.75;
const DROP_SECONDS_MAX = 1.38;
const TOP_SPEED_SHARE = 0.8;
const TOP_SPEED_MIN = 40;
const SHORT_FALL_FACTOR = 0.55;
const SHORT_FALL_MIN = 36;
const SHORT_FALL_MAX = 64;
const SHORT_FALL_FLOOR = 20;
const UP_ARC_RISE_FACTOR = 0.9;
const UP_ARC_RISE_MIN = 56;
const UP_BEZIER_LIFT_SPAN = 0.3;
const UP_ARC_RISE_MAX = 100;
const UP_RISE_MIN = 80;
const UP_ARC_ROOM = 40;
const UP_RISE_SPEED_MIN = 90;
const UP_RISE_TARGET_SPEED = 300;
const UP_SCROLL_END_SHARE = 0.92;
const UP_POST_BASE_SECONDS = 0.3;
const UP_POST_PX_PER_SECOND = 450;
const UP_POST_MIN_SECONDS = 0.5;
const UP_POST_MAX_SECONDS = 1.4;
const UP_LOW_ARC_DROP = 170;
const UP_SCROLL_SECONDS_BASE = 0.5;
const UP_SCROLL_PX_PER_SECOND = 6000;
const UP_SCROLL_SECONDS_MIN = 0.6;
const UP_SCROLL_SECONDS_MAX = 0.95;
const POST_APEX_ARC_SECONDS = 0.4;
const POST_APEX_MAX_SECONDS = 2.4;
const RISE_EASE_SHARE = 0.35;
const RISE_EASE_MIN = 60;
const RISE_EASE_MAX = 220;
const FLIGHT_TOP_CLEAR_SHARE = 0.12;
const FLIGHT_TOP_CLEAR_MIN = 72;
const FLIGHT_TOP_CLEAR_MIN_PHONE = 56;
const FLIGHT_TOP_CLEAR_MAX = 150;
const LANDING_FLIGHT_ROOM = 130;
const BEZIER_SAMPLES = 720;
const PHONE_MAIN_LIFT_FACTOR = 1.7;
const PHONE_MAIN_LIFT_MIN = 84;
const PHONE_MAIN_LIFT_MAX = 150;
const PHONE_MAIN_LIFT_FLOOR = 28;
const PHONE_APEX_HANG = 110;
const ARCHIVE_STEP_FACTOR = 0.055;
const ARCHIVE_STEP_MIN = 48;
const ARCHIVE_STEP_MAX = 110;
const LANDING_EDGE_BUFFER = 6;
const LANDING_SCREEN_FRACTION = 0.2;
const LANDING_SCREEN_FRACTION_MAX = 0.34;
const SCROLL_PROGRESS_MODE = "smootherstep";
const BALL_MORPH_DURATION = 1300;
const NAV_BALL_PREP_DURATIONS = [360, 430, 500];
const NAV_BALL_LANDING_DURATIONS = [480, 360, 260];
const NAV_BALL_ROLL_DURATION = 2180;
const ROLL_GRAVITY = 2600;
const ROLL_FADE_MS = 450;
const ROLL_TIP_MIN_ANGLE = 0.6;
const ROLL_TIP_MAX_ANGLE = 1.25;
const EDGE_TOLERANCE = 1.5;
const MOBILE_BALL_TIME_SCALE = 1.42;
const PHONE_MENU_SPOKE_DURATION = 780;
const PHONE_MENU_SPOKE_STAGGER = 100;
const PHONE_MENU_SPOKE_EASE = "cubic-bezier(0.3, 0.1, 0.2, 1)";
const PHONE_MENU_READY_DELAY = 1270;
const SPOKE_GAP = 7;
const SECTION_IDS = ["landing", "about", "work", "archive", "contact"];
const SECTION_INDEX = { landing: 0, about: 1, work: 2, archive: 3, contact: 4 };
const STATES = {
PLUS_IDLE: "plus_idle",
MENU_OPEN: "menu_open",
NAVI_HOVERED: "navi_hovered",
NAVI_SELECTED: "navi_selected",
NAVI_TEXT_VANISHING: "navi_text_vanishing",
NAVI_TO_BALL_MORPH: "navi_to_ball_morph",
BALL_READY: "ball_ready",
BALL_TAKEOFF: "ball_takeoff",
BALL_FLYING: "ball_flying",
BALL_LANDING: "ball_landing",
BALL_ROLLING_OUT: "ball_rolling_out",
PLUS_RESTORED: "plus_restored"
};
const PHASE = {
MORPH: "morph",
PREP1: "prep1",
PREP2: "prep2",
PREP3: "prep3",
MAIN: "main",
LAND1: "land1",
LAND2: "land2",
LAND3: "land3",
ROLL: "roll",
PLUS: "plus"
};
const PHASE_ORDER = [PHASE.PREP1, PHASE.PREP2, PHASE.PREP3, PHASE.MAIN, PHASE.LAND1, PHASE.LAND2, PHASE.LAND3, PHASE.ROLL];
function clamp(value, min, max) {
return Math.min(Math.max(value, min), max);
}
function mix(from, to, t) {
return from + (to - from) * t;
}
function smootherstep(t) {
const x = clamp(t, 0, 1);
return x * x * x * (x * (x * 6 - 15) + 10);
}
function easeOutCubic(t) {
return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}
function easeRollOut(t) {
return 1 - Math.pow(1 - clamp(t, 0, 1), 2.2);
}
function round(value) {
return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
function parsePixel(value) {
const parsed = parseFloat(value);
return Number.isFinite(parsed) ? parsed : 0;
}
function copyPoint(point) {
return { x: point.x, y: point.y };
}
function centerOf(element) {
const rect = element.getBoundingClientRect();
return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
function sectionIndex(section) {
return Object.prototype.hasOwnProperty.call(SECTION_INDEX, section) ? SECTION_INDEX[section] : 0;
}
function rollDirectionFor(section) {
return section === "archive" || section === "contact" ? 1 : -1;
}
function currentScrollY() {
return window.scrollY || window.pageYOffset || 0;
}
function maxScrollY() {
return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
}
function scrollInstantly(y) {
try {
window.scrollTo({ top: y, left: 0, behavior: "instant" });
} catch (error) {
window.scrollTo(0, y);
}
}
function platformFromElement(element, section, side, kind, ballRadius) {
const safeElement = element || document.body;
const rect = safeElement.getBoundingClientRect();
const scrollY = currentScrollY();
const style = window.getComputedStyle(safeElement);
let x = rect.left + rect.width / 2;
if (side === "left" || side === "right") {
const cornerRadius = parsePixel(side === "left" ? style.borderTopRightRadius : style.borderTopLeftRadius);
const inset = Math.min(cornerRadius + (ballRadius || 22) + LANDING_EDGE_BUFFER, rect.width / 2);
x = side === "left" ? rect.right - inset : rect.left + inset;
}
return {
element: safeElement,
section: section,
side: side || "center",
kind: kind || "platform",
x: clamp(x, 28, window.innerWidth - 28),
y: rect.top + scrollY,
width: rect.width,
height: rect.height
};
}
function cubicBezierPoint(p0, p1, p2, p3, raw) {
const t = clamp(raw, 0, 1);
const u = 1 - t;
return {
x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
};
}
function sampleBezier(A, P1, P2, B, count) {
const points = [];
let length = 0;
let minY = Infinity;
let apexIndex = 0;
for (let index = 0; index <= count; index += 1) {
const point = cubicBezierPoint(A, P1, P2, B, index / count);
if (index > 0) {
const previous = points[index - 1];
length += Math.hypot(point.x - previous.x, point.y - previous.y);
}
if (point.y < minY) {
minY = point.y;
apexIndex = index;
}
points.push({ x: point.x, y: point.y, d: length });
}
points[0].x = A.x;
points[0].y = A.y;
points[count].x = B.x;
points[count].y = B.y;
return { points: points, length: length, minY: minY, apexIndex: apexIndex };
}
function planBezierPath(A, B, z, safeTop, speed, scrollDistance, upward) {
const room = Math.max(B.y - safeTop, 0);
const drop = upward ?
Math.max(Math.min(clamp(z * SHORT_FALL_FACTOR, SHORT_FALL_MIN, SHORT_FALL_MAX), room * 0.5), SHORT_FALL_FLOOR) :
Math.max(Math.min(clamp(z * DROP_FACTOR, DROP_MIN, DROP_MAX), room * DROP_ROOM_SHARE), DROP_FLOOR);
const E = { x: B.x, y: B.y - drop };
const scrollSeconds = upward ?
clamp(UP_SCROLL_SECONDS_BASE + Math.abs(scrollDistance || 0) / UP_SCROLL_PX_PER_SECOND, UP_SCROLL_SECONDS_MIN, UP_SCROLL_SECONDS_MAX) :
clamp(DROP_SECONDS_BASE + Math.abs(scrollDistance || 0) / DROP_SCROLL_PX_PER_SECOND, DROP_SECONDS_MIN, DROP_SECONDS_MAX);
const S = upward ?
{ x: A.x, y: Math.min(clamp(Math.max(Math.min(A.y - Math.max(UP_RISE_MIN, UP_RISE_TARGET_SPEED * scrollSeconds), B.y), B.y - UP_LOW_ARC_DROP), safeTop + UP_ARC_ROOM, A.y - UP_RISE_MIN), A.y) } :
{ x: A.x, y: A.y };
const topY = Math.min(S.y, E.y);
const dx = E.x - S.x;
const riseFor = function (lift) {
return topY - sampleBezier(S, { x: S.x, y: topY - lift }, { x: E.x, y: topY - lift }, E, 96).minY;
};
const wantedRise = upward ? clamp(z * UP_ARC_RISE_FACTOR, UP_ARC_RISE_MIN, UP_ARC_RISE_MAX) : clamp(z * FLIGHT_TOP_RISE_FACTOR, FLIGHT_TOP_RISE_MIN, FLIGHT_TOP_RISE_MAX);
let riseLift = wantedRise;
if (riseFor(riseLift) < wantedRise) {
let low = riseLift;
let high = riseLift * 2;
while (riseFor(high) < wantedRise && high < 8000) {
high *= 2;
}
for (let step = 0; step < 28; step += 1) {
const middle = (low + high) / 2;
if (riseFor(middle) < wantedRise) {
low = middle;
} else {
high = middle;
}
}
riseLift = high;
}
const wantedLift = Math.max(BEZIER_LIFT_MIN, Math.abs(dx) * (upward ? UP_BEZIER_LIFT_SPAN : BEZIER_LIFT_SPAN), z * BEZIER_LIFT_Z, riseLift);
const build = function (lift) {
const controlY = topY - lift;
const P1 = { x: S.x, y: controlY };
const P2 = { x: E.x, y: controlY };
return { lift: lift, P1: P1, P2: P2, sampled: sampleBezier(S, P1, P2, E, BEZIER_SAMPLES) };
};
let plan = build(wantedLift);
if (plan.sampled.minY < safeTop) {
let low = 0;
let high = wantedLift;
for (let step = 0; step < 28; step += 1) {
const middle = (low + high) / 2;
if (sampleBezier(S, { x: S.x, y: topY - middle }, { x: E.x, y: topY - middle }, E, 96).minY >= safeTop) {
low = middle;
} else {
high = middle;
}
}
plan = build(Math.max(low, BEZIER_MIN_LIFT));
}
const dropSeconds = clamp(DROP_SECONDS_BASE + Math.abs(scrollDistance || 0) / DROP_SCROLL_PX_PER_SECOND, DROP_SECONDS_MIN, DROP_SECONDS_MAX);
const arcPoints = plan.sampled.points;
const points = [];
if (S.y < A.y - 0.5) {
const riseSteps = Math.max(2, Math.ceil((A.y - S.y) / 2));
for (let step = 0; step < riseSteps; step += 1) {
points.push({ x: A.x, y: A.y + ((S.y - A.y) * step) / riseSteps });
}
}
const sIndex = points.length;
arcPoints.forEach(function (point) {
points.push({ x: point.x, y: point.y });
});
const apexIndex = sIndex + plan.sampled.apexIndex;
const apexY = points[apexIndex].y;
const eIndex = points.length - 1;
const riseLength = A.y - S.y;
const riseSpeed = upward && riseLength > 1 ? clamp(riseLength / scrollSeconds, UP_RISE_SPEED_MIN, speed * 1.2) : speed;
const dropSteps = Math.max(2, Math.ceil(drop / 2));
for (let step = 1; step <= dropSteps; step += 1) {
points.push({ x: B.x, y: E.y + (drop * step) / dropSteps });
}
let postLength = 0;
for (let index = apexIndex + 1; index < points.length; index += 1) {
postLength += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
}
const postSeconds = upward ?
clamp(UP_POST_BASE_SECONDS + postLength / UP_POST_PX_PER_SECOND, UP_POST_MIN_SECONDS, UP_POST_MAX_SECONDS) :
Math.min(dropSeconds + POST_APEX_ARC_SECONDS, POST_APEX_MAX_SECONDS);
const vTop = clamp((TOP_SPEED_SHARE * postLength) / postSeconds, TOP_SPEED_MIN, Math.max(riseSpeed * (upward ? 0.8 : 0.6), TOP_SPEED_MIN));
const climb = Math.max(S.y - apexY, 1);
const easeDepth = clamp(climb * RISE_EASE_SHARE, RISE_EASE_MIN, RISE_EASE_MAX);
function speedAt(index, gDown) {
const depth = Math.max(points[index].y - apexY, 0);
if (index <= apexIndex) {
const u = clamp(depth / easeDepth, 0, 1);
return vTop + (riseSpeed - vTop) * (1 - (1 - u) * (1 - u));
}
return Math.sqrt(vTop * vTop + 2 * gDown * depth);
}
function segmentTime(index, gDown) {
const a = points[index - 1];
const b = points[index];
const length = Math.hypot(b.x - a.x, b.y - a.y);
return length > 0 ? (2 * length) / Math.max(speedAt(index - 1, gDown) + speedAt(index, gDown), 1e-6) : 0;
}
function postTime(gDown) {
let total = 0;
for (let index = apexIndex + 1; index < points.length; index += 1) {
total += segmentTime(index, gDown);
}
return total;
}
let gLow = 0;
let gHigh = 200;
while (postTime(gHigh) > postSeconds && gHigh < 1e7) {
gHigh *= 2;
}
for (let step = 0; step < 40; step += 1) {
const middle = (gLow + gHigh) / 2;
if (postTime(middle) > postSeconds) {
gLow = middle;
} else {
gHigh = middle;
}
}
const gDown = gHigh;
const times = [0];
for (let index = 1; index < points.length; index += 1) {
times.push(times[index - 1] + segmentTime(index, gDown));
}
const arcSeconds = Math.max(times[eIndex], 0.05);
const riseSeconds = times[sIndex];
const duration = Math.max(times[times.length - 1], arcSeconds + 0.05);
let pathLength = 0;
for (let index = 1; index < points.length; index += 1) {
pathLength += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
}
function pointAt(seconds) {
if (seconds <= 0) {
return { x: A.x, y: A.y };
}
if (seconds >= duration) {
return { x: B.x, y: B.y };
}
let low = 1;
let high = times.length - 1;
while (low < high) {
const middle = (low + high) >> 1;
if (times[middle] < seconds) {
low = middle + 1;
} else {
high = middle;
}
}
const span = times[low] - times[low - 1];
const fraction = span > 1e-12 ? (seconds - times[low - 1]) / span : 0;
return { x: mix(points[low - 1].x, points[low].x, fraction), y: mix(points[low - 1].y, points[low].y, fraction) };
}
const samples = points.map(function (point) {
return { x: point.x, y: point.y };
});
return {
mode: upward ? "rise-then-bezier" : "bezier-then-drop",
duration: duration,
length: pathLength,
speed: pathLength / duration,
pointAt: pointAt,
progressAt: function (seconds) {
return clamp(seconds / duration, 0, 1);
},
scrollProgressAt: function (seconds) {
if (upward) {
return riseSeconds > 0 ? smootherstep(seconds / (riseSeconds * UP_SCROLL_END_SHARE)) : 1;
}
return seconds <= arcSeconds ? 0 : smootherstep((seconds - arcSeconds) / (duration - arcSeconds));
},
samples: samples,
apex: copyPoint(arcPoints[apexIndex]),
guides: [
{ name: "P1", point: copyPoint(plan.P1), colour: "#1fa34a" },
{ name: "P2", point: copyPoint(plan.P2), colour: "#11a5b8" },
upward ? { name: "S (scroll ends)", point: copyPoint(S), colour: "#8a2be2" } : { name: "E (scroll starts)", point: copyPoint(E), colour: "#8a2be2" }
],
geometry: { A: copyPoint(A), E: copyPoint(E), B: copyPoint(B), P1: copyPoint(plan.P1), P2: copyPoint(plan.P2), lift: plan.lift, drop: drop, arcSeconds: arcSeconds, dropSeconds: duration - arcSeconds, launchSpeed: speed, topSpeed: vTop, entrySpeed: speedAt(eIndex, gDown), landingSpeed: speedAt(points.length - 1, gDown), gDown: gDown, safeTop: safeTop }
};
}
function planPhoneBounce(A, B, phoneZ, safeTop, upward) {
const topY = Math.min(A.y, B.y);
const wantedLift = clamp(phoneZ * PHONE_MAIN_LIFT_FACTOR, PHONE_MAIN_LIFT_MIN, PHONE_MAIN_LIFT_MAX);
const lift = Math.max(Math.min(wantedLift, topY - safeTop), PHONE_MAIN_LIFT_FLOOR);
const apex = { x: A.x, y: topY - lift };
const upDistance = Math.abs(A.y - apex.y);
const downDistance = Math.abs(B.y - apex.y);
const upMs = clamp(Math.sqrt(upDistance) * 48, 620, 880);
const hangMs = PHONE_APEX_HANG;
const downMs = clamp(Math.sqrt(downDistance) * 55, 775, 1150);
const totalMs = upMs + hangMs + downMs;
const samples = [];
function pointAtMs(ms) {
if (ms <= 0) {
return { x: A.x, y: A.y };
}
if (ms < upMs) {
const u = ms / upMs;
return { x: A.x, y: mix(A.y, apex.y, u * (2 - u)) };
}
if (ms < upMs + hangMs) {
return { x: A.x, y: apex.y };
}
if (ms < totalMs) {
const t = (ms - upMs - hangMs) / downMs;
return { x: A.x, y: mix(apex.y, B.y, t * t) };
}
return { x: A.x, y: B.y };
}
for (let index = 0; index <= 240; index += 1) {
const point = pointAtMs((index / 240) * totalMs);
samples.push({ x: point.x, y: point.y });
}
return {
mode: "phone-bounce",
duration: totalMs / 1000,
length: upDistance + downDistance,
speed: (upDistance + downDistance) / (totalMs / 1000),
pointAt: function (seconds) {
return pointAtMs(seconds * 1000);
},
progressAt: function (seconds) {
return clamp((seconds * 1000) / totalMs, 0, 1);
},
scrollProgressAt: function (seconds) {
const ms = seconds * 1000;
if (upward) {
return smootherstep(ms / upMs);
}
if (ms <= upMs + hangMs) {
return 0;
}
return smootherstep((ms - upMs - hangMs) / downMs);
},
samples: samples,
apex: copyPoint(apex),
guides: [],
phoneX: A.x,
geometry: { A: copyPoint(A), B: copyPoint(B), apex: copyPoint(apex), lift: lift, wantedLift: wantedLift, upMs: upMs, hangMs: hangMs, downMs: downMs, safeTop: safeTop }
};
}
function bouncePoint(base, height, p) {
const q = clamp(p, 0, 1);
return { x: base.x, y: base.y - 4 * height * q * (1 - q) };
}
function planRollAway(options) {
const dir = options.dir < 0 ? -1 : 1;
const startX = options.startX;
const y = options.y;
const radius = options.radius;
const duration = Math.max(options.durationMs, 1);
const endX = dir < 0 ? -radius - 18 : options.screenW + radius + 18;
const circumference = Math.max(1, Math.PI * radius * 2);
const support = options.support;
const span = endX - startX;
function rollX(ms) {
return mix(startX, endX, easeRollOut(ms / duration));
}
function rotationFor(distance) {
return dir * (distance / circumference) * 360;
}
function timeAtX(x) {
const share = clamp((x - startX) / (Math.abs(span) > 1e-6 ? span : 1), 0, 1);
return (1 - Math.pow(1 - share, 1 / 2.2)) * duration;
}
if (!support) {
const leaveX = dir < 0 ? 0 : options.screenW;
return {
mode: "edge",
totalMs: duration,
leaveMs: timeAtX(leaveX),
at: function (ms) {
const x = rollX(ms);
return { x: x, y: y, rotation: rotationFor(Math.abs(x - startX)), opacity: 1, touching: true, onTop: true };
}
};
}
const gravity = options.gravity;
const cornerR = Math.max(0, support.cornerRadius || 0);
const R = radius + cornerR;
const top = y + radius;
let flatEndX = support.edgeX - dir * cornerR;
if ((flatEndX - startX) * dir < 0) {
flatEndX = startX;
}
const flatMs = timeAtX(flatEndX);
const flatRaw = clamp(flatMs / duration, 0, 1);
const entrySpeed = Math.max((Math.abs(span) * 2.2 * Math.pow(1 - flatRaw, 1.2)) / (duration / 1000), 40);
const corner = { x: flatEndX, y: top + cornerR };
const ratio = (entrySpeed * entrySpeed) / (gravity * R);
const leaveAngle = clamp(Math.acos(clamp((ratio + 2) / 3, -1, 1)), ROLL_TIP_MIN_ANGLE, ROLL_TIP_MAX_ANGLE);
const arcAngles = [0];
let angle = 0;
let speed = entrySpeed;
while (angle < leaveAngle && arcAngles.length < 4000) {
speed = Math.sqrt(entrySpeed * entrySpeed + 2 * gravity * R * (1 - Math.cos(angle)));
angle = Math.min(leaveAngle, angle + (speed / R) * 0.001);
arcAngles.push(angle);
}
const arcMs = arcAngles.length - 1;
const leaveSpeed = Math.sqrt(entrySpeed * entrySpeed + 2 * gravity * R * (1 - Math.cos(leaveAngle)));
const leavePoint = { x: corner.x + dir * R * Math.sin(leaveAngle), y: corner.y - R * Math.cos(leaveAngle) };
const leaveVx = dir * leaveSpeed * Math.cos(leaveAngle);
const leaveVy = leaveSpeed * Math.sin(leaveAngle);
const fadeMs = options.fadeMs;
const flatDistance = Math.abs(flatEndX - startX);
const arcDistance = R * leaveAngle;
const leaveMs = flatMs + arcMs;
let fallMs = fadeMs;
for (let t = 0; t <= fadeMs; t += 4) {
const fy = leavePoint.y + leaveVy * (t / 1000) + 0.5 * gravity * (t / 1000) * (t / 1000);
if (fy - radius > options.screenH) {
fallMs = t;
break;
}
}
return {
mode: "fall",
totalMs: leaveMs + fallMs,
leaveMs: leaveMs,
corner: corner,
leavePoint: leavePoint,
at: function (ms) {
if (ms <= flatMs) {
const x = rollX(ms);
return { x: x, y: y, rotation: rotationFor(Math.abs(x - startX)), opacity: 1, touching: true, onTop: true };
}
if (ms <= leaveMs) {
const index = clamp(ms - flatMs, 0, arcMs);
const low = Math.floor(index);
const a = mix(arcAngles[low], arcAngles[Math.min(low + 1, arcMs)], index - low);
return {
x: corner.x + dir * R * Math.sin(a),
y: corner.y - R * Math.cos(a),
rotation: rotationFor(flatDistance + R * a),
opacity: 1,
touching: true,
onTop: false
};
}
const t = Math.min(ms - leaveMs, fallMs) / 1000;
return {
x: leavePoint.x + leaveVx * t,
y: leavePoint.y + leaveVy * t + 0.5 * gravity * t * t,
rotation: rotationFor(flatDistance + arcDistance + leaveSpeed * t),
opacity: clamp(1 - (t * 1000) / fadeMs, 0, 1),
touching: false,
onTop: false
};
}
};
}
function attachedSide(element, fallback) {
if (!element) {
return fallback;
}
const rect = element.getBoundingClientRect();
const touchesLeft = rect.left <= EDGE_TOLERANCE;
const touchesRight = rect.right >= window.innerWidth - EDGE_TOLERANCE;
if (touchesLeft && !touchesRight) {
return "left";
}
if (touchesRight && !touchesLeft) {
return "right";
}
return fallback;
}
function landingSide(element, fallback) {
const hinted = element && element.closest ? element.closest("[data-ball-roll]") : null;
const hint = hinted ? hinted.getAttribute("data-ball-roll") : "";
return hint === "left" || hint === "right" ? hint : attachedSide(element, fallback);
}
function withSurface(platform, selector) {
platform.surfaceSelector = selector;
return platform;
}
function surfaceEnd(element, selector, dir) {
const start = element.getBoundingClientRect();
let edge = dir < 0 ? start.left : start.right;
let last = element;
if (!selector) {
return { edge: edge, element: last };
}
const rects = Array.prototype.slice.call(document.querySelectorAll(selector)).filter(function (other) {
return other !== element && !other.contains(element) && !element.contains(other);
}).map(function (other) {
return { element: other, rect: other.getBoundingClientRect() };
}).filter(function (item) {
return item.rect.width > 0 && Math.abs(item.rect.top - start.top) <= 3;
});
let grew = true;
while (grew) {
grew = false;
for (let index = 0; index < rects.length; index += 1) {
const rect = rects[index].rect;
const near = dir < 0 ? rect.right >= edge - 4 && rect.left < edge - 0.5 : rect.left <= edge + 4 && rect.right > edge + 0.5;
if (near) {
edge = dir < 0 ? rect.left : rect.right;
last = rects[index].element;
grew = true;
}
}
}
return { edge: edge, element: last };
}
function emitBallEvent(name, detail) {
try {
window.dispatchEvent(new CustomEvent(name, { detail: detail }));
} catch (error) {
}
}
function trajectoryDebugRequested() {
if (DEBUG_NAV_TRAJECTORY_OVERLAY) {
return true;
}
try {
return /(?:^|[?&])navdebug=1(?:&|$)/.test(window.location.search);
} catch (error) {
return false;
}
}
function createTrajectoryDebug(ball) {
const canvas = document.createElement("canvas");
const panel = document.createElement("pre");
const context = canvas.getContext("2d");
let trip = null;
canvas.setAttribute("aria-hidden", "true");
canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483646";
panel.setAttribute("aria-hidden", "true");
panel.style.cssText = "position:fixed;top:8px;right:8px;margin:0;padding:8px 10px;max-width:46vw;pointer-events:none;z-index:2147483647;" +
"background:rgba(255,255,255,0.92);color:#111;border:1px solid #bbb;border-radius:6px;font:10.5px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap";
document.body.appendChild(canvas);
document.body.appendChild(panel);
function fit() {
const ratio = window.devicePixelRatio || 1;
canvas.width = Math.round(window.innerWidth * ratio);
canvas.height = Math.round(window.innerHeight * ratio);
context.setTransform(ratio, 0, 0, ratio, 0, 0);
}
function fmt(point) {
return point ? "(" + Math.round(point.x * 10) / 10 + ", " + Math.round(point.y * 10) / 10 + ")" : "-";
}
function dot(point, colour, radius) {
context.fillStyle = colour;
context.beginPath();
context.arc(point.x, point.y, radius, 0, Math.PI * 2);
context.fill();
}
function ring(point, colour, radius) {
context.strokeStyle = colour;
context.lineWidth = 2;
context.beginPath();
context.arc(point.x, point.y, radius, 0, Math.PI * 2);
context.stroke();
}
function label(point, text, colour) {
context.fillStyle = colour;
context.font = "11px ui-monospace, Consolas, monospace";
context.fillText(text, point.x + 8, point.y - 8);
}
function draw() {
context.clearRect(0, 0, window.innerWidth, window.innerHeight);
if (!trip) {
return;
}
if (trip.isPhone) {
context.save();
context.strokeStyle = "#7ed321";
context.setLineDash([6, 6]);
context.lineWidth = 1.5;
context.beginPath();
context.moveTo(trip.A.x, 0);
context.lineTo(trip.A.x, window.innerHeight);
context.stroke();
context.restore();
}
if (trip.path) {
context.strokeStyle = "#1e6bff";
context.lineWidth = 2;
context.beginPath();
trip.path.samples.forEach(function (point, index) {
if (index === 0) {
context.moveTo(point.x, point.y);
} else {
context.lineTo(point.x, point.y);
}
});
context.stroke();
trip.path.guides.forEach(function (guide) {
dot(guide.point, guide.colour, 4);
label(guide.point, guide.name, guide.colour);
});
}
if (trip.trace.length > 1) {
context.strokeStyle = "rgba(230, 20, 20, 0.85)";
context.lineWidth = 1.25;
context.beginPath();
trip.trace.forEach(function (point, index) {
if (index === 0) {
context.moveTo(point.x, point.y);
} else {
context.lineTo(point.x, point.y);
}
});
context.stroke();
}
ring(trip.A, "#ff8a00", 14);
dot(trip.A, "#ff8a00", 4);
label(trip.A, "A", "#ff8a00");
if (trip.B) {
ring(trip.B, "#e000c8", 14);
dot(trip.B, "#e000c8", 4);
label(trip.B, "B", "#e000c8");
}
if (trip.path) {
dot(trip.path.apex, "#e01010", 5);
label(trip.path.apex, "apex", "#e01010");
}
if (trip.roll && trip.roll.mode === "fall") {
dot(trip.roll.corner, "#ff8a00", 3);
label(trip.roll.corner, "corner", "#ff8a00");
dot(trip.roll.leavePoint, "#e01010", 3);
label(trip.roll.leavePoint, "leaves the corner", "#e01010");
}
}
function writePanel() {
if (!trip) {
panel.textContent = "nav ball debug: waiting for a trip";
return;
}
const lines = [
"device       " + (trip.isPhone ? "phone" : "desktop / tablet") + "  " + window.innerWidth + " x " + window.innerHeight,
"state        " + (ball.dataset.ballState || "-") + "  /  " + (ball.dataset.ballPhase || "-"),
"path mode    " + (trip.path ? trip.path.mode : "(after prep bounces)"),
"A            " + fmt(trip.A),
"B            " + fmt(trip.B),
"apex         " + (trip.path ? fmt(trip.path.apex) : "-")
];
if (trip.path && trip.path.guides.length) {
lines.push("guides       " + trip.path.guides.map(function (guide) {
return guide.name + " " + fmt(guide.point);
}).join("  "));
}
lines.push(
"scroll       start " + Math.round(trip.scrollStart) + "  target " + (trip.scrollTarget == null ? "-" : Math.round(trip.scrollTarget)) + "  now " + Math.round(window.scrollY),
"progress     " + (Math.round(trip.progress * 1000) / 10) + " %",
"path length  " + (trip.path ? Math.round(trip.path.length) + " px, " + Math.round(trip.path.duration * 1000) + " ms" : "-"),
"ball speed   " + Math.round(trip.speed) + " px/s" + (trip.path ? "  (planned " + Math.round(trip.path.speed) + ")" : ""),
"render gap   " + (Math.round(trip.maxGap * 100) / 100) + " px (largest red-to-path distance in the main path)",
"roll-away                        " + (trip.roll ? (trip.roll.mode === "edge" ? "rolls off the screen edge" : "falls off the end of the picture") : "-"),
"scroll moved in prep bounces     " + (trip.flags.scrollMovedDuringPrep ? "YES" : "no"),
"scroll moved in landing bounces  " + (trip.flags.scrollMovedDuringLanding ? "YES" : "no"),
"prep bases equal                 " + (trip.prepDrift > 0.5 ? "NO (" + trip.prepDrift.toFixed(2) + " px)" : "yes"),
"landing bases equal              " + (trip.landDrift > 0.5 ? "NO (" + trip.landDrift.toFixed(2) + " px)" : "yes")
);
if (trip.isPhone) {
lines.push("phone x drift                    " + (trip.phoneDrift > 0.5 ? "YES (" + trip.phoneDrift.toFixed(2) + " px)" : "no"));
}
panel.textContent = lines.join("\n");
}
fit();
window.addEventListener("resize", function () {
fit();
draw();
});
writePanel();
return {
setRoll: function (plan) {
if (trip) {
trip.roll = plan;
draw();
writePanel();
}
},
beginTrip: function (A, info) {
trip = {
A: copyPoint(A),
B: null,
path: null,
isPhone: info.isPhone,
scrollStart: info.scrollStart,
scrollTarget: null,
trace: [],
progress: 0,
speed: 0,
maxGap: 0,
prepDrift: 0,
landDrift: 0,
phoneDrift: 0,
flags: info.flags,
last: null
};
draw();
writePanel();
},
setPath: function (path, A, B, info) {
if (!trip) {
return;
}
trip.path = path;
trip.B = copyPoint(B);
trip.scrollTarget = info.scrollTarget;
draw();
writePanel();
},
frame: function (phase, progress, now) {
if (!trip) {
return;
}
const rect = ball.getBoundingClientRect();
const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
if (trip.last && now > trip.last.now) {
trip.speed = Math.hypot(centre.x - trip.last.x, centre.y - trip.last.y) / ((now - trip.last.now) / 1000);
}
trip.last = { x: centre.x, y: centre.y, now: now };
trip.trace.push(centre);
if (phase === PHASE.MAIN) {
trip.progress = progress;
if (trip.path) {
const samples = trip.path.samples;
let nearest = Infinity;
for (let index = 1; index < samples.length; index += 1) {
const a = samples[index - 1];
const b = samples[index];
const lengthSq = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
const u = lengthSq > 1e-9 ? clamp(((centre.x - a.x) * (b.x - a.x) + (centre.y - a.y) * (b.y - a.y)) / lengthSq, 0, 1) : 0;
nearest = Math.min(nearest, Math.hypot(a.x + (b.x - a.x) * u - centre.x, a.y + (b.y - a.y) * u - centre.y));
}
trip.maxGap = Math.max(trip.maxGap, nearest);
}
}
if (phase === PHASE.PREP1 || phase === PHASE.PREP2 || phase === PHASE.PREP3) {
trip.prepDrift = Math.max(trip.prepDrift, Math.abs(centre.x - trip.A.x));
}
if ((phase === PHASE.LAND1 || phase === PHASE.LAND2 || phase === PHASE.LAND3) && trip.B) {
trip.landDrift = Math.max(trip.landDrift, Math.abs(centre.x - trip.B.x));
}
if (trip.isPhone && phase !== PHASE.ROLL) {
trip.phoneDrift = Math.max(trip.phoneDrift, Math.abs(centre.x - trip.A.x));
if (trip.phoneDrift > 0.5 && !trip.warnedDrift) {
trip.warnedDrift = true;
console.warn("nav ball debug: phone ball moved sideways before the roll-away", trip.phoneDrift);
}
}
draw();
writePanel();
}
};
}
function init() {
const nav = document.querySelector("[data-nav-object]");
const core = document.querySelector("[data-nav-core]");
const spokes = document.querySelector(".radial-lines");
const menu = document.getElementById("radial-menu");
const ball = document.querySelector("[data-travel-ball]");
const ballLabel = document.querySelector("[data-travel-label]");
const travelShadow = ball ? ball.querySelector(".travel-shadow") : null;
const items = Array.prototype.slice.call(document.querySelectorAll("[data-nav-target]"));
const lines = {
about: document.querySelector(".radial-line-about"),
work: document.querySelector(".radial-line-work"),
archive: document.querySelector(".radial-line-archive"),
contact: document.querySelector(".radial-line-contact")
};
const spokeMasks = {};
if (!nav || !core || !spokes || !menu || !ball || !ballLabel || items.length === 0) {
return;
}
const trajectoryDebug = trajectoryDebugRequested() ? createTrajectoryDebug(ball) : null;
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
const coarsePointer = window.matchMedia("(pointer: coarse)");
const mobileViewport = window.matchMedia("(max-width: 767px)");
const tabletLandscapeTouch = window.matchMedia("(min-width: 768px) and (max-width: 1180px) and (orientation: landscape) and (pointer: coarse)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let isOpen = false;
let isTravelling = false;
let isBallAnimating = false;
let isProjectMode = false;
let isPhoneNavOpening = false;
let isPhoneNavOpen = false;
let closeOnBlurTimer = 0;
let phoneMenuReadyTimer = 0;
let menuClosingTimer = 0;
let resetTimer = 0;
let sectionFrame = 0;
let navGeometryFrame = 0;
let currentSection = "landing";
let navState = STATES.PLUS_IDLE;
let activeAnimationToken = 0;
let ballFrames = [];
let ballTimers = [];
let scrollLockActive = false;
let activeTrip = null;
Array.prototype.slice.call(document.querySelectorAll("[data-travel-ball]")).forEach(function (travelBall, index) {
if (index > 0) {
travelBall.remove();
}
});
items.forEach(function (item) {
const original = item.getAttribute("data-nav-target");
item.dataset.navOriginalTarget = original;
item.dataset.navOriginalLabel = item.textContent.trim();
item.setAttribute("aria-label", "go to " + original);
});
function originalTarget(button) {
return button.dataset.navOriginalTarget || button.getAttribute("data-nav-target");
}
function isMobileViewport() {
return mobileViewport.matches;
}
function isCoarsePointer() {
return coarsePointer.matches;
}
function isMobileTapMode() {
return isMobileViewport() || isCoarsePointer();
}
function isTabletLandscapeTouchViewport() {
return tabletLandscapeTouch.matches;
}
function usesStagedMenuOpen() {
return isMobileViewport() || isTabletLandscapeTouchViewport();
}
function canUseHoverNav() {
return canHover.matches && !isMobileTapMode();
}
function motionScale() {
return isMobileViewport() ? MOBILE_BALL_TIME_SCALE : 1;
}
function scaleMotionDuration(duration) {
return reducedMotion.matches ? 1 : duration * motionScale();
}
function setState(nextState) {
navState = nextState;
nav.dataset.navState = nextState;
ball.dataset.ballState = nextState;
}
function setBallPhase(phase) {
ball.dataset.ballPhase = phase;
}
function clearBallTimersAndFrames() {
ballFrames.forEach(function (frameId) {
window.cancelAnimationFrame(frameId);
});
ballTimers.forEach(function (timerId) {
window.clearTimeout(timerId);
});
ballFrames = [];
ballTimers = [];
window.clearTimeout(resetTimer);
resetTimer = 0;
}
function isCurrentAnimation(token) {
return token === activeAnimationToken;
}
function requestBallFrame(callback, token) {
const frameId = window.requestAnimationFrame(function (now) {
ballFrames = ballFrames.filter(function (storedFrameId) {
return storedFrameId !== frameId;
});
if (!isCurrentAnimation(token)) {
return;
}
try {
callback(now);
} catch (error) {
console.error("Navigation ball animation failed", error);
resetBallState(STATES.PLUS_IDLE);
clearChoiceState(STATES.PLUS_IDLE);
}
});
ballFrames.push(frameId);
return frameId;
}
function setBallTimeout(callback, delay, token) {
const timerId = window.setTimeout(function () {
ballTimers = ballTimers.filter(function (storedTimerId) {
return storedTimerId !== timerId;
});
if (!isCurrentAnimation(token)) {
return;
}
callback();
}, delay);
ballTimers.push(timerId);
return timerId;
}
function cancelBallAnimation() {
activeAnimationToken += 1;
clearBallTimersAndFrames();
}
function beginBallAnimation() {
cancelBallAnimation();
activeAnimationToken += 1;
return activeAnimationToken;
}
function preventScrollInput(event) {
if (event.cancelable) {
event.preventDefault();
}
}
function preventScrollKeys(event) {
const typingTarget = event.target;
if (typingTarget && typingTarget.nodeType === 1 && (typingTarget.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(typingTarget.tagName))) {
return;
}
const keys = [" ", "Spacebar", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"];
if (keys.indexOf(event.key) !== -1 && event.cancelable) {
event.preventDefault();
}
}
function lockUserScroll() {
if (scrollLockActive) {
return;
}
scrollLockActive = true;
window.addEventListener("wheel", preventScrollInput, { passive: false });
window.addEventListener("touchmove", preventScrollInput, { passive: false });
window.addEventListener("keydown", preventScrollKeys, { passive: false });
}
function unlockUserScroll() {
if (!scrollLockActive) {
return;
}
scrollLockActive = false;
window.removeEventListener("wheel", preventScrollInput, { passive: false });
window.removeEventListener("touchmove", preventScrollInput, { passive: false });
window.removeEventListener("keydown", preventScrollKeys, { passive: false });
}
function landingAnimationController() {
return window.landingGirlAnimation || null;
}
function shouldDelayForLandingAnimation(targetId) {
const landingAnimation = landingAnimationController();
return targetId !== "landing" &&
landingAnimation &&
typeof landingAnimation.isLandingActive === "function" &&
landingAnimation.isLandingActive() &&
typeof landingAnimation.interruptForNavigation === "function";
}
function notifyLandingPlusOpened() {
const landingAnimation = landingAnimationController();
window.dispatchEvent(new CustomEvent("landing-nav-plus-opened"));
if (
landingAnimation &&
typeof landingAnimation.isLandingActive === "function" &&
landingAnimation.isLandingActive() &&
typeof landingAnimation.handlePlusDistraction === "function"
) {
landingAnimation.handlePlusDistraction();
}
}
function startLandingAnimationInterrupt(targetId) {
const landingAnimation = landingAnimationController();
if (!shouldDelayForLandingAnimation(targetId)) {
return Promise.resolve();
}
window.dispatchEvent(new CustomEvent("landing-nav-circle-selected", { detail: { targetSectionId: targetId } }));
return landingAnimation.interruptForNavigation();
}
function ballDiameter() {
return ball.offsetWidth || 44;
}
function ballRadius() {
return ballDiameter() / 2;
}
function setBallPosition(x, y) {
ball.style.setProperty("--ball-x", x + "px");
ball.style.setProperty("--ball-y", y + "px");
}
function setBallScale(scaleX, scaleY) {
ball.style.setProperty("--ball-scale-x", String(scaleX));
ball.style.setProperty("--ball-scale-y", String(scaleY));
}
function applyBounceScale(raw, intensity) {
const p = clamp(raw, 0, 1);
const liftRatio = 4 * p * (1 - p);
const safeIntensity = clamp(intensity, 0, 1);
setBallScale(
mix(1 + 0.08 * safeIntensity, 1 - 0.04 * safeIntensity, liftRatio),
mix(1 - 0.08 * safeIntensity, 1 + 0.06 * safeIntensity, liftRatio)
);
}
function setTimelineShadow(opacity, scale) {
if (!travelShadow) {
return;
}
travelShadow.style.animation = "none";
travelShadow.style.transition = "none";
travelShadow.style.opacity = String(clamp(opacity, 0, 1));
travelShadow.style.transform = "translateX(-50%) scaleX(" + clamp(scale, 0.5, 1.4) + ")";
}
function resetTimelineShadow() {
if (!travelShadow) {
return;
}
travelShadow.style.animation = "";
travelShadow.style.transition = "";
travelShadow.style.opacity = "";
travelShadow.style.transform = "";
}
function resetBallClasses() {
ball.classList.remove(
"is-visible",
"is-forming",
"is-ready",
"is-lifting",
"is-moving",
"is-flying",
"is-landing",
"is-landed",
"is-arrived",
"is-paused",
"is-rolling",
"is-restoring",
"is-contact-landing",
"is-launching"
);
}
function hideTravelBallImmediately() {
resetBallClasses();
ball.style.opacity = "0";
ball.style.setProperty("--ball-lift", "0px");
ball.style.setProperty("--ball-scale-x", "1");
ball.style.setProperty("--ball-scale-y", "1");
ball.style.setProperty("--ball-rotation", "0deg");
ball.style.removeProperty("--restore-duration");
delete ball.dataset.ballPhase;
resetTimelineShadow();
}
function hideTravelBallForPlusRestore() {
ball.style.transition = "none";
resetBallClasses();
ballLabel.textContent = "";
ball.style.opacity = "0";
ball.style.setProperty("--ball-x", "-9999px");
ball.style.setProperty("--ball-y", "-9999px");
ball.style.setProperty("--ball-lift", "0px");
ball.style.setProperty("--ball-scale-x", "1");
ball.style.setProperty("--ball-scale-y", "1");
ball.style.setProperty("--ball-rotation", "0deg");
ball.style.removeProperty("--restore-duration");
resetTimelineShadow();
window.requestAnimationFrame(function () {
ball.style.transition = "";
resetTimelineShadow();
});
}
function resetBallState(finalState) {
activeTrip = null;
cancelBallAnimation();
hideTravelBallImmediately();
ballLabel.textContent = "";
isTravelling = false;
isBallAnimating = false;
unlockUserScroll();
nav.classList.remove("is-plus-restoring", "is-ball-closing");
document.documentElement.classList.remove("is-ball-animating");
setState(finalState || STATES.PLUS_IDLE);
}
function setMenuA11y(open) {
core.setAttribute("aria-expanded", String(open));
core.setAttribute("aria-label", isProjectMode ? "close project" : open ? "close navigation" : "open navigation");
menu.setAttribute("aria-hidden", String(!open));
items.forEach(function (item) {
item.tabIndex = open ? 0 : -1;
});
}
function detectCurrentSection() {
const scrollY = currentScrollY();
const probe = scrollY + window.innerHeight * 0.52;
let detected = "landing";
SECTION_IDS.forEach(function (id) {
const section = document.getElementById(id);
if (!section) {
return;
}
if (section.getBoundingClientRect().top + scrollY <= probe) {
detected = id;
}
});
return detected;
}
function updateCurrentSection(section, force) {
const nextSection = section || detectCurrentSection();
if (!force && isTravelling) {
return;
}
currentSection = nextSection;
items.forEach(function (button) {
const original = originalTarget(button);
const isCurrentDestination = currentSection !== "landing" && original === currentSection;
const nextLabel = isCurrentDestination ? "home" : button.dataset.navOriginalLabel || original;
const nextTarget = isCurrentDestination ? "landing" : original;
if (button.textContent.trim() !== nextLabel) {
button.textContent = nextLabel;
}
button.setAttribute("data-nav-target", nextTarget);
button.setAttribute("aria-label", isCurrentDestination ? "go home" : "go to " + original);
});
if (isOpen) {
updateSpokeGeometry();
}
}
function queueCurrentSectionUpdate() {
if (isTravelling || sectionFrame) {
return;
}
sectionFrame = window.requestAnimationFrame(function () {
sectionFrame = 0;
updateCurrentSection(detectCurrentSection());
});
}
function ensureSpokeMask(label) {
let maskParts = spokeMasks[label];
if (maskParts) {
return maskParts;
}
let defs = spokes.querySelector("defs");
if (!defs) {
defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
spokes.insertBefore(defs, spokes.firstChild);
}
const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
const drawLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
const maskId = "nav-spoke-mask-" + label;
mask.setAttribute("id", maskId);
mask.setAttribute("maskUnits", "userSpaceOnUse");
rect.setAttribute("fill", "black");
rect.setAttribute("x", "0");
rect.setAttribute("y", "0");
drawLine.setAttribute("stroke", "white");
drawLine.setAttribute("stroke-width", "8");
drawLine.setAttribute("stroke-linecap", "round");
drawLine.setAttribute("fill", "none");
drawLine.setAttribute("vector-effect", "non-scaling-stroke");
mask.appendChild(rect);
mask.appendChild(drawLine);
defs.appendChild(mask);
maskParts = { id: maskId, mask: mask, rect: rect, drawLine: drawLine, length: 0 };
spokeMasks[label] = maskParts;
return maskParts;
}
function playSpokeDraw(options) {
const staged = Boolean(options && options.staged);
const duration = reducedMotion.matches ? 1 : staged ? PHONE_MENU_SPOKE_DURATION : 460;
["about", "work", "archive", "contact"].forEach(function (label, index) {
const maskParts = spokeMasks[label];
if (!maskParts) {
return;
}
maskParts.drawLine.style.transition = "stroke-dashoffset " + duration + "ms " + (staged ? PHONE_MENU_SPOKE_EASE : "cubic-bezier(0.22, 1, 0.36, 1)");
maskParts.drawLine.style.transitionDelay = reducedMotion.matches ? "0ms" : staged ? index * PHONE_MENU_SPOKE_STAGGER + "ms" : 380 + index * 38 + "ms";
maskParts.drawLine.style.strokeDashoffset = "0";
});
}
function readPlusGeometry() {
const coreRect = core.getBoundingClientRect();
return {
viewportWidth: window.innerWidth,
viewportHeight: window.innerHeight,
measuredPlusCentreX: coreRect.left + coreRect.width / 2,
measuredPlusCentreY: coreRect.top + coreRect.height / 2,
measuredSpokeOriginX: coreRect.left + coreRect.width / 2,
measuredSpokeOriginY: coreRect.top
};
}
function updateSpokeGeometry(options) {
const resetDraw = Boolean(options && options.resetDraw);
const plus = readPlusGeometry();
const plusRadius = core.offsetWidth / 2;
spokes.setAttribute("viewBox", "0 0 " + window.innerWidth + " " + window.innerHeight);
spokes.setAttribute("width", String(window.innerWidth));
spokes.setAttribute("height", String(window.innerHeight));
items.forEach(function (button) {
const label = originalTarget(button);
const line = lines[label];
const centre = centerOf(button);
if (!line) {
return;
}
const dx = centre.x - plus.measuredPlusCentreX;
const dy = centre.y - plus.measuredPlusCentreY;
const distance = Math.max(1, Math.hypot(dx, dy));
const startOffset = Math.min(distance / 2, plusRadius + SPOKE_GAP);
const endOffset = Math.min(distance / 2, button.offsetWidth / 2 + SPOKE_GAP);
const originX = plus.measuredPlusCentreX + (dx / distance) * startOffset;
const originY = plus.measuredPlusCentreY + (dy / distance) * startOffset;
const point = {
x: centre.x - (dx / distance) * endOffset,
y: centre.y - (dy / distance) * endOffset
};
const length = Math.max(1, Math.hypot(point.x - originX, point.y - originY));
const maskParts = ensureSpokeMask(label);
maskParts.length = length;
maskParts.mask.setAttribute("x", "0");
maskParts.mask.setAttribute("y", "0");
maskParts.mask.setAttribute("width", String(window.innerWidth));
maskParts.mask.setAttribute("height", String(window.innerHeight));
maskParts.rect.setAttribute("width", String(window.innerWidth));
maskParts.rect.setAttribute("height", String(window.innerHeight));
maskParts.drawLine.setAttribute("x1", originX);
maskParts.drawLine.setAttribute("y1", originY);
maskParts.drawLine.setAttribute("x2", point.x);
maskParts.drawLine.setAttribute("y2", point.y);
maskParts.drawLine.style.strokeDasharray = String(length);
if (resetDraw) {
maskParts.drawLine.style.transition = "none";
maskParts.drawLine.style.transitionDelay = "0ms";
maskParts.drawLine.style.strokeDashoffset = String(length);
} else if (isOpen) {
maskParts.drawLine.style.strokeDashoffset = "0";
}
line.setAttribute("x1", originX);
line.setAttribute("y1", originY);
line.setAttribute("x2", point.x);
line.setAttribute("y2", point.y);
line.setAttribute("vector-effect", "non-scaling-stroke");
line.setAttribute("mask", "url(#" + maskParts.id + ")");
line.removeAttribute("pathLength");
});
}
function queueNavGeometryUpdate() {
if (navGeometryFrame) {
return;
}
navGeometryFrame = window.requestAnimationFrame(function () {
navGeometryFrame = 0;
updateSpokeGeometry();
});
}
function clearPhoneMenuState() {
window.clearTimeout(phoneMenuReadyTimer);
phoneMenuReadyTimer = 0;
isPhoneNavOpening = false;
isPhoneNavOpen = false;
nav.classList.remove("is-phone-nav-preparing", "is-phone-nav-opening", "is-phone-nav-ready");
}
function setOpen(open, options) {
if (isTravelling || isProjectMode || isBallAnimating) {
return;
}
const staged = Boolean(options && options.staged);
window.clearTimeout(closeOnBlurTimer);
window.clearTimeout(menuClosingTimer);
nav.classList.remove("is-menu-closing");
if (!open && isOpen && !reducedMotion.matches && parseFloat(window.getComputedStyle(items[0].parentElement).opacity) > 0.5) {
nav.classList.add("is-menu-closing");
menuClosingTimer = window.setTimeout(function () {
nav.classList.remove("is-menu-closing");
}, 260);
}
if (!open) {
clearPhoneMenuState();
}
if (open) {
updateCurrentSection(detectCurrentSection(), true);
}
isOpen = open;
nav.classList.toggle("is-open", open);
setState(open ? STATES.MENU_OPEN : STATES.PLUS_IDLE);
setMenuA11y(open);
if (open && !staged) {
window.requestAnimationFrame(function () {
updateSpokeGeometry({ resetDraw: true });
window.requestAnimationFrame(function () {
playSpokeDraw();
});
});
window.setTimeout(function () {
updateSpokeGeometry();
}, reducedMotion.matches ? 1 : 1120);
}
}
function openStagedMenu() {
if (isPhoneNavOpening || isOpen || isTravelling || isProjectMode || isBallAnimating) {
return;
}
clearPhoneMenuState();
isPhoneNavOpening = true;
nav.classList.add("is-phone-nav-preparing");
updateCurrentSection(detectCurrentSection(), true);
updateSpokeGeometry({ resetDraw: true });
if (DEBUG_PHONE_NAV_BALL) {
console.debug("phone nav: prepared closed state", { viewport: [window.innerWidth, window.innerHeight] });
}
window.requestAnimationFrame(function () {
window.requestAnimationFrame(function () {
if (!isPhoneNavOpening || isTravelling || isProjectMode) {
clearPhoneMenuState();
return;
}
nav.classList.remove("is-phone-nav-preparing");
nav.classList.add("is-phone-nav-opening");
setOpen(true, { staged: true });
playSpokeDraw({ staged: true });
phoneMenuReadyTimer = window.setTimeout(function () {
if (!isOpen) {
return;
}
nav.classList.add("is-phone-nav-ready");
isPhoneNavOpening = false;
isPhoneNavOpen = true;
updateSpokeGeometry();
if (DEBUG_PHONE_NAV_BALL) {
console.debug("phone nav: open and interactive");
}
}, reducedMotion.matches ? 1 : PHONE_MENU_READY_DELAY);
});
});
}
function clearChoiceState(finalState) {
nav.classList.remove("is-open", "is-choosing", "is-travelling");
clearPhoneMenuState();
items.forEach(function (item) {
item.disabled = false;
item.parentElement.classList.remove("is-selected");
});
setMenuA11y(false);
isOpen = false;
isTravelling = false;
setState(finalState || STATES.PLUS_IDLE);
}
function enterProjectMode() {
resetBallState(STATES.PLUS_IDLE);
clearChoiceState(STATES.PLUS_IDLE);
isOpen = false;
nav.classList.remove("is-open", "is-choosing", "is-travelling");
clearPhoneMenuState();
isProjectMode = true;
nav.classList.remove("is-project-closing");
nav.classList.add("is-project-close");
setState(STATES.PLUS_IDLE);
setMenuA11y(false);
}
function beginProjectClose() {
if (!isProjectMode) {
return;
}
nav.classList.add("is-project-closing");
setMenuA11y(false);
}
function exitProjectMode() {
isProjectMode = false;
nav.classList.remove("is-project-close", "is-project-closing");
setMenuA11y(false);
updateCurrentSection(detectCurrentSection(), true);
}
function getSafeBounds(options) {
const radius = ballRadius();
const margin = Math.max(radius + 18, 18);
const allowFloor = Boolean(options && options.allowFloor);
return {
minX: margin,
maxX: window.innerWidth - margin,
minY: margin,
maxY: allowFloor ? window.innerHeight - radius : window.innerHeight - margin,
floorY: window.innerHeight - radius
};
}
function sectionTopScroll(sectionId) {
const section = document.getElementById(sectionId);
const sectionTop = section ? section.getBoundingClientRect().top + currentScrollY() : maxScrollY();
return clamp(sectionTop, 0, maxScrollY());
}
function contactFloor() {
const contact = document.getElementById("contact");
const contactTop = contact ? contact.getBoundingClientRect().top + currentScrollY() : sectionTopScroll("contact");
return {
element: contact,
section: "contact",
side: "right",
kind: "floor",
x: window.innerWidth * 0.78,
y: contactTop + window.innerHeight,
width: window.innerWidth,
height: 1
};
}
function landingFloor() {
const media = document.querySelector(".landing-media") || document.getElementById("landing") || document.body;
const scrollY = currentScrollY();
const girl = window.__landingGirl;
const stage = girl && girl.stage;
const canvas = stage && stage.canvas;
let groundY = NaN;
if (canvas && canvas.isConnected && stage.scale > 0 && Number.isFinite(stage.offsetY)) {
groundY = canvas.getBoundingClientRect().top + stage.offsetY + (stage.groundY !== undefined ? stage.groundY : 700) * stage.scale;
}
if (!Number.isFinite(groundY)) {
const rect = media.getBoundingClientRect();
groundY = rect.top + rect.height * (700 / 780);
}
return {
element: media,
section: "landing",
side: "center",
kind: "landing-floor",
x: window.innerWidth * 0.38,
y: groundY + scrollY,
width: window.innerWidth,
height: 1
};
}
function targetPlatformFor(section) {
if (section === "landing") {
return landingFloor();
}
if (section === "about") {
const portrait = document.querySelector(".about-portrait img") || document.querySelector(".about-portrait");
return platformFromElement(portrait, "about", landingSide(portrait, "left"), "platform", ballRadius());
}
if (section === "work") {
const tile = document.querySelector(".work-tile-media") || document.querySelector(".work-tile");
return withSurface(platformFromElement(tile, "work", landingSide(tile, "left"), "platform", ballRadius()), ".work-tile-media, .work-tile");
}
if (section === "archive") {
const bar = document.querySelector(".archive-bar");
return withSurface(platformFromElement(bar, "archive", landingSide(bar, "right"), "platform", ballRadius()), ".archive-bar");
}
if (section === "contact") {
return contactFloor();
}
return platformFromElement(document.getElementById(section) || document.body, section, "center");
}
function visiblePathTopMargin(bounds) {
return Math.max(ballRadius() + 44, bounds && Number.isFinite(bounds.minY) ? bounds.minY : 0);
}
function flightTopClearance(isPhone) {
const fade = document.querySelector(".viewport-edge-blur-top");
const fadeHeight = fade ? fade.offsetHeight : 0;
return Math.max(clamp(window.innerHeight * FLIGHT_TOP_CLEAR_SHARE, isPhone ? FLIGHT_TOP_CLEAR_MIN_PHONE : FLIGHT_TOP_CLEAR_MIN, FLIGHT_TOP_CLEAR_MAX), Math.min(fadeHeight, FLIGHT_TOP_CLEAR_MAX));
}
function tripBounceHeight(isPhone) {
const ballSize = ballDiameter();
return isPhone ? clamp(ballSize * 1.45, 38, 72) : clamp(ballSize * 2, 64, 118);
}
function resolveScrollTarget(endPoint, targetId, bounds) {
const radius = ballRadius();
const maxScroll = maxScrollY();
const safeTop = visiblePathTopMargin(bounds);
const z = tripBounceHeight(false);
const overshoot = clamp(z * 0.65, 36, 84);
const minLandingY = safeTop + overshoot + 8;
const flightRoomY = radius + flightTopClearance(isMobileViewport()) + LANDING_FLIGHT_ROOM;
const preferredLandingY = Math.max(window.innerHeight * LANDING_SCREEN_FRACTION, minLandingY + 16, flightRoomY);
const desiredLandingY = clamp(preferredLandingY, bounds.minY, Math.min(bounds.maxY, Math.max(window.innerHeight * LANDING_SCREEN_FRACTION_MAX, minLandingY + 16, flightRoomY)));
if (endPoint.kind === "landing-floor") {
return 0;
}
if (endPoint.kind === "floor" && endPoint.section === "contact") {
return sectionTopScroll("contact");
}
if (endPoint.kind === "floor") {
return maxScroll;
}
return clamp(endPoint.y - (desiredLandingY + radius), 0, maxScroll);
}
function resolveFinalLandingPoint(endPoint, scrollTarget, targetId, bounds) {
const raw = { x: endPoint.x, y: endPoint.y - scrollTarget - ballRadius() };
if (targetId === "contact") {
return { x: clamp(raw.x, bounds.minX, bounds.maxX), y: bounds.floorY };
}
return { x: clamp(raw.x, bounds.minX, bounds.maxX), y: clamp(raw.y, bounds.minY, bounds.maxY) };
}
function showPlusInPlace(token, targetId) {
const restoreDuration = reducedMotion.matches ? 1 : 420;
if (!isCurrentAnimation(token)) {
return;
}
setBallPhase(PHASE.PLUS);
if (DEBUG_NAV_BALL_SEQUENCE) {
console.table({ stage: "plus-reappear-in-place", targetId: targetId, travelBallHidden: true, plusState: STATES.PLUS_RESTORED });
}
activeTrip = null;
hideTravelBallForPlusRestore();
nav.classList.add("is-plus-restoring");
document.documentElement.classList.remove("is-ball-animating");
unlockUserScroll();
clearChoiceState(STATES.PLUS_RESTORED);
resetTimer = setBallTimeout(function () {
nav.classList.remove("is-plus-restoring");
hideTravelBallImmediately();
isBallAnimating = false;
setState(STATES.PLUS_IDLE);
updateCurrentSection(detectCurrentSection(), true);
}, restoreDuration, token);
}
function runTrip(A0, targetId, token) {
const isPhone = isMobileViewport();
const bounds = getSafeBounds({ allowFloor: targetId === "contact" });
const radius = ballRadius();
const z = tripBounceHeight(isPhone);
const prepHeights = [z / 4, z / 2, (3 * z) / 4];
const landingHeights = [(3 * z) / 4, z / 2, z / 4];
const prepDurations = NAV_BALL_PREP_DURATIONS.map(scaleMotionDuration);
const landingDurations = NAV_BALL_LANDING_DURATIONS.map(scaleMotionDuration);
const rollDuration = scaleMotionDuration(NAV_BALL_ROLL_DURATION);
let rollDirection = rollDirectionFor(targetId);
const target = document.getElementById(targetId);
const cleanUrl = window.location.pathname + window.location.search;
const scrollStart = currentScrollY();
const debugInfo = {
deviceType: isPhone ? "phone" : "desktop/tablet",
pathMode: isPhone ? "phone-bounce" : NAV_BALL_PATH_MODE,
A0: copyPoint(A0),
z: z,
prepBases: [],
prepScroll: [],
landingBases: [],
scrollMovedDuringPrep: false,
scrollMovedDuringLanding: false,
lastPathProgress: 0,
lastScrollProgress: 0,
lateral: { min: A0.x, max: A0.x }
};
let endPoint = null;
let scrollTarget = scrollStart;
let F = null;
let path = null;
let mainMs = 1;
let phase = PHASE.PREP1;
let phaseStart = 0;
let speedMin = Infinity;
let speedMax = 0;
let previousSample = null;
let roll = null;
let rollMs = rollDuration;
let leaveSent = false;
if (!isCurrentAnimation(token)) {
return;
}
document.documentElement.classList.add("is-ball-animating");
if (reducedMotion.matches) {
const reducedEnd = targetPlatformFor(targetId);
const reducedScroll = resolveScrollTarget(reducedEnd, targetId, bounds);
const reducedPoint = resolveFinalLandingPoint(reducedEnd, reducedScroll, targetId, bounds);
scrollInstantly(reducedScroll);
setBallPosition(reducedPoint.x, reducedPoint.y);
emitBallEvent("navball:contact", { element: reducedEnd.element, x: reducedPoint.x, strength: 0, index: 0, section: targetId });
updateCurrentSection(targetId, true);
showPlusInPlace(token, targetId);
return;
}
ball.classList.remove("is-forming", "is-landed", "is-ready", "is-landing", "is-contact-landing");
ball.classList.add("is-visible", "is-moving");
resetTimelineShadow();
activeTrip = { targetId: targetId, scrollTarget: null, width: window.innerWidth };
if (trajectoryDebug) {
trajectoryDebug.beginTrip(A0, { isPhone: isPhone, scrollStart: scrollStart, flags: debugInfo });
}
function freezeScrollAt(y, flagName) {
if (Math.abs(currentScrollY() - y) > 0.5) {
debugInfo[flagName] = true;
scrollInstantly(y);
}
}
function archiveLandingX(fallbackX) {
const bar = endPoint && endPoint.element;
if (!bar) {
return fallbackX;
}
const rect = bar.getBoundingClientRect();
const style = window.getComputedStyle(bar);
const minX = rect.left + parsePixel(style.borderTopLeftRadius) + radius + LANDING_EDGE_BUFFER;
const maxX = Math.min(rect.right, window.innerWidth) - parsePixel(style.borderTopRightRadius) - radius - LANDING_EDGE_BUFFER;
const wanted = A0.x + clamp(window.innerWidth * ARCHIVE_STEP_FACTOR, ARCHIVE_STEP_MIN, ARCHIVE_STEP_MAX);
const x = clamp(Math.max(wanted, minX), minX, maxX);
return maxX >= minX && x >= A0.x ? x : fallbackX;
}
function buildMainPath() {
endPoint = targetPlatformFor(targetId);
scrollTarget = resolveScrollTarget(endPoint, targetId, bounds);
F = resolveFinalLandingPoint(endPoint, scrollTarget, targetId, bounds);
if (isPhone) {
F = { x: A0.x, y: F.y };
} else if (targetId === "archive") {
F = { x: archiveLandingX(F.x), y: F.y };
}
const safeTop = radius + flightTopClearance(isPhone);
const upward = scrollTarget < scrollStart - 1;
path = isPhone ? planPhoneBounce(A0, F, z, safeTop, upward) : planBezierPath(A0, F, z, safeTop, MAIN_PATH_SPEED, scrollTarget - scrollStart, upward);
mainMs = Math.max(1, path.duration * 1000);
rollDirection = endPoint.side === "right" ? 1 : endPoint.side === "left" ? -1 : rollDirectionFor(targetId);
if (activeTrip) {
activeTrip.scrollTarget = scrollTarget;
}
if (trajectoryDebug) {
trajectoryDebug.setPath(path, A0, F, { scrollStart: scrollStart, scrollTarget: scrollTarget, isPhone: isPhone });
}
if (DEBUG_NAV_BALL_SEQUENCE || DEBUG_PHONE_NAV_BALL) {
console.table({
device: debugInfo.deviceType,
pathMode: path.mode,
A0: JSON.stringify(A0),
z: round(z),
prepBounceBase1: JSON.stringify(debugInfo.prepBases[0] || null),
prepBounceBase2: JSON.stringify(debugInfo.prepBases[1] || null),
prepBounceBase3: JSON.stringify(debugInfo.prepBases[2] || null),
prepScroll: JSON.stringify(debugInfo.prepScroll.map(round)),
scrollStart: round(scrollStart),
scrollTarget: round(scrollTarget),
B: JSON.stringify(F),
apex: JSON.stringify(path.apex),
flightSeconds: round(path.duration),
pathTotalLength: round(path.length),
speed: round(path.speed),
safeTop: round(safeTop)
});
}
if (debugInfo.scrollMovedDuringPrep) {
console.warn("BUG: scroll moved during prep bounces");
}
if (debugInfo.prepBases.some(function (base) {
return base && (Math.abs(base.x - A0.x) > 0.5 || Math.abs(base.y - A0.y) > 0.5);
})) {
console.warn("BUG: prep bounce base changed");
}
}
function emitContact(index) {
emitBallEvent("navball:contact", {
element: endPoint ? endPoint.element : null,
x: F ? F.x : A0.x,
strength: [1, 0.75, 0.5, 0.25][index] || 0,
index: index,
section: targetId
});
}
function rollSupport() {
if (!endPoint || endPoint.kind !== "platform" || !endPoint.element) {
return null;
}
const end = surfaceEnd(endPoint.element, endPoint.surfaceSelector, rollDirection);
const reachesEdge = rollDirection < 0 ? end.edge <= EDGE_TOLERANCE : end.edge >= window.innerWidth - EDGE_TOLERANCE;
if (reachesEdge) {
return null;
}
const rect = end.element.getBoundingClientRect();
const style = window.getComputedStyle(end.element);
const cornerRadius = parsePixel(rollDirection < 0 ? style.borderTopLeftRadius : style.borderTopRightRadius);
return { edgeX: end.edge, cornerRadius: Math.min(cornerRadius, rect.width / 2, rect.height / 2) };
}
function phaseDuration(name) {
switch (name) {
case PHASE.PREP1:
return prepDurations[0];
case PHASE.PREP2:
return prepDurations[1];
case PHASE.PREP3:
return prepDurations[2];
case PHASE.MAIN:
return mainMs;
case PHASE.LAND1:
return landingDurations[0];
case PHASE.LAND2:
return landingDurations[1];
case PHASE.LAND3:
return landingDurations[2];
default:
return rollMs;
}
}
function enterPhase(name) {
phase = name;
setBallPhase(name);
if (name === PHASE.PREP1 || name === PHASE.PREP2 || name === PHASE.PREP3) {
setState(STATES.BALL_TAKEOFF);
ball.classList.add("is-launching", "is-lifting");
debugInfo.prepBases.push(copyPoint(A0));
debugInfo.prepScroll.push(currentScrollY());
setTimelineShadow(0, 0.72);
return;
}
if (name === PHASE.MAIN) {
buildMainPath();
setState(STATES.BALL_FLYING);
ball.classList.remove("is-launching", "is-lifting", "is-landing", "is-landed", "is-arrived");
ball.classList.add("is-flying");
previousSample = null;
return;
}
if (name === PHASE.LAND1) {
scrollInstantly(scrollTarget);
setBallPosition(F.x, F.y);
setState(STATES.BALL_LANDING);
ball.classList.remove("is-moving", "is-flying", "is-lifting", "is-launching");
if (endPoint.kind === "floor") {
ball.classList.add("is-contact-landing", "is-arrived");
setTimelineShadow(0, 0.72);
} else {
ball.classList.add("is-landing", "is-landed", "is-arrived");
setTimelineShadow(0.42, 1.32);
}
if (target) {
target.focus({ preventScroll: true });
}
updateCurrentSection(targetId, true);
if (window.history && window.history.replaceState) {
window.history.replaceState(null, "", "#" + targetId);
}
debugInfo.landingBases.push(copyPoint(F));
emitContact(0);
return;
}
if (name === PHASE.LAND2 || name === PHASE.LAND3) {
debugInfo.landingBases.push(copyPoint(F));
emitContact(name === PHASE.LAND2 ? 1 : 2);
return;
}
if (name === PHASE.ROLL) {
emitContact(3);
roll = planRollAway({
dir: rollDirection,
startX: F.x,
y: F.y,
radius: radius,
durationMs: rollDuration,
screenW: window.innerWidth,
screenH: window.innerHeight,
support: rollSupport(),
gravity: ROLL_GRAVITY / (motionScale() * motionScale()),
fadeMs: scaleMotionDuration(ROLL_FADE_MS)
});
rollMs = Math.max(1, roll.totalMs);
leaveSent = false;
if (trajectoryDebug) {
trajectoryDebug.setRoll(roll);
}
setState(STATES.BALL_ROLLING_OUT);
ball.classList.remove("is-arrived", "is-landing", "is-landed");
ball.classList.add("is-rolling");
reportLandingSummary();
}
}
function reportLandingSummary() {
const baseDrift = debugInfo.landingBases.some(function (base) {
return Math.abs(base.x - F.x) > 0.5 || Math.abs(base.y - F.y) > 0.5;
});
const phoneLateral = isPhone && debugInfo.lateral.max - debugInfo.lateral.min > 0.5;
if (DEBUG_NAV_BALL_SEQUENCE || DEBUG_PHONE_NAV_BALL) {
console.table({
stage: "after-landing-bounces",
targetId: targetId,
mainSpeedMin: round(speedMin),
mainSpeedMax: round(speedMax),
lastPathProgress: round(debugInfo.lastPathProgress),
lastScrollProgress: round(debugInfo.lastScrollProgress),
scrollAtLanding: round(currentScrollY()),
scrollTarget: round(scrollTarget),
landingBase1: JSON.stringify(debugInfo.landingBases[0] || null),
landingBase2: JSON.stringify(debugInfo.landingBases[1] || null),
landingBase3: JSON.stringify(debugInfo.landingBases[2] || null),
scrollMovedDuringLanding: debugInfo.scrollMovedDuringLanding,
lateralRange: round(debugInfo.lateral.max - debugInfo.lateral.min)
});
}
if (baseDrift) {
console.warn("BUG: landing bounce base changed");
}
if (debugInfo.scrollMovedDuringLanding) {
console.warn("BUG: scroll moved during landing bounces");
}
if (phoneLateral) {
console.warn("BUG: phone ball has lateral motion");
}
}
function renderPhase(name, elapsed, now) {
let raw;
let point;
switch (name) {
case PHASE.PREP1:
case PHASE.PREP2:
case PHASE.PREP3: {
const index = name === PHASE.PREP1 ? 0 : name === PHASE.PREP2 ? 1 : 2;
raw = elapsed / prepDurations[index];
freezeScrollAt(scrollStart, "scrollMovedDuringPrep");
point = bouncePoint(A0, prepHeights[index], raw);
setBallPosition(point.x, point.y);
applyBounceScale(raw, [0.68, 0.78, 0.9][index]);
setTimelineShadow(0, 0.72);
break;
}
case PHASE.MAIN: {
const flightSeconds = Math.min(elapsed / 1000, path.duration);
const progress = path.progressAt(flightSeconds);
const scrollProgress = path.scrollProgressAt(flightSeconds);
point = path.pointAt(flightSeconds);
debugInfo.lastPathProgress = progress;
debugInfo.lastScrollProgress = scrollProgress;
scrollInstantly(mix(scrollStart, scrollTarget, scrollProgress));
setBallPosition(point.x, point.y);
const ahead = path.pointAt(Math.min(flightSeconds + 0.02, path.duration));
const step = Math.hypot(ahead.x - point.x, ahead.y - point.y);
const falling = step > 1e-6 ? Math.max(0, (ahead.y - point.y) / step) : 1;
const stretch = smootherstep((progress - 0.6) / 0.3) * falling * falling;
setBallScale(1 - 0.015 * stretch, 1 + 0.025 * stretch);
setTimelineShadow(0, 0.72);
if (previousSample && elapsed > previousSample.elapsed) {
const speed = Math.hypot(point.x - previousSample.x, point.y - previousSample.y) / ((elapsed - previousSample.elapsed) / 1000);
speedMin = Math.min(speedMin, speed);
speedMax = Math.max(speedMax, speed);
}
previousSample = { x: point.x, y: point.y, elapsed: elapsed };
debugInfo.lateral.min = Math.min(debugInfo.lateral.min, point.x);
debugInfo.lateral.max = Math.max(debugInfo.lateral.max, point.x);
break;
}
case PHASE.LAND1:
case PHASE.LAND2:
case PHASE.LAND3: {
const index = name === PHASE.LAND1 ? 0 : name === PHASE.LAND2 ? 1 : 2;
raw = elapsed / landingDurations[index];
freezeScrollAt(scrollTarget, "scrollMovedDuringLanding");
point = bouncePoint(F, landingHeights[index], raw);
setBallPosition(point.x, point.y);
applyBounceScale(raw, [1, 0.72, 0.48][index]);
if (endPoint.kind === "floor") {
setTimelineShadow(0, 0.72);
} else {
const q = clamp(raw, 0, 1);
const contact = Math.pow(1 - 4 * q * (1 - q), 6);
const compressedOpacity = [0.42, 0.32, 0.24][index];
const compressedScale = [1.32, 1.14, 1.04][index];
setTimelineShadow(compressedOpacity * contact, mix(0.72, compressedScale, contact));
}
break;
}
default: {
raw = elapsed / rollDuration;
freezeScrollAt(scrollTarget, "scrollMovedDuringLanding");
const state = roll.at(Math.min(elapsed, rollMs));
ball.style.setProperty("--ball-rotation", state.rotation + "deg");
setBallPosition(state.x, state.y);
setBallScale(1, 1);
if (roll.mode === "fall") {
ball.style.opacity = String(state.opacity);
}
if (!leaveSent && elapsed >= roll.leaveMs) {
leaveSent = true;
emitBallEvent("navball:leave", { element: endPoint.element, section: targetId, mode: roll.mode });
}
if (endPoint.kind !== "platform" || !state.onTop) {
setTimelineShadow(0, 0.72);
} else {
setTimelineShadow(mix(0.3, 0, clamp(raw, 0, 1)), mix(1.08, 0.72, clamp(raw, 0, 1)));
}
}
}
}
function frame(now) {
if (!isCurrentAnimation(token)) {
return;
}
if (!phaseStart) {
phaseStart = now;
enterPhase(PHASE.PREP1);
}
let guard = 0;
while (guard < 12) {
guard += 1;
const duration = phaseDuration(phase);
const elapsed = now - phaseStart;
if (elapsed < duration) {
break;
}
const nextIndex = PHASE_ORDER.indexOf(phase) + 1;
renderPhase(phase, duration, now);
if (nextIndex >= PHASE_ORDER.length) {
showPlusInPlace(token, targetId);
return;
}
phaseStart += duration;
enterPhase(PHASE_ORDER[nextIndex]);
}
renderPhase(phase, now - phaseStart, now);
if (trajectoryDebug) {
trajectoryDebug.frame(phase, debugInfo.lastPathProgress, now);
}
requestBallFrame(frame, token);
}
requestBallFrame(frame, token);
}
function flyBall(startPoint, targetId, token) {
runTrip(startPoint, targetId, token);
}
function chooseDestination(button) {
if (isTravelling || isProjectMode || isBallAnimating || isPhoneNavOpening) {
return;
}
const targetId = button.getAttribute("data-nav-target");
const target = document.getElementById(targetId);
if (!target) {
return;
}
const buttonRect = button.getBoundingClientRect();
const A0 = { x: buttonRect.left + buttonRect.width / 2, y: buttonRect.top + buttonRect.height / 2 };
const delayForLandingAnimation = shouldDelayForLandingAnimation(targetId);
const morphDuration = reducedMotion.matches ? 1 : delayForLandingAnimation ? 1500 : BALL_MORPH_DURATION;
let landingInterruptPromise = null;
const token = beginBallAnimation();
isTravelling = true;
isBallAnimating = true;
lockUserScroll();
document.documentElement.classList.add("is-ball-animating");
setState(STATES.NAVI_SELECTED);
nav.classList.remove("is-open");
nav.classList.add("is-choosing");
button.parentElement.classList.add("is-selected");
items.forEach(function (item) {
item.disabled = true;
});
setMenuA11y(false);
setBallPosition(A0.x, A0.y);
ball.style.opacity = "";
ball.style.setProperty("--ball-lift", "0px");
ball.style.setProperty("--ball-scale-x", "1");
ball.style.setProperty("--ball-scale-y", "1");
ball.style.setProperty("--ball-rotation", "0deg");
ball.style.setProperty("--nav-ball-form-duration", morphDuration + "ms");
ballLabel.textContent = "";
resetBallClasses();
setBallPhase(PHASE.MORPH);
ball.classList.add("is-visible", "is-forming");
if (delayForLandingAnimation) {
landingInterruptPromise = startLandingAnimationInterrupt(targetId);
}
setBallTimeout(function () {
setState(STATES.NAVI_TEXT_VANISHING);
}, reducedMotion.matches ? 1 : morphDuration * 0.14, token);
setBallTimeout(function () {
setState(STATES.NAVI_TO_BALL_MORPH);
}, reducedMotion.matches ? 1 : morphDuration * 0.24, token);
setBallTimeout(function () {
nav.classList.add("is-travelling");
setState(STATES.BALL_READY);
ball.classList.remove("is-forming");
ball.classList.add("is-ready");
function go() {
if (!isCurrentAnimation(token)) {
return;
}
flyBall(A0, targetId, token);
}
(landingInterruptPromise || startLandingAnimationInterrupt(targetId)).then(go, go);
}, morphDuration, token);
}
core.addEventListener("click", function (event) {
if (isProjectMode) {
beginProjectClose();
document.dispatchEvent(new CustomEvent("harini:project-close-request"));
return;
}
if (isMobileTapMode()) {
event.preventDefault();
}
if (isTravelling || isBallAnimating) {
return;
}
if (canUseHoverNav() && isOpen) {
return;
}
if (usesStagedMenuOpen() && !isOpen) {
if (isPhoneNavOpening) {
return;
}
notifyLandingPlusOpened();
openStagedMenu();
return;
}
if (isPhoneNavOpening) {
return;
}
if (!isOpen) {
notifyLandingPlusOpened();
}
setOpen(!isOpen);
});
nav.addEventListener("pointerenter", function () {
if (canUseHoverNav() && !isProjectMode && !isBallAnimating) {
if (!isOpen) {
notifyLandingPlusOpened();
}
setOpen(true);
}
});
nav.addEventListener("pointerleave", function () {
if (canUseHoverNav() && !nav.contains(document.activeElement)) {
setOpen(false);
}
});
nav.addEventListener("focusout", function () {
if (isMobileTapMode()) {
return;
}
window.clearTimeout(closeOnBlurTimer);
closeOnBlurTimer = window.setTimeout(function () {
if (isOpen && !nav.contains(document.activeElement)) {
setOpen(false);
}
}, 0);
});
items.forEach(function (item) {
item.addEventListener("pointerenter", function () {
if (canUseHoverNav() && !isTravelling) {
setState(STATES.NAVI_HOVERED);
}
});
item.addEventListener("click", function (event) {
if (isMobileTapMode()) {
event.preventDefault();
}
chooseDestination(item);
});
});
document.addEventListener("click", function (event) {
const outside = !nav.contains(event.target) || event.target === nav || event.target === menu;
if (outside && isOpen && !isTravelling) {
setOpen(false);
}
});
document.addEventListener("keydown", function (event) {
if (event.key === "Escape" && isOpen) {
setOpen(false);
core.focus();
}
});
document.addEventListener("harini:project-open", enterProjectMode);
document.addEventListener("harini:project-closing", beginProjectClose);
document.addEventListener("harini:project-closed", exitProjectMode);
window.addEventListener("scroll", queueCurrentSectionUpdate, { passive: true });
function abortTripAfterResize() {
const trip = activeTrip;
resetBallState(STATES.PLUS_IDLE);
clearChoiceState(STATES.PLUS_IDLE);
if (trip && trip.targetId) {
scrollInstantly(trip.scrollTarget == null ? sectionTopScroll(trip.targetId) : Math.min(trip.scrollTarget, maxScrollY()));
updateCurrentSection(trip.targetId, true);
}
nav.classList.add("is-plus-restoring");
window.setTimeout(function () {
nav.classList.remove("is-plus-restoring");
}, reducedMotion.matches ? 1 : 420);
}
window.addEventListener("resize", function () {
if (activeTrip && Math.abs(window.innerWidth - activeTrip.width) > 1) {
abortTripAfterResize();
}
updateCurrentSection(detectCurrentSection(), true);
if (isOpen) {
queueNavGeometryUpdate();
}
}, { passive: true });
hideTravelBallImmediately();
setMenuA11y(false);
setState(STATES.PLUS_IDLE);
updateCurrentSection(detectCurrentSection(), true);
}
window.HariniNavigationBall = {
init: init
};
})();
