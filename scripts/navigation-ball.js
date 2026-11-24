/* Navigation plus console + travelling ball.
 *
 * Trip sequence (every trip, in this exact order):
 *   selected nav circle morphs into the ball at A (no movement) -> capture A once -> freeze scroll -> three prep bounces at A (z/4, z/2, 3z/4)
 *   -> compute scrollTarget and the final visible landing point B -> the main path, with the page scrolling in the same requestAnimationFrame:
 *        desktop / tablet: a cubic Bezier arc whose ends are vertical, plus a straight vertical part (the drop into B, or on upward trips
 *          the rise out of A) during which - and only then - the page scrolls
 *        phone (max-width: 767px): a vertical bounce, B.x = A.x
 *      timed by real physics at cartoon strength (one gravity for the flight, the bounces and the roll-off; squash on impact, stretch
 *      when fast, an anticipation squash before every launch)
 *   -> exact landing at B -> three landing bounces at B (each ~0.3 x the height of the one before), page still -> roll out of the screen
 *   (or off the end of the picture) -> travelling ball hidden
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
  /* physics: one cartoon gravity for the flight, the bounces and the roll-off (phones: divided by MOBILE_BALL_TIME_SCALE, so their
   * bounces stay a little calmer). About 2.5 x what the old flight implied: rises slow down, falls snap. */
  const FLIGHT_GRAVITY = 2400; // px/s^2
  /* how the page scroll and the ball's fall share the motion (?fall=a|b|c|d in the address overrides it, to compare):
   *   "a": physics on screen only, the page scrolls (smootherstep) during the straight part - snappy, but the scroll is very short
   *   "b": physics in the page, the scroll is a camera following the ball from the straight part (the ball slows on screen as it takes over)
   *   "c": the camera takes over at the top: on screen the ball's speed only rises after the top, the page speeds up evenly and stops dead
   *        with the impact (it also scrolls while the ball still moves sideways on the arc)
   *   "d": like "c" on screen, but the page scrolls only during the straight part */
  const NAV_BALL_FALL = "d";
  const FALL_SECONDS_BASE = 0.55; // "c" / "d": the camera leg lasts 0.55 s + (its distance through the page) / 8000 px/s, 0.6 - 1.2 s
  const FALL_PX_PER_SECOND = 8000;
  const FALL_SECONDS_MIN = 0.6;
  const FALL_SECONDS_MAX = 1.2;
  const CAMERA_LEG_MAX_SECONDS = 1.2; // a long trip through the page gets stronger gravity, so its scrolling part never takes longer than this
  const APEX_SPEED_MIN = 40; // px/s: the slowest the ball crosses the top of an arc (narrow arcs: a short natural hang)
  const APEX_SPEED_MAX = 900;
  const RESTITUTION = 0.55; // each landing bounce rises to 0.55^2 ~ 0.3 of the one before, and is over sooner
  const LAND_FIRST_MIN = 0.6; // the first landing bounce: what the impact gives (0.3 x the fall), kept between 0.6 z and 0.85 z
  const LAND_FIRST_MAX = 0.85;
  const CONTACT_MS = 60; // the ball sits squashed on the surface this long at every bounce
  const LAUNCH_CONTACT_MS = 95; // ... and this long before the big launch (anticipation)
  const SQUASH_MAX = 0.3; // the hardest squash: 30 % shorter
  const SQUASH_SPEED_FULL = 2600; // px/s impact for the hardest squash (squash grows with the impact speed)
  const SQUASH_WIDEN = 0.8; // how much wider it gets for each bit shorter
  const ANTICIPATION_SHARE = 0.45; // before a launch the ball squashes as if hit at this share of the launch speed
  const STRETCH_FROM = 350; // px/s: no stretch below this speed (round near the top) ...
  const STRETCH_FULL = 2400; // ... full stretch at this speed ...
  const STRETCH_MAX = 0.22; // ... 22 % longer along the direction of travel
  // height of the two control points above the higher of A and B: max(MIN, |dx| * SPAN, z * Z). The real top of the curve is about 3/4 of this
  // for level ends (less when one end is much lower). Lowered only when the sampled curve would leave the screen.
  const BEZIER_LIFT_MIN = 40;
  const BEZIER_LIFT_SPAN = 0.55;
  const BEZIER_LIFT_Z = 0.65;
  const BEZIER_MIN_LIFT = 10; // never less: the start and the end stay vertical
  // the top of the arc is at least this far above the higher of A and E (the top of the straight drop): clamp(z * FACTOR, MIN, MAX); the
  // screen edge can still lower it
  const FLIGHT_TOP_RISE_FACTOR = 1.5;
  const FLIGHT_TOP_RISE_MIN = 100;
  const FLIGHT_TOP_RISE_MAX = 170;
  // the straight drop into B at the end of the flight; the page scrolls only during this drop
  const DROP_FACTOR = 1.6; // drop = clamp(z * 1.6, MIN, MAX), but at most DROP_ROOM_SHARE of the screen space above B
  const DROP_MIN = 110;
  const DROP_MAX = 220;
  const DROP_ROOM_SHARE = 0.75;
  const DROP_FLOOR = 40;
  // upward trips (the destination is above): straight rise with the page scrolling, then the arc, then a short fall onto B
  const SHORT_FALL_FACTOR = 0.55; // the short fall = clamp(z * 0.55, 36, 64) px (at most half the room above B)
  const SHORT_FALL_MIN = 36;
  const SHORT_FALL_MAX = 64;
  const SHORT_FALL_FLOOR = 20;
  const UP_ARC_RISE_FACTOR = 0.9; // the arc on top of the rise: clamp(z * 0.9, 56, 100) px above the higher of S and E
  const UP_ARC_RISE_MIN = 56;
  const UP_BEZIER_LIFT_SPAN = 0.3; // upward trips: the control points sit 0.3 x the sideways distance above the higher end (0.55 downward)
  const UP_ARC_RISE_MAX = 100;
  const UP_RISE_MIN = 80; // the straight rise is at least this long, even when B sits low on the screen
  const UP_ARC_ROOM = 40; // the arc starts at least this far below the top of the flight
  const UP_RISE_TARGET_SPEED = 300; // px/s: the straight rise is made long enough for about this speed
  const UP_SCROLL_END_SHARE = 0.92; // the page has finished scrolling at 92 % of the rise, so not a pixel of it overlaps the arc (even with a dropped frame)
  const UP_LOW_ARC_DROP = 170; // the straight rise ends at most this far above a low landing point (the landing floor)
  const UP_SCROLL_SECONDS_BASE = 0.5; // upward trips: the rise (and the scroll) lasts 0.5 s + scroll distance / 6000 px/s, 0.6 - 0.95 s
  const UP_SCROLL_PX_PER_SECOND = 6000;
  const UP_SCROLL_SECONDS_MIN = 0.6;
  const UP_SCROLL_SECONDS_MAX = 0.95;
  // the top of the flight keeps the ball's top edge this far below the top of the screen (clear of the top fade band and the name):
  // 12 % of the screen height, at least 72 px (56 px on phones), at most 150 px, and never less than the fade band's own height
  const FLIGHT_TOP_CLEAR_SHARE = 0.12;
  const FLIGHT_TOP_CLEAR_MIN = 72;
  const FLIGHT_TOP_CLEAR_MIN_PHONE = 56;
  const FLIGHT_TOP_CLEAR_MAX = 150;
  // the landing point sits at least this far below the top of the flight, so there is room for the arc's top and a calm straight drop
  const LANDING_FLIGHT_ROOM = 130;
  const BEZIER_SAMPLES = 720;

  // phone main path (one big vertical bounce)
  const PHONE_MAIN_LIFT_FACTOR = 1.7; // apex = higher of A and B minus clamp(phoneZ * 1.7, 84, 150)
  const PHONE_MAIN_LIFT_MIN = 84;
  const PHONE_MAIN_LIFT_MAX = 150;
  const PHONE_MAIN_LIFT_FLOOR = 28; // on a very short screen the apex may come lower than 84 px, never lower than this
  const PHONE_APEX_HANG = 0; // ms of extra hold at the top: none - the real slow-down over the top already reads as a ~0.1 s hang

  const ARCHIVE_STEP_FACTOR = 0.055; // archive: the ball lands this share of the screen width to the RIGHT of where it took off ...
  const ARCHIVE_STEP_MIN = 48; // ... at least this many px ...
  const ARCHIVE_STEP_MAX = 110; // ... at most this many: a short hop to the right, then the straight drop (never a swing to the left)
  const LANDING_EDGE_BUFFER = 6; // px: extra room between the ball and the rounded image corner it lands near
  // Where the ball comes to rest, as a fraction of the screen height measured from the top (the page is scrolled so that the platform it lands on
  // is there). Small = the section title sits near the top and the first tile is whole with a good part of the second below it; it is never
  // smaller than what the bounces and the arc need to stay on screen (see resolveScrollTarget).
  const LANDING_SCREEN_FRACTION = 0.2;
  const LANDING_SCREEN_FRACTION_MAX = 0.34;
  const SCROLL_PROGRESS_MODE = "smootherstep"; // easing of the page scroll over the flight time ("linear" = scroll progress equals flight progress)

  const BALL_MORPH_DURATION = 1300;
  const NAV_BALL_ROLL_DURATION = 2180;
  // rolling off the end of a picture that stops short of the screen edge (see planRollAway)
  const ROLL_FADE_MS = 450; // the ball fades out over this long once it has left the corner
  const ROLL_TIP_MIN_ANGLE = 0.6; // rad (~34 deg): the ball follows the rounded corner at least this far before it leaves it ...
  const ROLL_TIP_MAX_ANGLE = 1.25; // ... and at most this far (~72 deg)
  const EDGE_TOLERANCE = 1.5; // px: a picture this close to the screen edge counts as touching it
  const MOBILE_BALL_TIME_SCALE = 1.42; // calmer bounces / roll on phones

  // staged (phone) menu opening, about 1.2 s in all: each spoke visibly grows out of the top of the plus (780 ms, 100 ms apart); each circle
  // fades and scales in (520 ms, styles/motion.css --phone-pop-delay) as its spoke nears its end; the circles take taps once all are in
  const PHONE_MENU_SPOKE_DURATION = 780;
  const PHONE_MENU_SPOKE_STAGGER = 100;
  const PHONE_MENU_SPOKE_EASE = "cubic-bezier(0.3, 0.1, 0.2, 1)"; // an even, unhurried draw (no burst at the start)
  const PHONE_MENU_READY_DELAY = 1270;
  const SPOKE_GAP = 7; // px of clear paper between a spoke's end and the black disc / its circle

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
   * The curve is sampled densely once per trip; the timing along it is physics (see planBezierPath).
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

  /* Two parts, one motion (laptop / tablet):
   *   1) the ARC, page standing still: a cubic Bezier from A to E, where E sits straight above B; both control points are straight above their
   *      ends, so the ball leaves A going straight up, crosses one rounded top and arrives at E going straight down. All sideways movement
   *      happens here, while nothing scrolls. It slows all the way up, is slowest at the top and speeds up all the way down.
   *   2) the DROP, page scrolling: a straight vertical fall from E to B. Only now does the page scroll, so the scroll never mixes with any
   *      left / right movement of the ball. The scroll arrives exactly as the ball lands.
   *   (upward trips are the mirror: a straight rise with the page scrolling, then the arc, then a short fall onto B)
   * The speed and the direction never jump at E (the arc ends vertical, at the speed the drop starts with). */
  function planBezierPath(A, B, z, safeTop, scrollDistance, upward, gravity, fall) {
    const room = Math.max(B.y - safeTop, 0); // screen space above B
    // downward trips: a long straight drop (the page scrolls during it); upward trips: only a short fall onto B at the end (the page has
    // already scrolled, during the straight rise)
    const drop = upward ?
      Math.max(Math.min(clamp(z * SHORT_FALL_FACTOR, SHORT_FALL_MIN, SHORT_FALL_MAX), room * 0.5), SHORT_FALL_FLOOR) :
      Math.max(Math.min(clamp(z * DROP_FACTOR, DROP_MIN, DROP_MAX), room * DROP_ROOM_SHARE), DROP_FLOOR);
    const E = { x: B.x, y: B.y - drop };
    // the arc starts at S: A itself on downward trips; on upward trips the top of the straight rise (with the page scrolling), level with B
    // or a little higher, so the arc is the same small rise-and-over as everywhere else and ends just above the target
    // (long enough to run at about UP_RISE_TARGET_SPEED while the page scrolls: a landing point low on the screen, like the landing floor,
    // would otherwise leave only a short, slow crawl)
    // (and, for a landing point low on the screen, no more than UP_LOW_ARC_DROP above it, so the arc down to it stays a short one)
    // (geometry only: the timing is physics, below)
    const scrollSeconds = clamp(UP_SCROLL_SECONDS_BASE + Math.abs(scrollDistance || 0) / UP_SCROLL_PX_PER_SECOND, UP_SCROLL_SECONDS_MIN, UP_SCROLL_SECONDS_MAX);
    const S = upward ?
      { x: A.x, y: Math.min(clamp(Math.max(Math.min(A.y - Math.max(UP_RISE_MIN, UP_RISE_TARGET_SPEED * scrollSeconds), B.y), B.y - UP_LOW_ARC_DROP), safeTop + UP_ARC_ROOM, A.y - UP_RISE_MIN), A.y) } :
      { x: A.x, y: A.y };
    const topY = Math.min(S.y, E.y);
    const dx = E.x - S.x;
    const riseFor = function (lift) {
      return topY - sampleBezier(S, { x: S.x, y: topY - lift }, { x: E.x, y: topY - lift }, E, 96).minY;
    };
    // upward trips: a smaller arc on top of the straight rise, so the way down to B stays a short fall
    const wantedRise = upward ? clamp(z * UP_ARC_RISE_FACTOR, UP_ARC_RISE_MIN, UP_ARC_RISE_MAX) : clamp(z * FLIGHT_TOP_RISE_FACTOR, FLIGHT_TOP_RISE_MIN, FLIGHT_TOP_RISE_MAX);
    let riseLift = wantedRise;

    // the real top of a Bezier is lower than its control points (by how much depends on the ends): find the lift that gives the wanted rise
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

    // upward trips: a flatter arc (it only has to carry the ball across and down a little, the climb was the straight rise)
    const wantedLift = Math.max(BEZIER_LIFT_MIN, Math.abs(dx) * (upward ? UP_BEZIER_LIFT_SPAN : BEZIER_LIFT_SPAN), z * BEZIER_LIFT_Z, riseLift);
    const build = function (lift) {
      const controlY = topY - lift;
      const P1 = { x: S.x, y: controlY };
      const P2 = { x: E.x, y: controlY };

      return { lift: lift, P1: P1, P2: P2, sampled: sampleBezier(S, P1, P2, E, BEZIER_SAMPLES) };
    };
    let plan = build(wantedLift);

    // keep the sampled curve (not the control points) on screen: lower the lift, never move A, E or B
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

    /* timing: real physics along this fixed path, at cartoon strength. One gravity g for the whole trip (and the bounces and the roll):
     *   on the path the ball behaves like a bead on a wire: speed^2 = vTop^2 + 2 g (y - apexY). So it leaves fast, slows all the way up,
     *   is slowest at the top, then speeds up all the way down - it can never slow down after the top.
     *   vTop is the horizontal speed a real throw would carry over the top: it is set so that the arc takes exactly as long as a real
     *   projectile with the same rise and fall (narrow arcs: a short natural hang at the top; wide arcs: the ball sweeps across).
     * The page scroll:
     *   "page" camera (default): the physics is in PAGE space and the scroll is a camera following the ball. Downward trips: from E the
     *   ball falls freely through the page (screen drop + scroll distance), the camera picks it up and the page accelerates like the falling
     *   ball until the impact stops it. Upward trips: the ball is thrown up through the page; the camera whips up with it and slows with it,
     *   standing still by the time the arc begins. On screen the straight part only ever moves one way and joins the arc at the same speed.
     *   "screen" camera: the physics is on screen and the page scrolls (smootherstep) during the straight part only. */
    let g = Math.max(gravity || FLIGHT_GRAVITY, 1);
    const arcPoints = plan.sampled.points;
    const points = [];

    // upward trips: the straight rise A -> S first (2 px steps)
    if (S.y < A.y - 0.5) {
      const riseSteps = Math.max(2, Math.ceil((A.y - S.y) / 2));

      for (let step = 0; step < riseSteps; step += 1) {
        points.push({ x: A.x, y: A.y + ((S.y - A.y) * step) / riseSteps });
      }
    }

    const sIndex = points.length; // the arc's first point (the end of the straight rise)

    arcPoints.forEach(function (point) {
      points.push({ x: point.x, y: point.y });
    });

    const apexIndex = sIndex + plan.sampled.apexIndex;
    const apexY = points[apexIndex].y;
    const eIndex = points.length - 1;
    const dropSteps = Math.max(2, Math.ceil(drop / 2));

    for (let step = 1; step <= dropSteps; step += 1) {
      points.push({ x: B.x, y: E.y + (drop * step) / dropSteps });
    }

    const lastIndex = points.length - 1;
    const scrollSigned = scrollDistance || 0;
    const scrollAbs = Math.abs(scrollSigned);
    const pageCamera = fall === "b" && scrollAbs > 1;

    // the bigger the trip through the page, the stronger the cartoon gravity: the scrolling part stays under CAMERA_LEG_MAX_SECONDS
    if (pageCamera) {
      const legWorld = upward ? A.y - apexY + scrollAbs : B.y - apexY + scrollAbs;

      g = Math.max(g, (2 * legWorld) / (CAMERA_LEG_MAX_SECONDS * CAMERA_LEG_MAX_SECONDS));
    }

    function speedAt(index, vTop) {
      return Math.sqrt(vTop * vTop + 2 * g * Math.max(points[index].y - apexY, 0));
    }

    function segmentSeconds(index, vTop) {
      const a = points[index - 1];
      const b = points[index];
      const length = Math.hypot(b.x - a.x, b.y - a.y);

      return length > 0 ? (2 * length) / Math.max(speedAt(index - 1, vTop) + speedAt(index, vTop), 1e-6) : 0;
    }

    function spanSeconds(from, to, vTop) {
      let total = 0;

      for (let index = from + 1; index <= to; index += 1) {
        total += segmentSeconds(index, vTop);
      }

      return total;
    }

    // the speed over the top: the arc S -> E takes as long as a real throw that rises (S - apex) and falls (E - apex)
    const throwSeconds = Math.sqrt((2 * Math.max(S.y - apexY, 0)) / g) + Math.sqrt((2 * Math.max(E.y - apexY, 0)) / g);
    let vTop = APEX_SPEED_MIN;

    if (spanSeconds(sIndex, eIndex, vTop) > throwSeconds) {
      let low = APEX_SPEED_MIN;
      let high = APEX_SPEED_MAX;

      if (spanSeconds(sIndex, eIndex, high) > throwSeconds) {
        vTop = high;
      } else {
        for (let step = 0; step < 32; step += 1) {
          const middle = (low + high) / 2;

          if (spanSeconds(sIndex, eIndex, middle) > throwSeconds) {
            low = middle;
          } else {
            high = middle;
          }
        }

        vTop = high;
      }
    }

    /* "c" and "d" (the default is "c"): the camera takes over at the top. On screen the ball's height changes at ONE constant rate from the
     * top: downward, it falls from the top under a gentle on-screen gravity all the way to B (through the rest of the arc and the
     * straight drop; bead on a wire, so its on-screen speed only ever rises, and the straight drop is one constant acceleration); the camera (page scroll) speeds up at a constant rate and stops dead with the
     * impact. Upward is the mirror: from the launch the ball's on-screen climb slows at a constant rate to rest at the top while the camera
     * starts at its fastest and slows at a constant rate. The whole camera leg lasts FALL_SECONDS_* (0.6 - 1.2 s, longer trips longer).
     *   "c": the camera runs from the top (downward) / up to the top (upward), so it also scrolls while the ball still moves sideways on the
     *        arc;
     *   "d": the same on-screen motion, but the camera only runs during the straight part (downward from E, upward up to S): the page never
     *        scrolls while the ball moves sideways.
     * The part of the flight without the camera (downward: the climb; upward: the way down after the top) stays the bead-on-a-wire physics
     * above, with the speed over the top matched to the camera leg's, so nothing jumps at the top. */
    if ((fall === "c" || fall === "d") && scrollAbs > 1) {
      const depthAt = function (index) {
        return Math.max(points[index].y - apexY, 0);
      };
      const lengthBetween = function (from, to) {
        let total = 0;

        for (let index = Math.min(from, to) + 1; index <= Math.max(from, to); index += 1) {
          total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
        }

        return total;
      };
      // the bead-on-a-wire time over [from, to] with gravity gs and speed v0 over the top: speed^2 = v0^2 + 2 gs depth
      const beadSeconds = function (from, to, gs, v0) {
        let totalSeconds = 0;

        for (let index = from + 1; index <= to; index += 1) {
          const va = Math.sqrt(v0 * v0 + 2 * gs * depthAt(index - 1));
          const vb = Math.sqrt(v0 * v0 + 2 * gs * depthAt(index));
          const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);

          totalSeconds += length > 0 ? (2 * length) / Math.max(va + vb, 1e-6) : 0;
        }

        return totalSeconds;
      };
      // the gentle on-screen gravity that makes [from, to] take exactly `seconds` (time falls as the gravity grows)
      const fitGravity = function (from, to, v0, seconds) {
        let low = 0;
        let high = 100;

        while (beadSeconds(from, to, high, v0) > seconds && high < 1e8) {
          high *= 2;
        }

        for (let stepIndex = 0; stepIndex < 50; stepIndex += 1) {
          const middle = (low + high) / 2;

          if (beadSeconds(from, to, middle, v0) > seconds) {
            low = middle;
          } else {
            high = middle;
          }
        }

        return high;
      };
      const ct = new Array(points.length);
      let camStart;
      let camEnd;
      let scrollShare;
      let screenGravity;

      if (!upward) {
        const T = fallSeconds(depthAt(lastIndex) + scrollAbs);

        // over the top at the throw's speed (at most 0.6 x the average the way down needs, so a gentle gravity can still fit the time)
        const overTop = Math.max(Math.min(vTop, (0.6 * lengthBetween(apexIndex, lastIndex)) / T), 20);

        screenGravity = fitGravity(apexIndex, lastIndex, overTop, T);
        ct[0] = 0;

        for (let index = 1; index <= apexIndex; index += 1) {
          ct[index] = ct[index - 1] + segmentSeconds(index, overTop);
        }

        for (let index = apexIndex + 1; index <= lastIndex; index += 1) {
          ct[index] = ct[index - 1] + beadSeconds(index - 1, index, screenGravity, overTop);
        }

        camStart = fall === "c" ? ct[apexIndex] : ct[eIndex];
        camEnd = ct[lastIndex];
        scrollShare = function (t) {
          const u = clamp((t - camStart) / Math.max(camEnd - camStart, 1e-6), 0, 1);

          return u * u; // constant acceleration from rest
        };
      } else {
        const T = fallSeconds(depthAt(0) + scrollAbs);
        const overTop = Math.max(Math.min(vTop, (0.6 * lengthBetween(0, apexIndex)) / T), 20);

        screenGravity = fitGravity(0, apexIndex, overTop, T);
        ct[0] = 0;

        for (let index = 1; index <= apexIndex; index += 1) {
          ct[index] = ct[index - 1] + beadSeconds(index - 1, index, screenGravity, overTop);
        }

        for (let index = apexIndex + 1; index <= lastIndex; index += 1) {
          ct[index] = ct[index - 1] + segmentSeconds(index, overTop);
        }

        camStart = 0;
        camEnd = fall === "c" ? ct[apexIndex] : ct[sIndex];
        scrollShare = function (t) {
          const u = clamp(t / Math.max(camEnd, 1e-6), 0, 1);

          return 1 - (1 - u) * (1 - u); // fastest at the launch, a constant slow-down to rest
        };
      }

      const total = Math.max(ct[lastIndex], 0.05);
      const cdPoint = function (seconds) {
        if (seconds <= 0) {
          return { x: A.x, y: A.y };
        }

        if (seconds >= total) {
          return { x: B.x, y: B.y };
        }

        let low = 1;
        let high = ct.length - 1;

        while (low < high) {
          const middle = (low + high) >> 1;

          if (ct[middle] < seconds) {
            low = middle + 1;
          } else {
            high = middle;
          }
        }

        const span = ct[low] - ct[low - 1];
        const fraction = span > 1e-12 ? clamp((seconds - ct[low - 1]) / span, 0, 1) : 0;

        return { x: mix(points[low - 1].x, points[low].x, fraction), y: mix(points[low - 1].y, points[low].y, fraction) };
      };
      const cdScroll = function (seconds) {
        return seconds >= total ? 1 : scrollShare(seconds);
      };
      const cdWorld = function (seconds) {
        const point = cdPoint(seconds);

        return { x: point.x, y: point.y + cdScroll(seconds) * scrollSigned };
      };
      const step = 0.008;
      const launchSpeed = Math.hypot(cdWorld(step).x - cdWorld(0).x, cdWorld(step).y - cdWorld(0).y) / step;
      const impactSpeed = Math.hypot(cdWorld(total).x - cdWorld(total - step).x, cdWorld(total).y - cdWorld(total - step).y) / step;
      let cdLength = 0;

      for (let index = 1; index < points.length; index += 1) {
        cdLength += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
      }

      return {
        mode: upward ? "rise-then-bezier" : "bezier-then-drop",
        camera: fall,
        duration: total,
        length: cdLength,
        speed: cdLength / total,
        pointAt: cdPoint,
        progressAt: function (seconds) {
          return clamp(seconds / total, 0, 1);
        },
        scrollProgressAt: cdScroll,
        worldAt: cdWorld,
        launchSpeed: launchSpeed,
        impactSpeed: impactSpeed,
        gravity: g,
        samples: points.map(function (point) {
          return { x: point.x, y: point.y };
        }),
        apex: copyPoint(points[apexIndex]),
        guides: [
          { name: "P1", point: copyPoint(plan.P1), colour: "#1fa34a" },
          { name: "P2", point: copyPoint(plan.P2), colour: "#11a5b8" },
          { name: "camera " + (upward ? "stops" : "starts"), point: copyPoint(points[upward ? (fall === "c" ? apexIndex : sIndex) : (fall === "c" ? apexIndex : eIndex)]), colour: "#8a2be2" }
        ],
        geometry: { A: copyPoint(A), E: copyPoint(E), B: copyPoint(B), P1: copyPoint(plan.P1), P2: copyPoint(plan.P2), lift: plan.lift, drop: drop, fall: fall, cameraStart: camStart, cameraEnd: camEnd, screenGravity: screenGravity, gravity: g, launchSpeed: launchSpeed, impactSpeed: impactSpeed, safeTop: safeTop }
      };
    }

    const times = [0];

    for (let index = 1; index < points.length; index += 1) {
      times.push(times[index - 1] + segmentSeconds(index, vTop));
    }

    /* the page camera's straight part (u = share of its time T, w = how far the ball has travelled through the page):
     *   downward, from E:  w = vE t + g t^2 / 2 over drop + scroll;  on screen drop (1 - (1 - u)^q), q = vE T / drop (leaves E at vE)
     *   upward, from A:    w = vA t - g t^2 / 2 over rise + scroll;  on screen rise u^q, q = vS T / rise (reaches S at vS)
     *   the camera (scroll) = w minus the on-screen part: it never runs backwards. When the scroll is tiny (q < 1) screen and page share the
     *   motion in proportion instead. */
    const cam = { active: false, start: 0, T: 0, q: 1, proportional: false, v0: 0, sign: 1, length: 0, total: 0 };

    if (pageCamera && !upward) {
      const vE = speedAt(eIndex, vTop);
      const total = drop + scrollAbs;
      const vB = Math.sqrt(vE * vE + 2 * g * total);

      cam.active = true;
      cam.start = times[eIndex];
      cam.T = Math.max((vB - vE) / g, 0.05);
      cam.v0 = vE;
      cam.sign = 1;
      cam.length = drop;
      cam.total = total;
      cam.q = (vE * cam.T) / Math.max(drop, 1e-6);
      cam.proportional = cam.q < 1;
      cam.landing = vB;
    } else if (pageCamera && upward) {
      const rise = Math.max(A.y - S.y, 0);
      const vS = speedAt(sIndex, vTop);
      const total = rise + scrollAbs;
      const vA = Math.sqrt(vS * vS + 2 * g * total);

      cam.active = true;
      cam.start = 0;
      cam.T = Math.max((vA - vS) / g, 0.05);
      cam.v0 = vA;
      cam.sign = -1;
      cam.length = rise;
      cam.total = total;
      cam.q = (vS * cam.T) / Math.max(rise, 1e-6);
      cam.proportional = cam.q < 1 || rise < 1;
      cam.launch = vA;
    }

    // how far the ball has gone through the page, and how much of that shows on screen, t seconds into the camera's straight part
    function camWorld(t) {
      const s = clamp(t, 0, cam.T);

      return cam.sign > 0 ? cam.v0 * s + 0.5 * g * s * s : cam.v0 * s - 0.5 * g * s * s;
    }

    function camScreen(t) {
      const u = clamp(t / cam.T, 0, 1);

      if (cam.proportional) {
        return (cam.length * camWorld(t)) / Math.max(cam.total, 1e-6);
      }

      return cam.sign > 0 ? cam.length * (1 - Math.pow(1 - u, cam.q)) : cam.length * Math.pow(u, cam.q);
    }

    // upward + page camera: the arc starts once the camera's rise is over
    const arcOffset = cam.active && cam.sign < 0 ? cam.T - times[sIndex] : 0;
    const duration = cam.active && cam.sign > 0 ? cam.start + cam.T : Math.max(times[lastIndex] + arcOffset, 0.05);
    const arcSeconds = Math.max(times[eIndex] + arcOffset, 0.05); // the moment the ball reaches E
    const riseSeconds = cam.active && cam.sign < 0 ? cam.T : times[sIndex]; // upward trips: the page scrolls during [0, riseSeconds]
    let pathLength = 0;

    for (let index = 1; index < points.length; index += 1) {
      pathLength += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    }

    function interpolate(seconds) {
      const local = seconds - arcOffset;
      let low = 1;
      let high = times.length - 1;

      while (low < high) {
        const middle = (low + high) >> 1;

        if (times[middle] < local) {
          low = middle + 1;
        } else {
          high = middle;
        }
      }

      const span = times[low] - times[low - 1];
      const fraction = span > 1e-12 ? clamp((local - times[low - 1]) / span, 0, 1) : 0;

      return { x: mix(points[low - 1].x, points[low].x, fraction), y: mix(points[low - 1].y, points[low].y, fraction) };
    }

    function pointAt(seconds) {
      if (seconds <= 0) {
        return { x: A.x, y: A.y };
      }

      if (seconds >= duration) {
        return { x: B.x, y: B.y };
      }

      if (cam.active && cam.sign > 0 && seconds >= cam.start) {
        return { x: B.x, y: E.y + camScreen(seconds - cam.start) };
      }

      if (cam.active && cam.sign < 0 && seconds < cam.T) {
        return { x: A.x, y: A.y - camScreen(seconds) };
      }

      return interpolate(seconds);
    }

    function scrollProgressAt(seconds) {
      if (cam.active && cam.sign > 0) {
        if (seconds <= cam.start) {
          return 0;
        }

        const t = seconds - cam.start;

        return clamp((camWorld(t) - camScreen(t)) / scrollAbs, 0, 1);
      }

      if (cam.active && cam.sign < 0) {
        if (seconds >= cam.T) {
          return 1;
        }

        return clamp((camWorld(seconds) - camScreen(seconds)) / scrollAbs, 0, 1);
      }

      // screen camera. downward: the page stays still during the arc and scrolls only during the straight drop. upward: it scrolls only
      // during the straight rise (done just before the arc begins), then stays still for the arc and the short fall
      if (upward) {
        // (done at 92 % of the rise, and at least 60 ms before the arc, so a late frame never mixes the scroll with sideways movement)
        const scrollEnd = Math.max(Math.min(riseSeconds * UP_SCROLL_END_SHARE, riseSeconds - 0.06), riseSeconds * 0.6);

        return riseSeconds > 0 ? smootherstep(seconds / scrollEnd) : 1;
      }

      return seconds <= arcSeconds ? 0 : smootherstep((seconds - arcSeconds) / Math.max(duration - arcSeconds, 1e-6));
    }

    const samples = points.map(function (point) {
      return { x: point.x, y: point.y };
    });
    const launchSpeed = cam.launch || speedAt(0, vTop);
    const impactSpeed = cam.landing || speedAt(lastIndex, vTop);

    return {
      mode: upward ? "rise-then-bezier" : "bezier-then-drop",
      camera: cam.active ? "page" : "screen",
      duration: duration,
      length: pathLength,
      speed: pathLength / duration,
      pointAt: pointAt,
      progressAt: function (seconds) {
        return clamp(seconds / duration, 0, 1);
      },
      scrollProgressAt: scrollProgressAt,
      // where the ball is in the world the physics runs in (the page for the page camera, the screen otherwise): for the stretch
      worldAt: function (seconds) {
        const point = pointAt(seconds);

        return cam.active ? { x: point.x, y: point.y + scrollProgressAt(seconds) * scrollSigned } : point;
      },
      launchSpeed: launchSpeed,
      impactSpeed: impactSpeed,
      gravity: g,
      samples: samples,
      apex: copyPoint(points[apexIndex]),
      guides: [
        { name: "P1", point: copyPoint(plan.P1), colour: "#1fa34a" },
        { name: "P2", point: copyPoint(plan.P2), colour: "#11a5b8" },
        upward ? { name: "S (scroll ends)", point: copyPoint(S), colour: "#8a2be2" } : { name: "E (scroll starts)", point: copyPoint(E), colour: "#8a2be2" }
      ],
      geometry: { A: copyPoint(A), E: copyPoint(E), B: copyPoint(B), P1: copyPoint(plan.P1), P2: copyPoint(plan.P2), lift: plan.lift, drop: drop, arcSeconds: arcSeconds, dropSeconds: duration - arcSeconds, riseSeconds: riseSeconds, gravity: g, topSpeed: vTop, launchSpeed: launchSpeed, impactSpeed: impactSpeed, camera: cam.active ? "page" : "screen", cameraSeconds: cam.T, cameraQ: cam.q, safeTop: safeTop }
    };
  }

  /* ---- phone main path: one big vertical bounce -------------------------------------------------------------------------------------
   *   A -> apex (a real throw: fast start, slowing to 0) -> a short hang (PHONE_APEX_HANG) -> B (a real fall: starts slowly and speeds
   *   up into B, then the first landing bounce takes over). One gravity for both legs. x never changes (B.x = A.x).
   * Scroll: downward trips scroll only while the ball falls, upward trips only while it rises. With the page camera (default) the leg that
   * scrolls is a throw / fall through the page, and the page moves with the ball's own speed; with the screen camera it is smootherstep. */
  function planPhoneBounce(A, B, phoneZ, safeTop, upward, gravity, scrollDistance, fall) {
    const topY = Math.min(A.y, B.y);
    const wantedLift = clamp(phoneZ * PHONE_MAIN_LIFT_FACTOR, PHONE_MAIN_LIFT_MIN, PHONE_MAIN_LIFT_MAX);
    const lift = Math.max(Math.min(wantedLift, topY - safeTop), PHONE_MAIN_LIFT_FLOOR);
    const apex = { x: A.x, y: topY - lift };
    const upDistance = Math.abs(A.y - apex.y);
    const downDistance = Math.abs(B.y - apex.y);
    const scrollSigned = scrollDistance || 0;
    const scrollAbs = Math.abs(scrollSigned);
    const pageCamera = fall === "b" && scrollAbs > 1;
    // "c" / "d" (the same on a phone: the ball only moves up and down): the leg that scrolls lasts fallSeconds(its distance through the
    // page); on screen and in the page it is one constant acceleration (downward, from rest at the top) / deceleration (upward, to rest at
    // the top), so the camera speeds up evenly and stops dead with the impact, or starts fast and slows evenly to rest at the top
    const shareCamera = (fall === "c" || fall === "d") && scrollAbs > 1;
    // one gravity, a real throw and a real fall: with the page camera the leg that scrolls is a throw / fall through the page (its screen
    // distance + the scroll), and a long one gets stronger gravity (CAMERA_LEG_MAX_SECONDS)
    const upWorld = upDistance + (pageCamera && upward ? scrollAbs : 0);
    const downWorld = downDistance + (pageCamera && !upward ? scrollAbs : 0);
    const g = Math.max(gravity || FLIGHT_GRAVITY, 1, pageCamera ? (2 * (upward ? upWorld : downWorld)) / (CAMERA_LEG_MAX_SECONDS * CAMERA_LEG_MAX_SECONDS) : 1);
    const upT = shareCamera && upward ? fallSeconds(upDistance + scrollAbs) : Math.max(Math.sqrt((2 * upWorld) / g), 0.05);
    const downT = shareCamera && !upward ? fallSeconds(downDistance + scrollAbs) : Math.max(Math.sqrt((2 * downWorld) / g), 0.05);
    const hangT = PHONE_APEX_HANG / 1000;
    const total = upT + hangT + downT;
    const camT = upward ? upT : downT;
    const camScreen = upward ? upDistance : downDistance;
    const camWorld = upward ? upWorld : downWorld;

    /* the camera leg, measured from the apex (r = time from the top): the ball moves r seconds' worth of a real fall through the page, g r^2 / 2;
     * on screen it shows the share e^(-r / tau) of that speed, so right at the top it moves exactly like a real ball (a natural hang, no
     * stall) and the camera then takes over smoothly; tau is set so that the screen part is exactly the leg's screen distance */
    function screenFrom(r, tau) {
      const e = Math.exp(-r / tau);

      return g * (tau * tau * (1 - e) - tau * r * e);
    }

    let tau = 1e4;

    if (pageCamera && screenFrom(camT, tau) > camScreen) {
      let low = 1e-4;
      let high = tau;

      for (let step = 0; step < 60; step += 1) {
        const middle = Math.sqrt(low * high);

        if (screenFrom(camT, middle) > camScreen) {
          high = middle;
        } else {
          low = middle;
        }
      }

      tau = (low + high) / 2;
    }

    const tauScale = pageCamera ? camScreen / Math.max(screenFrom(camT, tau), 1e-6) : 1; // exact end point despite the bisection's rounding

    // seconds -> { y on screen, share of the scroll done }
    function stateAt(seconds) {
      const t = clamp(seconds, 0, total);

      if (t < upT) {
        const r = upT - t; // time left to the top
        const worldLeft = 0.5 * g * r * r; // still to climb, through the page

        if (pageCamera && upward) {
          const screenLeft = screenFrom(r, tau) * tauScale;

          return { y: apex.y + screenLeft, scroll: clamp((upWorld - worldLeft - (upDistance - screenLeft)) / scrollAbs, 0, 1) };
        }

        const left = (r / upT) * (r / upT); // share of the climb still to go (constant deceleration)

        return { y: apex.y + upDistance * left, scroll: upward ? (shareCamera ? 1 - left : smootherstep(t / upT)) : 0 };
      }

      if (t < upT + hangT) {
        return { y: apex.y, scroll: upward ? 1 : 0 };
      }

      const r = t - upT - hangT; // time since the fall began
      const worldDone = Math.min(0.5 * g * r * r, downWorld);

      if (pageCamera && !upward) {
        const screenDone = Math.min(screenFrom(r, tau) * tauScale, downDistance);

        return { y: apex.y + screenDone, scroll: clamp((worldDone - screenDone) / scrollAbs, 0, 1) };
      }

      const done = Math.min((r / downT) * (r / downT), 1); // share of the fall done (constant acceleration)

      return { y: apex.y + downDistance * done, scroll: upward ? 1 : shareCamera ? done : smootherstep(r / downT) };
    }

    function pointAt(seconds) {
      if (seconds >= total) {
        return { x: A.x, y: B.y };
      }

      return { x: A.x, y: stateAt(seconds).y };
    }

    function scrollProgressAt(seconds) {
      if (seconds >= total) {
        return 1;
      }

      return seconds <= 0 ? 0 : stateAt(seconds).scroll;
    }

    const samples = [];

    for (let index = 0; index <= 240; index += 1) {
      const point = pointAt((index / 240) * total);

      samples.push({ x: point.x, y: point.y });
    }

    // (the camera leg of "c" / "d" covers distance + scroll in its time from or to rest: its end speed is twice its average)
    const launchSpeed = shareCamera && upward ? (2 * (upDistance + scrollAbs)) / upT : Math.sqrt(2 * g * upWorld);
    const impactSpeed = shareCamera && !upward ? (2 * (downDistance + scrollAbs)) / downT : Math.sqrt(2 * g * downWorld);

    return {
      mode: "phone-bounce",
      camera: fall,
      duration: total,
      length: upDistance + downDistance,
      speed: (upDistance + downDistance) / total,
      pointAt: pointAt,
      progressAt: function (seconds) {
        return clamp(seconds / total, 0, 1);
      },
      scrollProgressAt: scrollProgressAt,
      worldAt: function (seconds) {
        const point = pointAt(seconds);

        return pageCamera || shareCamera ? { x: point.x, y: point.y + scrollProgressAt(seconds) * scrollSigned } : point;
      },
      launchSpeed: launchSpeed,
      impactSpeed: impactSpeed,
      gravity: g,
      samples: samples,
      apex: copyPoint(apex),
      guides: [],
      phoneX: A.x,
      geometry: { A: copyPoint(A), B: copyPoint(B), apex: copyPoint(apex), lift: lift, wantedLift: wantedLift, upMs: upT * 1000, hangMs: PHONE_APEX_HANG, downMs: downT * 1000, gravity: g, camera: pageCamera ? "page" : "screen", cameraWorld: camWorld, tau: tau, safeTop: safeTop }
    };
  }

  function bouncePoint(base, height, p) {
    const q = clamp(p, 0, 1);
    return { x: base.x, y: base.y - 4 * height * q * (1 - q) };
  }

  /* ---- the roll-away after the landing bounces ------------------------------------------------------------------------------------------
   * The ball may only ever roll on something. Two ways out:
   *   "edge": the surface runs on to the screen edge in the roll direction (a picture attached to that edge, the contact floor, the landing
   *           floor): the ball rolls off the screen, slowing under rolling friction alone (still moving as it leaves).
   *   "fall": the surface ends before the screen edge (a free-standing picture): the ball rolls along the top edge with the same rolling
   *           motion until its contact point reaches the rounded corner, rolls over the corner (its centre follows a circle of radius
   *           corner radius + ball radius around the corner's centre, speeding up under gravity), leaves the corner where a real ball would
   *           (never before ~35 degrees), then falls under gravity with the sideways speed it had, fading out as it falls.
   * Viewport coordinates, y down. Pure function: at(ms) gives the position, the rotation, the opacity and whether the ball still touches. */
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

    // rolling friction only: a constant slow-down, x = start + span (1 - (1 - u)^2); the spin matches the distance (no sliding)
    function rollShare(ms) {
      const u = clamp(ms / duration, 0, 1);

      return 1 - (1 - u) * (1 - u);
    }

    function rollX(ms) {
      return mix(startX, endX, rollShare(ms));
    }

    function rotationFor(distance) {
      return dir * (distance / circumference) * 360;
    }

    // the moment the ball's centre crosses a given x on the roll (inverse of rollShare)
    function timeAtX(x) {
      const share = clamp((x - startX) / (Math.abs(span) > 1e-6 ? span : 1), 0, 1);

      return (1 - Math.sqrt(1 - share)) * duration;
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

    const gravity = options.gravity; // px/s^2
    const cornerR = Math.max(0, support.cornerRadius || 0);
    const R = radius + cornerR; // the ball's centre circles the corner's centre at this distance
    const top = y + radius; // the surface the ball rolls on
    let flatEndX = support.edgeX - dir * cornerR; // where the contact point reaches the start of the rounded corner

    if ((flatEndX - startX) * dir < 0) {
      flatEndX = startX; // already at the corner
    }

    const flatMs = timeAtX(flatEndX);
    const flatRaw = clamp(flatMs / duration, 0, 1);
    const entrySpeed = Math.max((Math.abs(span) * 2 * (1 - flatRaw)) / (duration / 1000), 40); // px/s at the corner (it keeps it into the fall)
    const corner = { x: flatEndX, y: top + cornerR };
    const ratio = (entrySpeed * entrySpeed) / (gravity * R);
    const leaveAngle = clamp(Math.acos(clamp((ratio + 2) / 3, -1, 1)), ROLL_TIP_MIN_ANGLE, ROLL_TIP_MAX_ANGLE);
    const arcAngles = [0]; // corner angle per ms of the tip
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

    // stop once it has faded out or left the bottom of the screen, whichever comes first
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

  /* where a landing picture is attached: "left" when it reaches the left screen edge, "right" when it reaches the right one, else the
   * section's usual side. The ball lands near the end away from that edge and rolls towards it. */
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

  /* a layout may say which way the ball should roll off a picture (data-ball-roll="left" | "right" on the picture or an ancestor; e.g. a
   * sheet of frames rolls right along its top row): that wins; otherwise the edge the picture is attached to */
  function landingSide(element, fallback) {
    const hinted = element && element.closest ? element.closest("[data-ball-roll]") : null;
    const hint = hinted ? hinted.getAttribute("data-ball-roll") : "";

    return hint === "left" || hint === "right" ? hint : attachedSide(element, fallback);
  }

  /* pictures of the same kind that sit flush against each other at the same height (a sheet's top row) make one continuous surface */
  function withSurface(platform, selector) {
    platform.surfaceSelector = selector;
    return platform;
  }

  /* the far end of the surface the ball rolls on, in the roll direction: the landing element, extended across neighbours of the same kind
   * whose top edge is level with it (within 3 px: a neighbour may still be settling from a bounce) and that start within 4 px of where it
   * ends (a seam that narrow is nothing to a ball ~40 px across) */
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
      // never let a listener break the trip
    }
  }

  /* ------------------------------------------------------------------ trajectory debug overlay (off unless asked for) */

  function fallMode() {
    try {
      const params = new URLSearchParams(window.location.search);
      const wanted = params.get("fall");
      const legacy = params.get("navcam");

      if (wanted === "a" || wanted === "b" || wanted === "c" || wanted === "d") {
        return wanted;
      }

      if (legacy === "screen" || legacy === "page") {
        return legacy === "screen" ? "a" : "b";
      }
    } catch (error) {
      // no URLSearchParams: the default
    }

    return NAV_BALL_FALL;
  }

  function fallSeconds(distance) {
    return clamp(FALL_SECONDS_BASE + distance / FALL_PX_PER_SECOND, FALL_SECONDS_MIN, FALL_SECONDS_MAX);
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

    /* squash and stretch. The ball is scaled along an angle (rotate, scale, rotate back), so the highlight never turns.
     *   on a surface: squashed in proportion to the speed it hit with (or, before a launch, a share of the launch speed), the bottom staying
     *   on the surface; in the air: stretched along its direction of travel when it moves fast, round when slow (near the top). */
    function setBallShape(along, across, angleDeg, liftPx) {
      ball.style.setProperty("--ball-scale-x", along.toFixed(4));
      ball.style.setProperty("--ball-scale-y", across.toFixed(4));
      ball.style.setProperty("--ball-stretch-angle", angleDeg.toFixed(2) + "deg");
      ball.style.setProperty("--ball-lift", liftPx.toFixed(2) + "px");
    }

    function squashAmount(impactSpeed, launchSpeed) {
      return SQUASH_MAX * clamp(Math.max(impactSpeed || 0, ANTICIPATION_SHARE * (launchSpeed || 0)) / SQUASH_SPEED_FULL, 0, 1);
    }

    // share u (0 - 1) of a contact: squash in and back out
    function applyContactShape(u, amount) {
      const k = Math.sin(Math.PI * clamp(u, 0, 1));
      const short = 1 - amount * k;

      setBallShape(1 + SQUASH_WIDEN * amount * k, short, 0, ballRadius() * (1 - short)); // x wider, y shorter, bottom on the surface
    }

    function applyAirShape(vx, vy) {
      const speed = Math.hypot(vx, vy);
      const s = STRETCH_MAX * clamp((speed - STRETCH_FROM) / (STRETCH_FULL - STRETCH_FROM), 0, 1);

      if (s <= 1e-4) {
        setBallShape(1, 1, 0, 0);
        return;
      }

      setBallShape(1 + s, 1 / Math.sqrt(1 + s), (Math.atan2(vy, vx) * 180) / Math.PI, 0); // along the velocity: longer; across it: thinner
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
      ball.style.setProperty("--ball-stretch-angle", "0deg");
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
      ball.style.setProperty("--ball-stretch-angle", "0deg");
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
      const duration = reducedMotion.matches ? 1 : staged ? PHONE_MENU_SPOKE_DURATION : 460;

      ["about", "work", "archive", "contact"].forEach(function (label, index) {
        const maskParts = spokeMasks[label];

        if (!maskParts) {
          return;
        }

        maskParts.drawLine.style.transition = "stroke-dashoffset " + duration + "ms " + (staged ? PHONE_MENU_SPOKE_EASE : "cubic-bezier(0.22, 1, 0.36, 1)");
        maskParts.drawLine.style.transitionDelay = reducedMotion.matches ? "0ms" : staged ? index * PHONE_MENU_SPOKE_STAGGER + "ms" : 380 + index * 38 + "ms"; // just after the ring (--nav-draw)
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

        /* each spoke points from the middle of the plus to the middle of its circle, and runs only across the paper between them, with
           the same small gap at both ends (they used to start together at the top of the disc, where their first dots ran into one blot,
           and ran on under the circles). offsetWidth: the circle's size without the scale of its pop-in. */
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

      /* closing: circles that are already showing fade out where they are (.is-menu-closing, styles/motion.css) instead of vanishing at once;
         circles that have not popped in yet (a quick pass of the pointer) are not brought back just to fade */
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
     * about a third of the way across, with the page at the very top; it then rolls away to the left along that floor. Falls back to the band's ground proportion (700 / 780). */
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
        // the first tile's picture (a tile may carry a caption beside or under it; the ball lands on the picture), else the tile
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
      return Math.max(ballRadius() + 44, bounds && Number.isFinite(bounds.minY) ? bounds.minY : 0); // the ball's top edge stays at least ~44 px below the top of the screen
    }

    /* how far below the top of the screen the ball's top edge stays during the flight */
    function flightTopClearance(isPhone) {
      const fade = document.querySelector(".viewport-edge-blur-top");
      const fadeHeight = fade ? fade.offsetHeight : 0;

      return Math.max(clamp(window.innerHeight * FLIGHT_TOP_CLEAR_SHARE, isPhone ? FLIGHT_TOP_CLEAR_MIN_PHONE : FLIGHT_TOP_CLEAR_MIN, FLIGHT_TOP_CLEAR_MAX), Math.min(fadeHeight, FLIGHT_TOP_CLEAR_MAX));
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
      // ... and low enough under the top of the flight for the arc's top and a calm straight drop
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
      // one gravity for everything in this trip (phones: calmer, like their bounces)
      const gravity = FLIGHT_GRAVITY / motionScale();
      const contactMs = scaleMotionDuration(CONTACT_MS);
      const launchContactMs = scaleMotionDuration(LAUNCH_CONTACT_MS);
      const airMsFor = function (height) {
        return 1000 * Math.sqrt((8 * Math.max(height, 0)) / gravity); // up and down again under gravity
      };
      const speedFor = function (height) {
        return Math.sqrt(2 * gravity * Math.max(height, 0)); // leaves / hits the surface with this
      };
      // prep bounces pump up (z/4, z/2, 3z/4); each is a contact (squash) and then a real bounce of that height
      const prepHeights = [z / 4, z / 2, (3 * z) / 4];
      const prepAirMs = prepHeights.map(airMsFor);
      const prepDurations = prepAirMs.map(function (air) {
        return contactMs + air;
      });
      // landing bounces lose energy: set from the impact once the path is known (buildMainPath)
      let landingHeights = [(3 * z) / 4, (3 * z) / 4 * RESTITUTION * RESTITUTION, (3 * z) / 4 * Math.pow(RESTITUTION, 4)];
      let landingAirMs = landingHeights.map(airMsFor);
      let landingDurations = landingAirMs.map(function (air) {
        return contactMs + air;
      });
      let landingImpacts = [0, 0, 0];
      const rollDuration = scaleMotionDuration(NAV_BALL_ROLL_DURATION);
      let rollDirection = rollDirectionFor(targetId); // set from the landing element's side once it is measured (buildMainPath)
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
      let roll = null; // planRollAway result, made when the roll starts
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

      /* archive (laptop / tablet): not out on the bar's free left end, but a short hop to the right of the take-off point, still on the first
       * bar's top edge and well clear of its rounded corner, so the flight only ever moves right before its straight drop. If the bar
       * cannot be reached that way, the usual landing point stays. */
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

      /* after prep bounce 3: compute the final scroll target, the final visible landing point F and the one continuous path */
      function buildMainPath() {
        endPoint = targetPlatformFor(targetId);
        scrollTarget = resolveScrollTarget(endPoint, targetId, bounds);
        F = resolveFinalLandingPoint(endPoint, scrollTarget, targetId, bounds);

        if (isPhone) {
          F = { x: A0.x, y: F.y }; // phone: the ball never moves sideways before the roll-away
        } else if (targetId === "archive") {
          F = { x: archiveLandingX(F.x), y: F.y };
        }

        const safeTop = radius + flightTopClearance(isPhone); // the ball's centre never goes above this

        const upward = scrollTarget < scrollStart - 1; // the destination is above: scroll during the rise, not the fall

        path = isPhone ?
          planPhoneBounce(A0, F, z, safeTop, upward, gravity, scrollTarget - scrollStart, fallMode()) :
          planBezierPath(A0, F, z, safeTop, scrollTarget - scrollStart, upward, gravity, fallMode());
        mainMs = Math.max(1, launchContactMs + path.duration * 1000); // the anticipation squash at A, then the flight

        // the landing bounces: the first rises to what the impact gives back (restitution^2 x the fall), within LAND_FIRST_* x z; each next
        // one to restitution^2 (~0.3) of the one before
        const firstHeight = clamp((RESTITUTION * RESTITUTION * path.impactSpeed * path.impactSpeed) / (2 * gravity), LAND_FIRST_MIN * z, LAND_FIRST_MAX * z);

        landingHeights = [firstHeight, firstHeight * RESTITUTION * RESTITUTION, firstHeight * Math.pow(RESTITUTION, 4)];
        landingAirMs = landingHeights.map(airMsFor);
        landingDurations = landingAirMs.map(function (air) {
          return contactMs + air;
        });
        landingImpacts = [path.impactSpeed, speedFor(landingHeights[0]), speedFor(landingHeights[1])];
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

      /* "navball:contact" at the touchdown (index 0, strength 1) and at the end of each landing bounce (index 1 - 3, strength = the height of
       * the bounce that just ended relative to the touchdown: 3/4, 1/2, 1/4), for layouts that react to the ball (a picture flexing, a reveal) */
      function emitContact(index) {
        emitBallEvent("navball:contact", {
          element: endPoint ? endPoint.element : null,
          x: F ? F.x : A0.x,
          strength: [1, 0.75, 0.5, 0.25][index] || 0,
          index: index,
          section: targetId
        });
      }

      /* the surface ends before the screen edge in the roll direction (a picture that is not attached to that edge): the ball must tip over
       * its end and fall instead of rolling on air. Measured now: the page is frozen at scrollTarget, so this is the rectangle the ball sees. */
      function rollSupport() {
        if (!endPoint || endPoint.kind !== "platform" || !endPoint.element) {
          return null; // the contact floor and the landing floor run across the whole screen
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
            gravity: gravity, // the same gravity as the flight and the bounces
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

      /* one bounce at base: a contact (squashed by the speed it hit with, or before a launch by a share of the launch speed), then a real
       * bounce of the given height under gravity, stretched by its own vertical speed */
      function renderBounce(base, elapsed, height, airMs, impactSpeed, launchSpeed) {
        if (elapsed < contactMs) {
          setBallPosition(base.x, base.y);
          applyContactShape(elapsed / contactMs, squashAmount(impactSpeed, launchSpeed));
          return;
        }

        const p = clamp((elapsed - contactMs) / Math.max(airMs, 1), 0, 1);
        const point = bouncePoint(base, height, p);

        setBallPosition(point.x, point.y);
        applyAirShape(0, -launchSpeed * (1 - 2 * p));
      }

      function renderPhase(name, elapsed, now) {
        let raw;
        let point;

        switch (name) {
          case PHASE.PREP1:
          case PHASE.PREP2:
          case PHASE.PREP3: {
            const index = name === PHASE.PREP1 ? 0 : name === PHASE.PREP2 ? 1 : 2;

            freezeScrollAt(scrollStart, "scrollMovedDuringPrep");
            renderBounce(A0, elapsed, prepHeights[index], prepAirMs[index], index > 0 ? speedFor(prepHeights[index - 1]) : 0, speedFor(prepHeights[index]));
            setTimelineShadow(0, 0.72);
            break;
          }

          case PHASE.MAIN: {
            if (elapsed < launchContactMs) {
              // anticipation: the ball sits on A and squashes before the big launch (the page has not moved yet)
              setBallPosition(A0.x, A0.y);
              applyContactShape(elapsed / launchContactMs, squashAmount(speedFor(prepHeights[2]), path.launchSpeed));
              setTimelineShadow(0, 0.72);
              break;
            }

            const flightSeconds = Math.min((elapsed - launchContactMs) / 1000, path.duration);
            const progress = path.progressAt(flightSeconds);
            const scrollProgress = path.scrollProgressAt(flightSeconds);

            point = path.pointAt(flightSeconds);
            debugInfo.lastPathProgress = progress;
            debugInfo.lastScrollProgress = scrollProgress;
            scrollInstantly(mix(scrollStart, scrollTarget, scrollProgress));
            setBallPosition(point.x, point.y);

            // stretched along its real direction of travel (in the page, for the page camera) when it moves fast, round when slow
            const dt = 1 / 240;
            const t0 = Math.max(0, Math.min(flightSeconds - dt, path.duration - 2 * dt));
            const before = path.worldAt(t0);
            const after = path.worldAt(t0 + 2 * dt);

            applyAirShape((after.x - before.x) / (2 * dt), (after.y - before.y) / (2 * dt));
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

            freezeScrollAt(scrollTarget, "scrollMovedDuringLanding");
            renderBounce(F, elapsed, landingHeights[index], landingAirMs[index], landingImpacts[index], speedFor(landingHeights[index]));

            if (endPoint.kind === "floor") {
              setTimelineShadow(0, 0.72);
            } else {
              // the shadow hangs under the ball, so it only shows while the ball touches the platform (it would float in the air otherwise)
              const q = elapsed < contactMs ? 0 : clamp((elapsed - contactMs) / landingAirMs[index], 0, 1);
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

            if (elapsed < contactMs && state.touching) {
              applyContactShape(elapsed / contactMs, squashAmount(speedFor(landingHeights[2]), 0)); // the last, small touchdown
            } else {
              setBallShape(1, 1, 0, 0);
            }

            if (roll.mode === "fall") {
              ball.style.opacity = String(state.opacity);
            }

            if (!leaveSent && elapsed >= roll.leaveMs) {
              leaveSent = true;
              emitBallEvent("navball:leave", { element: endPoint.element, section: targetId, mode: roll.mode });
            }

            if (endPoint.kind !== "platform" || !state.onTop) {
              setTimelineShadow(0, 0.72); // no shadow on the floors, on the corner or in the fall
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
      ball.style.setProperty("--ball-stretch-angle", "0deg");
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

    /* a click or tap outside the open menu closes it. On a touch screen the open menu's layer covers the window (styles/motion.css), so a
       tap on that layer itself (not on a circle or the plus) counts as outside too: it used to be swallowed, and the menu stayed open */
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
