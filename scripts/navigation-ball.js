/* Navigation plus console + travelling ball.
 *
 * Every trip is one throw that obeys one physics ("throw, exit, arrive"):
 *   the chosen circle condenses into the ball in place -> a short press (anticipation squash) -> the ball is thrown on a true parabola
 *   (constant gravity, constant sideways speed, a visible spin) -> if the target is somewhere else on the page it leaves through the top
 *   edge, and only while it is out of sight does the page scroll to the target (a short eased camera move) -> it falls back in through the
 *   top edge on the same parabola -> lands on the top edge of the target picture -> bounces, each rebound lower (restitution) -> on the
 *   first contact its spin turns into forward speed, so it rolls off towards the screen edge the picture is attached to -> the plus comes
 *   back in place while it rolls away.
 * When the target is already on screen there is no exit: one parabola inside the frame. The "home" trip uses the same throw and drops the
 * ball into the plus, where it squashes and becomes the plus again.
 * Scrolling is held only until touchdown; from then on the ball lives on the page (document coordinates) and the visitor can scroll. Any
 * wheel, touch, key or click before touchdown fast-forwards the trip.
 *
 * The physics (solveThrow, createBallBody, restitution, ...) is made of pure functions at the top of this file and is shared, through
 * window.HariniPhysics, with anything else on the site that falls or bounces.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ configuration */

  const DEBUG_NAV_BALL_SEQUENCE = false;
  const DEBUG_PHONE_NAV_BALL = false;
  // true: every rendered frame of a trip is recorded into window.__ballTrace (position, scroll, velocity, scale, phase) for the test harness
  const DEBUG_NAV_BALL_TRACE = false;

  // One set of constants for the whole site (the playable pieces use the same ones through window.HariniPhysics).
  const GRAVITY_PER_HEIGHT = 3.0; // gravity in viewport heights per s²: a drop of one screen height takes ~0.85 s on every screen size
  const RESTITUTION_MAX = 0.58; // bounce: rebound speed / impact speed, slightly softer on hard impacts ...
  const RESTITUTION_SOFTEN = 0.08; // ... by this much per viewport height per second of impact speed
  const RESTITUTION_MIN = 0.35;
  const ROLLING_RESISTANCE = 0.03; // deceleration while rolling, as a fraction of gravity
  const SETTLE_HEIGHT = 1.5; // px: a rebound lower than this turns into rolling
  const SIM_STEP = 1 / 240; // s: the longest step the simulation takes (contacts are solved exactly inside a step)

  const BALL_MORPH_DURATION = 260; // ms: the circle condenses into the ball
  const BALL_PRESS_DURATION = 90; // ms: anticipation, the ball is pressed down before the throw
  const BALL_PRESS_SQUASH = 0.12; // the press squashes it to 0.88 high (area kept)

  const CAMERA_MIN = 0.45; // s: the page scroll while the ball is out of sight grows gently with the distance ...
  const CAMERA_MAX = 0.75; // ... between these two durations
  const CAMERA_LEAD = 0.02; // s after the ball has fully left the top edge before the page starts to move
  const CAMERA_TAIL = 0.08; // s between the end of the page move and the ball coming back in
  const IN_FRAME_APEX = 0.12; // a throw that stays on screen peaks no higher than this fraction of the screen height below the top edge

  const ROLL_EXIT_TIME = 1.25; // s from touchdown until the ball has rolled out of the screen (sets its rolling speed)
  const ROLL_SPEED_MIN = 0.22; // rolling speed limits, in viewport widths per second
  const ROLL_SPEED_MAX = 0.6;
  const HOME_SPIN = 9; // rad/s of visible spin on the throw home (it does not roll there)

  const SQUASH_MAX = 0.22; // squash at contact only, scaled by the impact speed
  const SQUASH_REFERENCE = 1.4; // impact speed (viewport heights per s) that gives the full squash: about the first impact of a trip
  const SQUASH_OMEGA = 60; // rad/s: the stiff spring that takes the squash back out, with a tiny overshoot
  const SQUASH_ZETA = 0.45;
  const STRETCH_MAX = 0.06; // stretch along the direction of travel, only with vertical speed (zero at the top of an arc)
  const STRETCH_REFERENCE = 2.6; // vertical speed (viewport heights per s) that gives the full stretch
  const SHADOW_RANGE = 0.35; // the shadow only shows when the platform under the ball is within this fraction of the screen height

  const HOME_MORPH_DURATION = 160;
  // Ball material (a decision for Harini): "sphere" = the shaded sphere, "ink" = a flat ink ball with a hairline highlight. ?ball=ink in the
  // address shows the other one for comparison.
  const BALL_MATERIAL = "sphere";
  const BALL_MATERIALS = ["sphere", "ink"]; // ms: on the home trip the ball squashes into the ring and becomes the plus
  const LANDING_EDGE_BUFFER = 6; // px: extra room between the ball and the rounded image corner it lands near
  // Where the ball comes to rest, as a fraction of the screen height measured from the top (the page is scrolled so that the platform it lands on
  // is there): the section title sits near the top, the first tile is whole with a good part of the second below it.
  const LANDING_SCREEN_FRACTION = 0.2;
  const LANDING_SCREEN_FRACTION_MAX = 0.34;

  // staged (phone) menu opening: total under 650 ms
  const PHONE_MENU_SPOKE_DURATION = 420;
  const PHONE_MENU_SPOKE_STAGGER = 45;
  const PHONE_MENU_READY_DELAY = 610; // circles are fully in by ~615 ms after the opening starts

  const SECTION_IDS = ["landing", "about", "work", "archive", "contact"];

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
    PRESS: "press",
    THROW: "throw", // rising, on screen
    CAMERA: "camera", // out of sight above the top edge (the page scrolls)
    ARRIVE: "arrive", // falling back in
    BOUNCE: "bounce",
    ROLL: "roll",
    PLUS: "plus"
  };

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

  function round(value) {
    return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  }

  function parsePixel(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function centerOf(element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height
    };
  }

  /* ------------------------------------------------------------------ physics (pure functions, shared through window.HariniPhysics) */

  /* Screen coordinates throughout: x to the right, y DOWN, px and seconds. Gravity scales with the screen height, so a throw looks the same
   * on a phone and on a large monitor. */

  function gravityFor(viewportHeight) {
    return GRAVITY_PER_HEIGHT * viewportHeight;
  }

  /* rebound speed / impact speed: slightly softer on hard impacts, never above RESTITUTION_MAX (a bounce never adds energy) */
  function restitution(impactSpeed, viewportHeight) {
    return clamp(RESTITUTION_MAX - (RESTITUTION_SOFTEN * Math.abs(impactSpeed)) / viewportHeight, RESTITUTION_MIN, RESTITUTION_MAX);
  }

  /* how long the page scroll takes while the ball is out of sight: short and decisive, a little longer for long distances */
  function cameraDuration(scrollDistance) {
    return clamp(0.38 + 0.00009 * Math.abs(scrollDistance), CAMERA_MIN, CAMERA_MAX);
  }

  /*
   * Solves one throw from A to B (B is where the ball touches down, in the screen as it will be AFTER the page has scrolled).
   *   options.exit: the ball leaves through the top edge and stays out of sight for long enough for the page move (cameraTime s)
   *   options.rollDirection, options.rollDistance: where it rolls after landing (px to beyond the screen edge); sets the launch spin so that
   *   the first contact turns it into exactly that rolling speed.
   * Returns the launch velocity and spin and the timeline (seconds after the launch).
   * Exit throw: the ball is fully out of sight while its centre is above y = -r. With the speed v_exit it has there,
   *   t_off = 2 v_exit / G, v0y = -sqrt(v_exit² + 2G(A.y + r)), t_up = (|v0y| - v_exit) / G, t_down = (-v_exit + sqrt(v_exit² + 2G(B.y + r))) / G.
   * Solid sphere rolling without slipping after the first contact: vx' = (5 vx + 2 r ω) / 7, so the launch spin is ω = (7 v_roll - 5 vx) / (2 r).
   */
  function solveThrow(options) {
    const A = options.A;
    const B = options.B;
    const r = options.radius;
    const W = options.viewportWidth;
    const H = options.viewportHeight;
    const G = gravityFor(H);
    let v0y;
    let tUp;
    let tOff = 0;
    let tDown;
    let apexY;
    let vExit = 0;

    if (options.exit) {
      vExit = (G * (options.cameraTime + CAMERA_LEAD + CAMERA_TAIL)) / 2;
      v0y = -Math.sqrt(vExit * vExit + 2 * G * (A.y + r));
      tUp = (-v0y - vExit) / G;
      tOff = (2 * vExit) / G;
      tDown = (-vExit + Math.sqrt(vExit * vExit + 2 * G * (B.y + r))) / G;
      apexY = -r - (vExit * vExit) / (2 * G);
    } else {
      const lower = Math.min(A.y, B.y);

      apexY = clamp(lower - 0.28 * H, IN_FRAME_APEX * H, lower - 12);
      v0y = -Math.sqrt(2 * G * Math.max(A.y - apexY, 0));
      tUp = -v0y / G;
      tDown = Math.sqrt((2 * Math.max(B.y - apexY, 0)) / G);
    }

    const duration = tUp + tOff + tDown;
    const vx = (B.x - A.x) / duration;
    let vRoll = 0;
    let omega = options.spin || 0;

    if (options.rollDirection) {
      const resistance = ROLLING_RESISTANCE * G;
      const exitTime = options.rollTime || ROLL_EXIT_TIME;
      const needed = (Math.max(options.rollDistance, 0) + 0.5 * resistance * exitTime * exitTime) / exitTime;

      vRoll = options.rollDirection * clamp(needed, ROLL_SPEED_MIN * W, ROLL_SPEED_MAX * W);
      omega = (7 * vRoll - 5 * vx) / (2 * r);
    }

    return {
      gravity: G,
      v0x: vx,
      v0y: v0y,
      omega: omega,
      vRoll: vRoll,
      duration: duration,
      exit: Boolean(options.exit),
      tExit: options.exit ? tUp : null, // fully out of sight from here ...
      tReenter: options.exit ? tUp + tOff : null, // ... until here
      cameraStart: options.exit ? tUp + CAMERA_LEAD : 0,
      cameraTime: options.exit ? options.cameraTime : 0,
      apexY: apexY,
      impactSpeed: Math.abs(v0y + G * duration)
    };
  }

  /*
   * A ball that flies, bounces and rolls. Between contacts it moves on an exact parabola (position and speed are updated with the exact
   * constant-acceleration formulas, so the path does not depend on the frame rate); a contact with a platform is found exactly inside the
   * step and the rest of the step continues from there. Platforms are one-way (the ball only lands on them while falling) and are given
   * as { left, right, y } with y = the height of the ball's CENTRE when it rests on the platform. Steps are at most SIM_STEP long.
   *   body.advance(dt, platforms) -> list of events ({ type: "contact", impact, rebound, first, settled } | { type: "stop" } | { type: "fall" })
   */
  function createBallBody(state) {
    const body = {
      x: state.x,
      y: state.y,
      vx: state.vx || 0,
      vy: state.vy || 0,
      angle: state.angle || 0, // rad, clockwise on screen
      omega: state.omega || 0, // rad/s
      radius: state.radius,
      gravity: state.gravity,
      viewportHeight: state.viewportHeight,
      mode: state.mode || "air", // "air" | "roll" | "rest"
      contacts: 0,
      platform: null
    };

    function contactTime(dt, platform) {
      // y + vy t + G t² / 2 = platform.y with the ball moving down, inside [0, dt]
      const a = body.gravity / 2;
      const b = body.vy;
      const c = body.y - platform.y;

      if (c > 1e-6) {
        return -1; // already below the platform level (it passed it while rising): one-way platforms never catch from below
      }

      const disc = b * b - 4 * a * c;

      if (disc < 0) {
        return -1;
      }

      const t = (-b + Math.sqrt(disc)) / (2 * a);

      if (t < -1e-9 || t > dt) {
        return -1;
      }

      const x = body.x + body.vx * t;

      return x >= platform.left && x <= platform.right ? Math.max(t, 0) : -1;
    }

    function flyFor(t) {
      body.x += body.vx * t;
      body.y += body.vy * t + 0.5 * body.gravity * t * t;
      body.vy += body.gravity * t;
      body.angle += body.omega * t;
    }

    function rollFor(t, events) {
      const decel = ROLLING_RESISTANCE * body.gravity * Math.sign(body.vx);
      let time = t;

      if (decel !== 0 && Math.abs(body.vx) <= Math.abs(decel) * time) {
        time = Math.abs(body.vx / decel); // comes to rest inside this step
      }

      const dx = body.vx * time - 0.5 * decel * time * time;

      body.x += dx;
      body.vx -= decel * time;
      body.angle += dx / body.radius;
      body.omega = body.vx / body.radius;

      if (time < t || Math.abs(body.vx) < 1e-3) {
        body.vx = 0;
        body.omega = 0;
        body.mode = "rest";
        events.push({ type: "stop" });
      }

      if (body.platform && (body.x < body.platform.left || body.x > body.platform.right)) {
        body.mode = "air"; // rolled off the end of its platform: it falls from here
        body.vy = 0;
        body.platform = null;
        events.push({ type: "fall" });
      }
    }

    function contact(platform, events) {
      const impact = body.vy;
      const e = restitution(impact, body.viewportHeight);
      const first = body.contacts === 0;
      let rebound = -e * impact;

      body.contacts += 1;
      body.y = platform.y;
      body.platform = platform;

      if (first) {
        body.vx = (5 * body.vx + 2 * body.radius * body.omega) / 7; // the spin grips: it becomes forward speed
      }

      body.omega = body.vx / body.radius; // rolling without slipping from the first contact on

      const settled = (rebound * rebound) / (2 * body.gravity) < SETTLE_HEIGHT;

      if (settled) {
        rebound = 0;
        body.mode = "roll";
      }

      body.vy = rebound;
      events.push({ type: "contact", impact: impact, rebound: rebound, restitution: e, first: first, settled: settled, x: body.x, y: body.y });
    }

    body.advance = function (dt, platforms) {
      const events = [];
      let left = Math.max(0, dt);
      let guard = 0;

      while (left > 1e-9 && guard < 4000) {
        guard += 1;

        const step = Math.min(left, SIM_STEP);

        if (body.mode === "air") {
          let hit = null;
          let hitTime = step;

          if (body.vy >= 0 || body.vy + body.gravity * step > 0) {
            (platforms || []).forEach(function (platform) {
              const t = contactTime(hitTime, platform);

              if (t >= 0 && t <= hitTime) {
                hit = platform;
                hitTime = t;
              }
            });
          }

          if (hit) {
            flyFor(hitTime);
            contact(hit, events);
            left -= Math.max(hitTime, 1e-7);
          } else {
            flyFor(step);
            left -= step;
          }
        } else if (body.mode === "roll") {
          rollFor(step, events);
          left -= step;
        } else {
          left = 0;
        }
      }

      return events;
    };

    body.speed = function () {
      return Math.hypot(body.vx, body.vy);
    };

    return body;
  }

  /*
   * The shape of the ball for one frame: squash along the contact normal (held for one frame at impact, then taken out by a stiff spring
   * with a tiny overshoot) and a stretch along the direction of travel that grows with the vertical speed (zero at the top of an arc).
   * Returns a 2D matrix [a, b, c, d] and the downward shift that keeps the bottom of a squashed ball on its platform.
   */
  function createBallShape(viewportHeight) {
    const shape = { squash: 0, squashSpeed: 0, hold: 0 };

    shape.impact = function (impactSpeed) {
      shape.squash = clamp((SQUASH_MAX * Math.abs(impactSpeed)) / (SQUASH_REFERENCE * viewportHeight), 0, SQUASH_MAX);
      shape.squashSpeed = 0;
      shape.hold = 1; // shown for one whole frame before the spring starts
    };

    shape.press = function (amount) {
      shape.squash = amount;
      shape.squashSpeed = 0;
      shape.hold = 0;
    };

    shape.step = function (dt) {
      if (shape.hold > 0) {
        shape.hold -= 1;
        return;
      }

      let left = Math.min(dt, 0.1);

      while (left > 1e-6) {
        const h = Math.min(left, 1 / 480);
        const accel = -SQUASH_OMEGA * SQUASH_OMEGA * shape.squash - 2 * SQUASH_ZETA * SQUASH_OMEGA * shape.squashSpeed;

        shape.squashSpeed += accel * h;
        shape.squash += shape.squashSpeed * h;
        left -= h;
      }

      if (Math.abs(shape.squash) < 1e-4 && Math.abs(shape.squashSpeed) < 1e-3) {
        shape.squash = 0;
        shape.squashSpeed = 0;
      }
    };

    shape.matrix = function (vx, vy, airborne) {
      const sy = 1 - clamp(shape.squash, -0.2, 0.4);
      const sx = 1 / sy;
      const stretch = airborne ? clamp((STRETCH_MAX * Math.abs(vy)) / (STRETCH_REFERENCE * viewportHeight), 0, STRETCH_MAX) : 0;
      let a = sx;
      let b = 0;
      let c = 0;
      let d = sy;

      if (stretch > 0.0005) {
        // R(θ) · diag(1 + s, 1 / (1 + s)) · R(-θ), then times the squash
        const theta = Math.atan2(vy, vx);
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const p = 1 + stretch;
        const q = 1 / p;
        const m11 = p * cos * cos + q * sin * sin;
        const m12 = (p - q) * cos * sin;
        const m22 = p * sin * sin + q * cos * cos;

        a = m11 * sx;
        b = m12 * sx;
        c = m12 * sy;
        d = m22 * sy;
      }

      return { a: a, b: b, c: c, d: d, sx: sx, sy: sy, stretch: stretch, drop: 0 };
    };

    return shape;
  }

  window.HariniPhysics = {
    gravityFor: gravityFor,
    restitution: restitution,
    cameraDuration: cameraDuration,
    solveThrow: solveThrow,
    createBallBody: createBallBody,
    createBallShape: createBallShape,
    constants: {
      GRAVITY_PER_HEIGHT: GRAVITY_PER_HEIGHT,
      RESTITUTION_MAX: RESTITUTION_MAX,
      RESTITUTION_SOFTEN: RESTITUTION_SOFTEN,
      RESTITUTION_MIN: RESTITUTION_MIN,
      ROLLING_RESISTANCE: ROLLING_RESISTANCE,
      SETTLE_HEIGHT: SETTLE_HEIGHT,
      SIM_STEP: SIM_STEP
    }
  };

  /* ------------------------------------------------------------------ init */

  function init() {
    const nav = document.querySelector("[data-nav-object]");
    const core = document.querySelector("[data-nav-core]");
    const spokes = document.querySelector(".radial-lines");
    const menu = document.getElementById("radial-menu");
    const ball = document.querySelector("[data-travel-ball]");
    const ballLabel = document.querySelector("[data-travel-label]");
    const travelShadow = ball ? ball.querySelector(".travel-shadow") : null;
    const lines = {
      about: document.querySelector(".radial-line-about"),
      work: document.querySelector(".radial-line-work"),
      archive: document.querySelector(".radial-line-archive"),
      contact: document.querySelector(".radial-line-contact")
    };
    const spokeMasks = {};

    /* A section that is hidden (the archive, until it has real items) gets no circle and no spoke; the other circles close up
       (styles/motion.css spaces them by data-nav-count). Showing the section again brings its circle back. */
    const items = Array.prototype.slice.call(document.querySelectorAll("[data-nav-target]")).filter(function (item) {
      const id = item.getAttribute("data-nav-target");
      const section = document.getElementById(id);

      if (section && !section.hidden) {
        return true;
      }

      item.parentElement.remove();

      if (lines[id]) {
        lines[id].remove();
        delete lines[id];
      }

      return false;
    });

    if (!nav || !core || !spokes || !menu || !ball || !ballLabel || items.length === 0) {
      return;
    }

    nav.dataset.navCount = String(items.length);

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
    let freeBallActive = false; // the last ball is still rolling away after the plus has come back
    let tripInterrupt = null; // set while a trip holds the input: any wheel, touch, key or click fast-forwards it
    let tripResize = null; // set while a trip runs: a resize ends it in place
    const BALL_IDENTITY = "1, 0, 0, 1, 0, 0";
    const requestedMaterial = new URLSearchParams(window.location.search).get("ball");

    ball.dataset.ballMaterial = BALL_MATERIALS.indexOf(requestedMaterial) !== -1 ? requestedMaterial : BALL_MATERIAL;

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

      if (tripInterrupt) {
        tripInterrupt();
      }
    }

    function interruptOnPointer() {
      if (tripInterrupt) {
        tripInterrupt();
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

      if (tripInterrupt && !/^(Shift|Control|Alt|Meta|CapsLock)$/.test(event.key)) {
        tripInterrupt();
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
      window.addEventListener("pointerdown", interruptOnPointer, true);
    }

    function unlockUserScroll() {
      if (!scrollLockActive) {
        return;
      }

      scrollLockActive = false;
      window.removeEventListener("wheel", preventScrollInput, { passive: false });
      window.removeEventListener("touchmove", preventScrollInput, { passive: false });
      window.removeEventListener("keydown", preventScrollKeys, { passive: false });
      window.removeEventListener("pointerdown", interruptOnPointer, true);
    }

    /* -------------------------------------------------------------- landing animation hook: the girl reacts the moment the plus opens */

    function notifyLandingPlusOpened() {
      const landingAnimation = window.landingGirlAnimation || null;

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

    /* squash and stretch as one 2D matrix (see createBallShape); the scale variables stay free for the shrink into the plus */
    function setBallShape(m) {
      ball.style.setProperty("--ball-m", m.a.toFixed(4) + ", " + m.b.toFixed(4) + ", " + m.c.toFixed(4) + ", " + m.d.toFixed(4) + ", 0, 0");
    }

    /* the shadow is driven inline frame by frame during a trip (its height above the platform); this puts it out of sight again */
    function resetTimelineShadow() {
      if (!travelShadow) {
        return;
      }

      travelShadow.style.animation = "none";
      travelShadow.style.transition = "none";
      travelShadow.style.opacity = "0";
      travelShadow.style.filter = "";
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
      ball.style.setProperty("--ball-m", BALL_IDENTITY);
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
      ball.style.setProperty("--ball-m", BALL_IDENTITY);
      ball.style.removeProperty("--restore-duration");
      resetTimelineShadow();

      window.requestAnimationFrame(function () {
        ball.style.transition = "";
      });
    }

    function resetBallState(finalState) {
      cancelBallAnimation();
      freeBallActive = false;
      tripInterrupt = null;
      tripResize = null;
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

        if (!section || section.hidden) {
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

        maskParts.drawLine.style.transition = "stroke-dashoffset " + duration + "ms cubic-bezier(0.22, 1, 0.36, 1)";
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

      if (open) {
        retireFreeBall();
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
      /* for keyboard and screen readers the close button inside the dialog takes over (project-viewer.js); this plus stays the mouse target */
      core.tabIndex = -1;
      core.setAttribute("aria-hidden", "true");
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
      core.removeAttribute("tabindex");
      core.removeAttribute("aria-hidden");
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

    function targetPlatformFor(section) {
      if (section === "landing") {
        return platformFromElement(document.querySelector(".landing-media") || document.getElementById("landing"), "landing", "center");
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

    /* the scroll position that puts the landing point at a comfortable height of the final screen: high (the title near the top, the first
       tile whole, a good part of the second visible), with room above for the first rebound (at most ~0.1 of the screen height) */
    function resolveScrollTarget(endPoint, targetId, bounds) {
      const radius = ballRadius();
      const maxScroll = maxScrollY();
      const minLandingY = radius + 44 + window.innerHeight * 0.1;
      const desiredLandingY = clamp(Math.max(window.innerHeight * LANDING_SCREEN_FRACTION, minLandingY), bounds.minY,
        Math.min(bounds.maxY, Math.max(window.innerHeight * LANDING_SCREEN_FRACTION_MAX, minLandingY)));

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

    /* -------------------------------------------------------------- the plus comes back */

    /* keepBall: the ball is still rolling away; it carries on by itself (document-anchored) and can be retired at any moment */
    function restorePlus(token, keepBall) {
      const restoreDuration = reducedMotion.matches ? 1 : 420; // matches the plusRestore animation in motion.css

      if (!isCurrentAnimation(token)) {
        return;
      }

      if (DEBUG_NAV_BALL_SEQUENCE) {
        console.table({ stage: "plus-restored", keepBall: keepBall });
      }

      if (keepBall) {
        freeBallActive = true;
      } else {
        setBallPhase(PHASE.PLUS);
        hideTravelBallForPlusRestore();
      }

      nav.classList.add("is-plus-restoring");
      document.documentElement.classList.remove("is-ball-animating");
      unlockUserScroll();
      clearChoiceState(STATES.PLUS_RESTORED);

      resetTimer = window.setTimeout(function () {
        resetTimer = 0;
        nav.classList.remove("is-plus-restoring");
        isBallAnimating = false;

        if (!freeBallActive) {
          hideTravelBallImmediately();
        }

        setState(STATES.PLUS_IDLE);
        updateCurrentSection(detectCurrentSection(), true);
      }, restoreDuration);
    }

    /* the menu is opened (or a project) while the last ball is still rolling away: it simply goes */
    function retireFreeBall() {
      if (!freeBallActive) {
        return;
      }

      freeBallActive = false;
      activeAnimationToken += 1;
      ballFrames.forEach(function (frameId) {
        window.cancelAnimationFrame(frameId);
      });
      ballFrames = [];
      hideTravelBallImmediately();
    }

    function morphBallIntoPlus(token, duration) {
      const restoreDuration = reducedMotion.matches ? 1 : duration;

      if (!isCurrentAnimation(token)) {
        return;
      }

      setState(STATES.PLUS_RESTORED);
      ball.style.setProperty("--restore-duration", restoreDuration + "ms");
      ball.style.removeProperty("--ball-scale-x"); // let the is-restoring class shrink the ball into the plus
      ball.style.removeProperty("--ball-scale-y");
      ball.classList.add("is-restoring");
      nav.classList.add("is-ball-closing");
      clearChoiceState(STATES.PLUS_RESTORED);
      document.documentElement.classList.remove("is-ball-animating");
      unlockUserScroll();

      resetTimer = setBallTimeout(function () {
        resetBallState(STATES.PLUS_IDLE);
        setState(STATES.PLUS_IDLE);
        updateCurrentSection(detectCurrentSection(), true);
      }, restoreDuration, token);
    }

    /* Every picture the page will pass on its way to the target (and the target's own) is requested and decoded the moment the destination
       is chosen: the morph, the press and the rise give it most of a second, so the page move itself never waits for a picture. */
    function predecodeTarget(targetId) {
      const section = document.getElementById(targetId);
      const scrollY = currentScrollY();
      const viewHeight = window.innerHeight;
      const targetTop = section ? section.getBoundingClientRect().top + scrollY : scrollY;
      const from = Math.min(scrollY, targetTop) - viewHeight;
      const to = Math.max(scrollY, targetTop) + 2 * viewHeight;

      Array.prototype.slice.call(document.querySelectorAll("main img")).forEach(function (img) {
        const rect = img.getBoundingClientRect();
        const top = rect.top + scrollY;

        if (rect.height === 0 || top > to || top + rect.height < from) {
          return;
        }

        if (img.loading === "lazy") {
          img.loading = "eager";
        }

        if (img.decode) {
          img.decode().catch(function () {});
        }
      });
    }

    /* scroll-linked work elsewhere (picture vignettes, edge fades) is paused while the page jumps under an invisible ball, and run once after */
    function setCameraMoving(moving) {
      document.documentElement.classList.toggle("is-camera-moving", moving);
      document.dispatchEvent(new CustomEvent("harini:camera-move", { detail: { moving: moving } }));
    }

    /* -------------------------------------------------------------- the trip: press -> throw -> (out of sight: page move) -> arrive -> bounce -> roll */

    function runTrip(A, targetId, token) {
      const home = targetId === "landing";
      const W = window.innerWidth;
      const H = window.innerHeight;
      const r = ballRadius();
      const target = document.getElementById(targetId);
      const cleanUrl = window.location.pathname + window.location.search;
      const scrollStart = currentScrollY();
      const bounds = getSafeBounds({ allowFloor: targetId === "contact" });
      let endPoint = null;
      let scrollTarget = 0;
      let B;
      let platform;

      if (!isCurrentAnimation(token)) {
        return;
      }

      if (home) {
        const plus = readPlusGeometry();

        B = { x: plus.measuredPlusCentreX, y: plus.measuredPlusCentreY };
        platform = { left: -1e9, right: 1e9, y: B.y };
      } else {
        endPoint = targetPlatformFor(targetId);
        scrollTarget = resolveScrollTarget(endPoint, targetId, bounds);
        B = resolveFinalLandingPoint(endPoint, scrollTarget, targetId, bounds);
        platform = endPoint.kind === "floor" ? { left: -1e9, right: 1e9, y: B.y } : { left: endPoint.left, right: endPoint.right, y: B.y };
      }

      document.documentElement.classList.add("is-ball-animating");

      if (reducedMotion.matches) {
        scrollInstantly(scrollTarget);
        setBallPosition(B.x, B.y);
        updateCurrentSection(targetId, true);

        if (target) {
          target.focus({ preventScroll: true });
        }

        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", home ? cleanUrl : "#" + targetId);
        }

        if (home) {
          morphBallIntoPlus(token, 1);
        } else {
          restorePlus(token, false);
        }

        return;
      }

      const exit = Math.abs(scrollTarget - scrollStart) > 2;
      const rollDirection = home ? 0 : rollDirectionFor(targetId);
      const plan = solveThrow({
        A: A,
        B: B,
        radius: r,
        viewportWidth: W,
        viewportHeight: H,
        exit: exit,
        cameraTime: cameraDuration(scrollTarget - scrollStart),
        rollDirection: rollDirection,
        rollDistance: rollDirection < 0 ? B.x + r + 2 : W - B.x + r + 2,
        spin: home ? HOME_SPIN * (B.x >= A.x ? 1 : -1) : 0
      });
      const body = createBallBody({ x: A.x, y: A.y, vx: plan.v0x, vy: plan.v0y, omega: plan.omega, radius: r, gravity: plan.gravity, viewportHeight: H });
      const shape = createBallShape(H);
      const pressSeconds = BALL_PRESS_DURATION / 1000;
      const trace = DEBUG_NAV_BALL_TRACE || window.__ballTraceOn ? (window.__ballTrace = []) : null;
      let platforms = [platform];
      let simTime = -pressSeconds; // negative while the ball is being pressed
      let lastNow = 0;
      let landed = false;
      let cameraStarted = false;
      let cameraDone = !exit;
      let timeScale = 1;
      let skipToTouchdown = false;
      let plusBack = false;
      let restSince = -1;
      let frameNow = 0;
      let phase = PHASE.PRESS;

      if (DEBUG_NAV_BALL_SEQUENCE || DEBUG_PHONE_NAV_BALL) {
        console.table({ targetId: targetId, A: JSON.stringify(A), B: JSON.stringify(B), scrollStart: round(scrollStart), scrollTarget: round(scrollTarget), exit: exit,
          flight: round(plan.duration), camera: round(plan.cameraTime), gravity: round(plan.gravity), vx: round(plan.v0x), vRoll: round(plan.vRoll), impact: round(plan.impactSpeed) });
      }

      setBallPhase(PHASE.PRESS);
      setState(STATES.BALL_TAKEOFF);
      ball.classList.remove("is-forming", "is-landed", "is-landing", "is-contact-landing");
      ball.classList.add("is-visible", "is-ready");

      function setPhase(next) {
        if (next === phase) {
          return;
        }

        phase = next;
        setBallPhase(next);

        if (next === PHASE.THROW) {
          setState(STATES.BALL_FLYING);
          ball.classList.remove("is-ready");
          ball.classList.add("is-moving", "is-flying");
        } else if (next === PHASE.BOUNCE && !plusBack) {
          setState(STATES.BALL_LANDING);
          ball.classList.remove("is-flying");
          ball.classList.add("is-landed");
        } else if (next === PHASE.ROLL) {
          if (!plusBack) {
            setState(STATES.BALL_ROLLING_OUT);
          }

          ball.classList.add("is-rolling");
        }
      }

      function moveCamera(to) {
        if (!cameraStarted) {
          cameraStarted = true;
          setCameraMoving(true);
        }

        scrollInstantly(to);
      }

      function finishCamera() {
        if (cameraDone) {
          return;
        }

        if (Math.abs(currentScrollY() - scrollTarget) > 0.5) {
          scrollInstantly(scrollTarget);
        }

        cameraDone = true;

        if (cameraStarted) {
          setCameraMoving(false);
        } else {
          document.dispatchEvent(new CustomEvent("harini:camera-move", { detail: { moving: false } }));
        }
      }

      /* the section takes focus, the address and the menu labels follow: done in an idle moment just after touchdown, so the frame of
         the impact stays light */
      function arriveAtTarget(now) {
        const settle = function () {
          if (target && !home && !document.body.classList.contains("is-project-open")) {
            target.focus({ preventScroll: true });
          }

          updateCurrentSection(targetId, true);

          if (window.history && window.history.replaceState) {
            window.history.replaceState(null, "", home ? cleanUrl : "#" + targetId);
          }
        };

        if (now || !window.requestIdleCallback) {
          settle();
        } else {
          window.requestIdleCallback(settle, { timeout: 500 });
        }
      }

      /* any wheel, touch, key or click before touchdown: the page jumps to the target and the ball hurries there */
      function fastForward() {
        if (landed || !isCurrentAnimation(token)) {
          return;
        }

        tripInterrupt = null;
        unlockUserScroll();
        finishCamera();

        if (simTime < 0) {
          simTime = 0;
        }

        if (exit && body.y < -r) {
          skipToTouchdown = true;
        } else {
          timeScale = 2;
        }
      }

      /* the trip cannot be finished properly (the window was resized, the tab came back after a long time): end it in place */
      function finishQuietly() {
        tripInterrupt = null;
        tripResize = null;

        if (!landed) {
          finishCamera();
          arriveAtTarget(true);
        }

        if (home && !landed) {
          setBallPosition(B.x, B.y);
          morphBallIntoPlus(token, 1);
          return;
        }

        freeBallActive = false;

        if (!plusBack) {
          restorePlus(token, false);
        } else {
          hideTravelBallImmediately();
        }
      }

      function touchdown(event) {
        landed = true;
        tripInterrupt = null;
        finishCamera();
        arriveAtTarget();

        if (home) {
          setBallPosition(B.x, B.y);
          shape.impact(event.impact);
          render(B.x, B.y, false, true);
          morphBallIntoPlus(token, HOME_MORPH_DURATION);
          return false;
        }

        // from now on the ball lives on the page: its height is kept in document coordinates, so the visitor can scroll while it bounces
        body.y += scrollTarget;
        platforms = [{ left: platform.left, right: platform.right, y: platform.y + scrollTarget }];
        body.platform = platforms[0];
        document.documentElement.classList.remove("is-ball-animating");
        unlockUserScroll();
        return true;
      }

      function shadowFor(screenX, screenY, platformScreenY) {
        if (!travelShadow) {
          return;
        }

        const h = platformScreenY - screenY;
        const over = screenX >= platform.left - r && screenX <= platform.right + r;

        if (!cameraDone || !over || h < -1 || h > SHADOW_RANGE * H || (endPoint && endPoint.kind === "floor") || home) {
          travelShadow.style.opacity = "0";
          return;
        }

        const height = Math.max(h, 0);

        travelShadow.style.opacity = String(0.34 * (1 - height / (height + 0.12 * H)));
        travelShadow.style.filter = "blur(" + (4 + height * 0.05).toFixed(1) + "px)";
        travelShadow.style.transform = "translate(-50%, " + height.toFixed(1) + "px) scaleX(" + (1.2 * (1 - height / (height + 0.18 * H))).toFixed(3) + ")";
      }

      function render(screenX, screenY, airborne, touch) {
        const m = shape.matrix(body.vx, body.vy, airborne);
        const drop = r * (1 - m.sy); // a squashed ball keeps its bottom on the platform

        setBallPosition(screenX, screenY + drop);
        setBallShape(m);
        ball.style.setProperty("--ball-rotation", ((body.angle * 180) / Math.PI).toFixed(2) + "deg");
        shadowFor(screenX, screenY, landed ? platforms[0].y - currentScrollY() : platform.y);

        if (trace) {
          trace.push({ t: frameNow || performance.now(), sim: simTime, x: screenX, y: screenY, docY: landed ? body.y : null, sc: currentScrollY(), vx: body.vx, vy: body.vy,
            angle: body.angle, sx: m.sx, sy: m.sy, stretch: m.stretch, phase: phase, mode: body.mode, landed: landed, locked: scrollLockActive,
            py: landed ? platforms[0].y - currentScrollY() : platform.y, touch: Boolean(touch) });
        }
      }

      function frame(now) {
        if (!isCurrentAnimation(token)) {
          return;
        }

        const dt = lastNow ? (now - lastNow) / 1000 : 0;

        lastNow = now;
        frameNow = now;

        if (dt > 0.25) {
          finishQuietly(); // the tab was hidden or the page stalled: no catching up on a whole trip
          return;
        }

        shape.step(dt);

        let flight;

        /* the press: squash in over the first 60% and hold; at the launch the spring lets it go (with a tiny stretch on the way out) */
        if (simTime < 0) {
          simTime += dt;

          if (simTime < 0) {
            shape.press(BALL_PRESS_SQUASH * smootherstep((simTime + pressSeconds) / (pressSeconds * 0.6)));
            render(A.x, A.y, false);
            requestBallFrame(frame, token);
            return;
          }

          setPhase(PHASE.THROW);
          flight = simTime; // only the part of this frame after the launch
        } else {
          flight = landed ? dt : dt * timeScale;
          simTime += flight;
        }

        if (!landed && timeScale > 1 && exit && body.y < -r) {
          skipToTouchdown = true;
        }

        if (!landed && skipToTouchdown && simTime < plan.duration + 0.004) {
          flight += plan.duration + 0.004 - simTime;
          simTime = plan.duration + 0.004;
        }

        const events = body.advance(flight, platforms);
        let keepGoing = true;

        events.forEach(function (event) {
          if (event.type !== "contact" || !keepGoing) {
            return;
          }

          if (!landed) {
            keepGoing = touchdown(event);
          }

          if (keepGoing) {
            shape.impact(event.impact);

            if (event.settled && !plusBack) {
              plusBack = true;
              restorePlus(token, true);
            }
          }
        });

        if (!keepGoing) {
          return;
        }

        /* the camera: only while the ball is out of sight above the top edge */
        if (!cameraDone && simTime >= plan.cameraStart) {
          const u = clamp((simTime - plan.cameraStart) / plan.cameraTime, 0, 1);

          moveCamera(mix(scrollStart, scrollTarget, smootherstep(u)));

          if (u >= 1) {
            finishCamera();
          }
        }

        const screenX = body.x;
        const screenY = landed ? body.y - currentScrollY() : body.y;

        if (!landed) {
          setPhase(exit && body.y < -r ? PHASE.CAMERA : body.vy < 0 ? PHASE.THROW : PHASE.ARRIVE);
        } else {
          setPhase(body.mode === "air" ? PHASE.BOUNCE : PHASE.ROLL);
        }

        render(screenX, screenY, body.mode === "air");

        /* gone: rolled out of the screen, scrolled out of view, or fell off the end of its platform below the screen */
        const gone = landed && (screenX < -r - 2 || screenX > W + r + 2 || screenY > H + r + 2 || screenY < -r - 2);

        if (body.mode === "rest") {
          restSince = restSince < 0 ? now : restSince;
        }

        if (gone || (restSince >= 0 && now - restSince > 400)) {
          tripResize = null;

          if (!plusBack) {
            plusBack = true;
            restorePlus(token, false);
          } else if (isCurrentAnimation(token)) {
            freeBallActive = false;
            hideTravelBallImmediately();
          }

          return;
        }

        requestBallFrame(frame, token);
      }

      tripInterrupt = fastForward;
      tripResize = finishQuietly;
      render(A.x, A.y, false);
      requestBallFrame(frame, token);
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

      retireFreeBall();

      const buttonRect = button.getBoundingClientRect();
      const A0 = { x: buttonRect.left + buttonRect.width / 2, y: buttonRect.top + buttonRect.height / 2 };
      const morphDuration = reducedMotion.matches ? 1 : BALL_MORPH_DURATION;
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
      predecodeTarget(targetId);

      setBallPosition(A0.x, A0.y);
      ball.style.opacity = "";
      ball.style.setProperty("--ball-lift", "0px");
      ball.style.setProperty("--ball-scale-x", "1");
      ball.style.setProperty("--ball-scale-y", "1");
      ball.style.setProperty("--ball-rotation", "0deg");
      ball.style.setProperty("--ball-m", BALL_IDENTITY);
      ball.style.setProperty("--nav-ball-form-duration", morphDuration + "ms");
      nav.style.setProperty("--nav-ball-form-duration", morphDuration + "ms");
      ballLabel.textContent = "";
      resetBallClasses();
      resetTimelineShadow();
      setBallPhase(PHASE.MORPH);
      ball.classList.add("is-visible", "is-forming");

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
        runTrip(A0, targetId, token);
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

    window.addEventListener("resize", function () {
      if (tripResize) {
        tripResize(); // a trip measured for the old size cannot land properly: it ends in place
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
