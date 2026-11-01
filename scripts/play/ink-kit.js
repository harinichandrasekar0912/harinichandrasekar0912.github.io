/*
  Shared kit for the playable pieces (scripts/play/*.js): window.HariniInk.
  Everything here is small on purpose (the pieces load it first, lazily, when one of them is about to be seen).

    HariniInk.stage(host, opts)      a canvas that fills host, sized for the device pixel ratio and kept in step with host's size
                                     -> { canvas, ctx, w, h, dpr, resize(), clear(), destroy() }   (w / h in CSS px; ctx is in CSS px)
    HariniInk.theme(el)              { ink, paper, soft, line, dark } read from the CSS variables around el (the page or the dark project viewer)
    HariniInk.hair(stage, k)         the hairline width in CSS px (1-1.5 CSS px, never below 1 device px)
    HariniInk.pointer(el, handlers)  pointer + touch + pen in one stream: handlers.down / move / up (x, y in el's CSS px, event); returns a remover
    HariniInk.loop(step, draw, el)   fixed-step simulation (1/120 s) with interpolation; pauses while el is off screen or the tab is hidden
                                     -> { start(), stop(), running() }
    HariniInk.reducedMotion          true when the visitor asks for reduced motion
    HariniInk.physics                the site's gravity / restitution (window.HariniPhysics from navigation-ball.js, or the same numbers)
    HariniInk.memory(key)            { done(), set() }: a piece the visitor already finished this session starts finished (sessionStorage, never required)
    HariniInk.teardown()             { add(fn), run() }: collects the clean-up of a mounted piece
    HariniInk.el(tag, cls, text)     a small DOM helper for the buttons / lines the pieces use
*/
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
          /* capture is a nicety */
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

  /* fixed 1/120 s steps (the same look at 60, 90, 120 and 144 Hz); draw(alpha) gets the interpolation weight between the last two steps */
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

  /* the site's one physics (navigation-ball.js publishes it as window.HariniPhysics; the same numbers are kept here if it is not there) */
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
          /* private mode: the piece simply runs again next time */
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
