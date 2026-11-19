/* Navigation plus console + travelling ball.
 *
 * Trip sequence (every trip, in this exact order):
 *   selected nav circle morphs into the ball at A (no movement) -> capture A once -> freeze scroll -> three prep bounces at A (z/4, z/2, 3z/4)
 *   -> compute scrollTarget and the final visible landing point B -> the main path, with the page scrolling in the same requestAnimationFrame:
 *        desktop / tablet: ONE cubic Bezier from A to B whose control points sit straight above A and straight above B, so the ball leaves A
 *          going straight up, bends over one rounded top and comes down into B going straight down (no straight pieces, no joints), at a
 *          constant speed along the curve (arc-length sampling)
 *        phone (max-width: 767px): a vertical bounce, B.x = A.x: the rise slows (ease-out) to a brief hang at the apex, then the fall speeds up
 *          (ease-in) into B
 *   -> exact landing at B -> three landing bounces at B (3z/4, z/2, z/4), page still -> roll out of the screen -> travelling ball hidden
 *   -> plus fades in IN PLACE (nothing travels back to the plus).
 * B is on the top edge of the target image, near the end that is furthest from the screen edge the image is attached to (small buffer).
 *
 * Debug overlay: DEBUG_NAV_TRAJECTORY_OVERLAY below, or ?navdebug=1 in the address. It draws the real sampled path (blue), the ball's rendered
 * centre every frame (red), A, B, the apex and the control points, and a small panel; it never changes the motion.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ configuration */

  const NAV_BALL_PATH_MODE = "bezier";

  const DEBUG_NAV_TRAJECTORY_OVERLAY = false;
  const DEBUG_NAV_BALL_SEQUENCE = false;
  const DEBUG_PHONE_NAV_BALL = false;

  // desktop / tablet main path
  const MAIN_PATH_SPEED = 430; // px/s along the curve, the same all the way (no easing restarts, no pause at the top)
  const MAIN_PATH_MIN_DURATION = 0.6; // s - only for very short trips
  const MAIN_PATH_MAX_DURATION = 6; // s - safety net only
  // height of the two control points above the higher of A and B: max(MIN, |dx| * SPAN, z * Z). The real top of the curve is about 3/4 of this
  // for level ends (less when one end is much lower). Lowered only when the sampled curve would leave the screen.
  const BEZIER_LIFT_MIN = 40;
  const BEZIER_LIFT_SPAN = 0.55;
  const BEZIER_LIFT_Z = 0.65;
  const BEZIER_MIN_LIFT = 10; // never less: the start and the end stay vertical
  const BEZIER_SAMPLES = 720;

  // phone main path (one big vertical bounce)
  const PHONE_MAIN_LIFT_FACTOR = 1.7; // apex = higher of A and B minus clamp(phoneZ * 1.7, 84, 150)
  const PHONE_MAIN_LIFT_MIN = 84;
  const PHONE_MAIN_LIFT_MAX = 150;
  const PHONE_MAIN_LIFT_FLOOR = 28; // on a very short screen the apex may come lower than 84 px, never lower than this
  const PHONE_APEX_HANG = 110; // ms of near-weightlessness at the top

  const LANDING_EDGE_BUFFER = 6; // px: extra room between the ball and the rounded image corner it lands near
  // Where the ball comes to rest, as a fraction of the screen height measured from the top (the page is scrolled so that the platform it lands on
  // is there). Small = the section title sits near the top and the first tile is whole with a good part of the second below it; it is never
  // smaller than what the bounces and the arc need to stay on screen (see resolveScrollTarget).
  const LANDING_SCREEN_FRACTION = 0.2;
  const LANDING_SCREEN_FRACTION_MAX = 0.34;
  const SCROLL_PROGRESS_MODE = "smootherstep"; // easing of the page scroll over the flight time ("linear" = scroll progress equals flight progress)

  const BALL_MORPH_DURATION = 1300;
  const NAV_BALL_PREP_DURATIONS = [360, 430, 500];
  const NAV_BALL_LANDING_DURATIONS = [480, 360, 260];
  const NAV_BALL_ROLL_DURATION = 2180;
  const MOBILE_BALL_TIME_SCALE = 1.42; // calmer bounces / roll on phones

  // staged (phone) menu opening, about 1.2 s in all: each spoke visibly grows out of the top of the plus (780 ms, 100 ms apart); each circle
  // fades and scales in (520 ms, styles/motion.css --phone-pop-delay) as its spoke nears its end; the circles take taps once all are in
  const PHONE_MENU_SPOKE_DURATION = 780;
  const PHONE_MENU_SPOKE_STAGGER = 100;
  const PHONE_MENU_SPOKE_EASE = "cubic-bezier(0.3, 0.1, 0.2, 1)"; // an even, unhurried draw (no burst at the start)
  const PHONE_MENU_READY_DELAY = 1270;

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

  // ball trip phases (also written to data-ball-phase for tests / styling hooks)
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

  /* ------------------------------------------------------------------ small helpers */

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

  function targetSideFor(section) {
    if (section === "about" || section === "work") {
      return "left";
    }

    if (section === "archive" || section === "contact") {
      return "right";
    }

    return "center";
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
    // the page has scroll-behavior: smooth; html.is-ball-animating switches it off, "instant" is the belt and braces
    try {
      window.scrollTo({ top: y, left: 0, behavior: "instant" });
    } catch (error) {
      window.scrollTo(0, y);
    }
  }

  /* Landing platform = the top edge of an element. Images attached to the left edge of the screen are landed on near their RIGHT end, images
   * attached to the right edge near their LEFT end: never on the literal corner - the ball keeps clear of the rounded corner by the corner
   * radius + the ball radius + a small buffer, so it sits completely on the flat top edge. */
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
      y: rect.top + scrollY, // document y of the top edge of the platform
      width: rect.width,
      height: rect.height
    };
  }

  /* ------------------------------------------------------------------ path engine (pure functions) */

  function cubicBezierPoint(p0, p1, p2, p3, raw) {
    const t = clamp(raw, 0, 1);
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
  }

  /* ---- desktop / tablet main path ------------------------------------------------------------------------------------------------------
   * Viewport coordinates (y grows downward). ONE cubic Bezier:
   *     P(t) = (1-t)^3 A + 3(1-t)^2 t P1 + 3(1-t) t^2 P2 + t^3 B,   P1 = (A.x, c),  P2 = (B.x, c),  c = min(A.y, B.y) - lift
   *   P'(0) = 3 (P1 - A) points straight up, P'(1) = 3 (B - P2) points straight down: the ball leaves A vertically and lands on B vertically,
   *   with one rounded top in between (the curve bends from the very first pixel, so nothing reads as a straight line joined to a cap).
   *   A and B keep their real heights: when B is higher than A the climb is long and the drop short, and the other way round.
   * The curve is sampled densely once per trip; the ball moves along it by distance (cumulative arc length) at MAIN_PATH_SPEED, so the speed
   * is the same everywhere: near the top only the vertical part of the motion goes to zero, the ball keeps travelling sideways.
   * Screen edge: the lowest y of the SAMPLED curve (not the control points) must stay at or below safeTop; if not, the lift is reduced
   * (bisection) - A and B never move. */
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

  function planBezierPath(A, B, z, safeTop, speed) {
    const topY = Math.min(A.y, B.y);
    const dx = B.x - A.x;
    const wantedLift = Math.max(BEZIER_LIFT_MIN, Math.abs(dx) * BEZIER_LIFT_SPAN, z * BEZIER_LIFT_Z);
    const build = function (lift) {
      const controlY = topY - lift;
      const P1 = { x: A.x, y: controlY };
      const P2 = { x: B.x, y: controlY };

      return { lift: lift, P1: P1, P2: P2, sampled: sampleBezier(A, P1, P2, B, BEZIER_SAMPLES) };
    };
    let plan = build(wantedLift);

    if (plan.sampled.minY < safeTop) {
      let low = 0;
      let high = wantedLift;

      for (let step = 0; step < 28; step += 1) {
        const middle = (low + high) / 2;

        if (sampleBezier(A, { x: A.x, y: topY - middle }, { x: B.x, y: topY - middle }, B, 96).minY >= safeTop) {
          low = middle;
        } else {
          high = middle;
        }
      }

      plan = build(Math.max(low, BEZIER_MIN_LIFT));
    }

    const points = plan.sampled.points;
    const length = Math.max(plan.sampled.length, 1e-6);
    const duration = clamp(length / speed, MAIN_PATH_MIN_DURATION, MAIN_PATH_MAX_DURATION); // seconds
    const apex = copyPoint(points[plan.sampled.apexIndex]);

    function pointAtDistance(distance) {
      if (distance <= 0) {
        return { x: A.x, y: A.y };
      }

      if (distance >= length) {
        return { x: B.x, y: B.y };
      }

      let low = 1;
      let high = points.length - 1;

      while (low < high) {
        const middle = (low + high) >> 1;

        if (points[middle].d < distance) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }

      const before = points[low - 1];
      const after = points[low];
      const span = after.d - before.d;
      const fraction = span > 1e-9 ? (distance - before.d) / span : 0;

      return { x: mix(before.x, after.x, fraction), y: mix(before.y, after.y, fraction) };
    }

    return {
      mode: "bezier",
      duration: duration,
      length: length,
      speed: length / duration,
      pointAt: function (seconds) {
        return pointAtDistance((clamp(seconds, 0, duration) / duration) * length);
      },
      progressAt: function (seconds) {
        return clamp(seconds / duration, 0, 1);
      },
      scrollProgressAt: function (seconds) {
        const progress = clamp(seconds / duration, 0, 1);

        return SCROLL_PROGRESS_MODE === "linear" ? progress : smootherstep(progress);
      },
      samples: points,
      apex: apex,
      guides: [{ name: "P1", point: copyPoint(plan.P1), colour: "#1fa34a" }, { name: "P2", point: copyPoint(plan.P2), colour: "#11a5b8" }],
      geometry: { A: copyPoint(A), B: copyPoint(B), P1: copyPoint(plan.P1), P2: copyPoint(plan.P2), lift: plan.lift, wantedLift: wantedLift, topY: topY, safeTop: safeTop }
    };
  }

  /* ---- phone main path: one big vertical bounce -------------------------------------------------------------------------------------
   *   A -> apex (ease-out cubic: fast start, visibly slowing to ~0) -> a short hang (PHONE_APEX_HANG) -> B (ease-in cubic: starts slowly,
   *   speeds up and hits B with momentum, then the first landing bounce takes over). x never changes (B.x = A.x).
   *   The two legs get their own durations (the climb and the drop differ whenever A and B are at different heights).
   * Scroll: smooth and monotonic, split at the same moments: it eases in and out during the climb, holds during the hang, eases in and out
   * during the fall, and arrives exactly as the ball lands. */
  function planPhoneBounce(A, B, phoneZ, safeTop) {
    const topY = Math.min(A.y, B.y);
    const wantedLift = clamp(phoneZ * PHONE_MAIN_LIFT_FACTOR, PHONE_MAIN_LIFT_MIN, PHONE_MAIN_LIFT_MAX);
    const lift = Math.max(Math.min(wantedLift, topY - safeTop), PHONE_MAIN_LIFT_FLOOR);
    const apex = { x: A.x, y: topY - lift };
    const upDistance = Math.abs(A.y - apex.y);
    const downDistance = Math.abs(B.y - apex.y);
    const upMs = clamp(Math.sqrt(upDistance) * 48, 620, 880);
    const hangMs = PHONE_APEX_HANG;
    const downMs = clamp(Math.sqrt(downDistance) * 44, 620, 920);
    const totalMs = upMs + hangMs + downMs;
    const upShare = (upDistance + 1e-6) / (upDistance + downDistance + 2e-6); // share of the scroll done on the way up
    const samples = [];

    function pointAtMs(ms) {
      if (ms <= 0) {
        return { x: A.x, y: A.y };
      }

      if (ms < upMs) {
        return { x: A.x, y: mix(A.y, apex.y, easeOutCubic(ms / upMs)) };
      }

      if (ms < upMs + hangMs) {
        return { x: A.x, y: apex.y };
      }

      if (ms < totalMs) {
        const t = (ms - upMs - hangMs) / downMs;

        return { x: A.x, y: mix(apex.y, B.y, t * t * t) };
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

        if (ms <= upMs) {
          return upShare * smootherstep(ms / upMs);
        }

        if (ms <= upMs + hangMs) {
          return upShare;
        }

        return upShare + (1 - upShare) * smootherstep((ms - upMs - hangMs) / downMs);
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

  /* ------------------------------------------------------------------ trajectory debug overlay (off unless asked for) */

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

  /* Draws what really happens: the blue line is the sampled path the animation uses, the red line is the ball's rendered centre (read back from
   * the element every frame, so any stray transform or scroll error shows up as a gap between the two). Fixed to the viewport, never takes
   * pointer events. */
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

  /* ------------------------------------------------------------------ init */

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
    let isBallAnimating = false; // guard: never two ball animations at once
    let isProjectMode = false;
    let isPhoneNavOpening = false; // guard: ignore repeated taps while the staged menu opens
    let isPhoneNavOpen = false;
    let closeOnBlurTimer = 0;
    let phoneMenuReadyTimer = 0;
    let resetTimer = 0;
    let sectionFrame = 0;
    let navGeometryFrame = 0;
    let currentSection = "landing";
    let navState = STATES.PLUS_IDLE;
    let activeAnimationToken = 0;
    let ballFrames = [];
    let ballTimers = [];
    let scrollLockActive = false;
    let activeTrip = null; // { targetId, scrollTarget, width } while a trip runs (used to recover cleanly from a resize mid-trip)

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

    /* -------------------------------------------------------------- device / mode helpers */

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

    /* -------------------------------------------------------------- state + bookkeeping */

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

    /* -------------------------------------------------------------- user scroll lock while the ball travels */

    function preventScrollInput(event) {
      if (event.cancelable) {
        event.preventDefault();
      }
    }

    function preventScrollKeys(event) {
      const typingTarget = event.target;

      if (typingTarget && typingTarget.nodeType === 1 && (typingTarget.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(typingTarget.tagName))) {
        return; // never interfere with typing in the contact form
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

    /* -------------------------------------------------------------- landing animation hooks (kept as they were) */

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

    /* -------------------------------------------------------------- travelling ball: visuals */

    function ballDiameter() {
      return ball.offsetWidth || 44; // layout size: not affected by the squash transform
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

    /* -------------------------------------------------------------- menu a11y + current section ("home" label logic) */

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

    /* -------------------------------------------------------------- spokes (SVG dotted lines revealed through masks) */

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
      const duration = reducedMotion.matches ? 1 : staged ? PHONE_MENU_SPOKE_DURATION : 560;

      ["about", "work", "archive", "contact"].forEach(function (label, index) {
        const maskParts = spokeMasks[label];

        if (!maskParts) {
          return;
        }

        maskParts.drawLine.style.transition = "stroke-dashoffset " + duration + "ms " + (staged ? PHONE_MENU_SPOKE_EASE : "cubic-bezier(0.22, 1, 0.36, 1)");
        maskParts.drawLine.style.transitionDelay = reducedMotion.matches ? "0ms" : staged ? index * PHONE_MENU_SPOKE_STAGGER + "ms" : 520 + index * 38 + "ms";
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
      const originX = plus.measuredSpokeOriginX;
      const originY = plus.measuredSpokeOriginY;

      spokes.setAttribute("viewBox", "0 0 " + window.innerWidth + " " + window.innerHeight);
      spokes.setAttribute("width", String(window.innerWidth));
      spokes.setAttribute("height", String(window.innerHeight));

      items.forEach(function (button) {
        const label = originalTarget(button);
        const line = lines[label];
        const point = centerOf(button);

        if (!line) {
          return;
        }

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

    /* -------------------------------------------------------------- menu open / close (desktop hover + click, staged phone opening) */

    function clearPhoneMenuState() {
      window.clearTimeout(phoneMenuReadyTimer);
      phoneMenuReadyTimer = 0;
      isPhoneNavOpening = false;
      isPhoneNavOpen = false;
      nav.classList.remove("is-phone-nav-preparing", "is-phone-nav-opening", "is-phone-nav-ready");
    }

    function setOpen(open, options) {
      if (isTravelling || isProjectMode || isBallAnimating) {
        return; // the console stays untouched while a ball animation or the plus restore is running
      }

      const staged = Boolean(options && options.staged);

      window.clearTimeout(closeOnBlurTimer);

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

    /* Phone menu: closed state first -> two animation frames -> spokes outward, circles staggered -> pointer-events on after the animation. */
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
            updateSpokeGeometry(); // re-measure once the circles have settled (covers a rotation during the opening)

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

    /* -------------------------------------------------------------- project popup interplay (unchanged contract) */

    function enterProjectMode() {
      resetBallState(STATES.PLUS_IDLE);
      clearChoiceState(STATES.PLUS_IDLE); // re-enables the circles if a project opens in the middle of a trip

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

    /* -------------------------------------------------------------- destination logic (kept from the previous working version) */

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

    /* "home": the ball comes down onto the floor line the girl walks on (the landing scene's ground, world y = stage.groundY),
     * about a quarter of the way across, with the page at the very top; it then rolls away to the left along that floor. Falls back to the band's ground proportion (700 / 780). */
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
        x: window.innerWidth * 0.26,
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
        return platformFromElement(document.querySelector(".about-portrait img") || document.querySelector(".about-portrait"), "about", "left", "platform", ballRadius());
      }

      if (section === "work") {
        return platformFromElement(document.querySelector(".work-tile"), "work", "left", "platform", ballRadius());
      }

      if (section === "archive") {
        return platformFromElement(document.querySelector(".archive-bar"), "archive", "right", "platform", ballRadius());
      }

      if (section === "contact") {
        return contactFloor();
      }

      return platformFromElement(document.getElementById(section) || document.body, section, "center");
    }

    function visiblePathTopMargin(bounds) {
      return Math.max(ballRadius() + 44, bounds && Number.isFinite(bounds.minY) ? bounds.minY : 0); // the ball's top edge stays at least ~44 px below the top of the screen
    }

    function tripBounceHeight(isPhone) {
      const ballSize = ballDiameter();

      return isPhone ? clamp(ballSize * 1.45, 38, 72) : clamp(ballSize * 2, 64, 118);
    }

    /* the scroll position that puts the landing point at a comfortable height of the final screen */
    function resolveScrollTarget(endPoint, targetId, bounds) {
      const radius = ballRadius();
      const maxScroll = maxScrollY();
      const safeTop = visiblePathTopMargin(bounds);
      const z = tripBounceHeight(false);
      const overshoot = clamp(z * 0.65, 36, 84);
      const minLandingY = safeTop + overshoot + 8;
      // high on the screen (title near the top, first tile whole, a good part of the second visible), but with room above for the three landing
      // bounces and the arc: the ball never leaves the page
      const preferredLandingY = Math.max(window.innerHeight * LANDING_SCREEN_FRACTION, minLandingY + 16);
      const desiredLandingY = clamp(preferredLandingY, bounds.minY, Math.min(bounds.maxY, Math.max(window.innerHeight * LANDING_SCREEN_FRACTION_MAX, minLandingY + 16)));

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

    /* final visible landing point F (viewport coordinates, after the page has reached scrollTarget) */
    function resolveFinalLandingPoint(endPoint, scrollTarget, targetId, bounds) {
      const raw = { x: endPoint.x, y: endPoint.y - scrollTarget - ballRadius() };

      if (targetId === "contact") {
        return { x: clamp(raw.x, bounds.minX, bounds.maxX), y: bounds.floorY };
      }

      return { x: clamp(raw.x, bounds.minX, bounds.maxX), y: clamp(raw.y, bounds.minY, bounds.maxY) };
    }

    /* -------------------------------------------------------------- plus reappears in place */

    function showPlusInPlace(token, targetId) {
      const restoreDuration = reducedMotion.matches ? 1 : 420; // matches the plusRestore animation in motion.css

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

    /* -------------------------------------------------------------- the trip: prep bounces -> main path (+ scroll) -> landing bounces -> roll */

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
      const rollDirection = rollDirectionFor(targetId);
      const rollCircumference = Math.max(1, Math.PI * radius * 2);
      const target = document.getElementById(targetId);
      const cleanUrl = window.location.pathname + window.location.search;
      const scrollStart = currentScrollY(); // captured once; frozen until the main path starts
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
      let endPoint = null; // measured only after the third prep bounce (the page has not moved, so nothing changes - but nothing is recomputed early either)
      let scrollTarget = scrollStart;
      let F = null;
      let path = null;
      let mainMs = 1;
      let phase = PHASE.PREP1;
      let phaseStart = 0;
      let speedMin = Infinity;
      let speedMax = 0;
      let previousSample = null;
      let rollStartX = 0;
      let rollEndX = 0;

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

      /* after prep bounce 3: compute the final scroll target, the final visible landing point F and the one continuous path */
      function buildMainPath() {
        endPoint = targetPlatformFor(targetId);
        scrollTarget = resolveScrollTarget(endPoint, targetId, bounds);
        F = resolveFinalLandingPoint(endPoint, scrollTarget, targetId, bounds);

        if (isPhone) {
          F = { x: A0.x, y: F.y }; // phone: the ball never moves sideways before the roll-away
        }

        const safeTop = visiblePathTopMargin(bounds);

        path = isPhone ? planPhoneBounce(A0, F, z, safeTop) : planBezierPath(A0, F, z, safeTop, MAIN_PATH_SPEED);
        mainMs = Math.max(1, path.duration * 1000);
        rollStartX = F.x;
        rollEndX = rollDirection < 0 ? -radius - 18 : window.innerWidth + radius + 18;
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
            return rollDuration;
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
          /* exact landing: ball at F, scroll exactly at scrollTarget, then everything is frozen */
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
          return;
        }

        if (name === PHASE.LAND2 || name === PHASE.LAND3) {
          debugInfo.landingBases.push(copyPoint(F));
          return;
        }

        if (name === PHASE.ROLL) {
          setState(STATES.BALL_ROLLING_OUT);
          ball.classList.remove("is-arrived", "is-landing", "is-landed");
          ball.classList.add("is-rolling");

          reportLandingSummary();
        }
      }

      /* the BUG warnings only fire when something is really wrong; the tables only print when a debug flag is on */
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

            // a slight vertical stretch only while the ball is really dropping into B (never sideways, never on the way up)
            const ahead = path.pointAt(Math.min(flightSeconds + 0.02, path.duration));
            const step = Math.hypot(ahead.x - point.x, ahead.y - point.y);
            const falling = step > 1e-6 ? Math.max(0, (ahead.y - point.y) / step) : 1;
            const stretch = smootherstep((progress - 0.6) / 0.3) * falling * falling;

            setBallScale(1 - 0.015 * stretch, 1 + 0.025 * stretch);
            setTimelineShadow(0, 0.72); // no shadow travels with the ball through the air

            if (previousSample && elapsed > previousSample.elapsed) {
              // phase-relative time (exact at the phase-end render), so the debug speed matches the real speed profile
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
              // the shadow hangs under the ball, so it only shows while the ball touches the platform (it would float in the air otherwise)
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
            const eased = easeRollOut(raw);
            const x = mix(rollStartX, rollEndX, eased);

            ball.style.setProperty("--ball-rotation", rollDirection * (Math.abs(x - rollStartX) / rollCircumference) * 360 + "deg");
            setBallPosition(x, F.y);
            setBallScale(1, 1);

            if (endPoint.kind === "floor") {
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

        /* leave finished phases; leftover time carries into the next one so the rhythm never drifts */
        let guard = 0;

        while (guard < 12) {
          guard += 1;

          const duration = phaseDuration(phase);
          const elapsed = now - phaseStart;

          if (elapsed < duration) {
            break;
          }

          const nextIndex = PHASE_ORDER.indexOf(phase) + 1;

          renderPhase(phase, duration, now); // final, exact pose of the phase that just ended

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
      runTrip(startPoint, targetId, token); // every trip, "home" included, ends with the roll-away and the plus fading in in place
    }

    /* -------------------------------------------------------------- choosing a destination: circle -> ball */

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

    /* -------------------------------------------------------------- events */

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
        return; // never start a second animation
      }

      if (canUseHoverNav() && isOpen) {
        return;
      }

      if (usesStagedMenuOpen() && !isOpen) {
        if (isPhoneNavOpening) {
          return; // repeated tap while opening: ignored
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
      if (!nav.contains(event.target) && isOpen && !isTravelling) {
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

    /* The window changed width mid-trip (rotation, window resize): the planned path no longer fits the screen, so instead of carrying on with
     * stale coordinates the trip ends cleanly - the page goes to where the trip was heading and the plus comes back in place. Height-only
     * changes (a phone's address bar showing / hiding) are ignored. */
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
