/*
  "an apple", the drawing that opens About (window.HariniApple, loaded lazily by initAboutApple in scripts/main.js).
  The visitor pictures an apple and answers clearly, sort of or not really: a whole apple that turns and can be spun, a loose
  contour that keeps half-fading, or only the word with an outline that never closes. The apple is a surface of revolution
  drawn in hairlines, so it needs no images.  HariniApple.mount(host) -> handle; HariniApple.unmount(handle).
*/
(function () {
  "use strict";

  if (window.HariniApple) {
    return;
  }

  var PI = Math.PI, TAU = PI * 2, N = 120, TILT = 0.4, ROLL = -0.09, KEY = "harini-play-apple-answer";
  var LIGHT = [-0.55, 0.62, 0.56]; /* from the upper left and in front, already of unit length */

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function hash(a, b) {
    var s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  /* The profile: a circle pushed out at the shoulders and narrowed to the base, with a deep dip at the top pole (the stem's
     dimple) and a shallow one at the bottom; r / y run from the top pole (0) to the bottom one (N), nr / ny is the normal.
     Seen from a little above, nothing below the lowest point can show, so the bottom dimple is never drawn. */
  var P = { r: [], y: [], nr: [], ny: [], top: 0, last: 0 };

  (function () {
    var i, f, c, rho, a, b, l;

    for (i = 0; i <= N; i += 1) {
      f = (i / N) * PI;
      c = Math.cos(f);
      rho = 1 + 0.11 * c - 0.5 * Math.exp(-Math.pow(f / 0.37, 2)) - 0.2 * Math.exp(-Math.pow((PI - f) / 0.36, 2));
      P.r.push(0.96 * rho * Math.sin(f) * (1 - 0.2 * Math.pow(Math.max(0, -c), 1.2)));
      P.y.push(rho * c);
    }

    for (i = 0; i <= N; i += 1) {
      a = Math.max(0, i - 1);
      b = Math.min(N, i + 1);
      l = Math.hypot(P.r[b] - P.r[a], P.y[b] - P.y[a]);
      P.nr.push((P.y[a] - P.y[b]) / l);
      P.ny.push((P.r[b] - P.r[a]) / l);
      P.top = P.y[i] > P.y[P.top] ? i : P.top;
      P.last = P.y[i] < P.y[P.last] ? i : P.last;
    }
  })();

  /* hairline segments sorted into a few opacity steps, so a drawing is a handful of strokes instead of one per segment */
  function buckets(n) {
    var list = [];

    while (list.length < n) {
      list.push([]);
    }

    return {
      add: function (a, x1, y1, x2, y2) {
        if (a > 0.02) {
          list[Math.min(n - 1, Math.floor(a * n))].push(x1, y1, x2, y2);
        }
      },
      flush: function (ctx, base) {
        list.forEach(function (s, b) {
          ctx.globalAlpha = base * ((b + 1) / n);
          ctx.beginPath();
          for (var j = 0; j < s.length; j += 4) {
            ctx.moveTo(s[j], s[j + 1]);
            ctx.lineTo(s[j + 2], s[j + 3]);
          }
          ctx.stroke();
        });
      }
    };
  }

  /* The apple turns by A about its axis, is tipped towards the visitor by T (so the dimple shows) and leans a touch, so it
     stands like a thing on a table and not like a globe on its stand. */
  function view(w, h, A, T, cyK) {
    return { S: Math.min(w, h) * 0.3, cx: w / 2, cy: h * cyK, A: A, ca: Math.cos(A), sa: Math.sin(A), ct: Math.cos(T), st: Math.sin(T) };
  }

  /* a turned point (X across, Y up) to the screen, carrying z along */
  function scr(v, X, Y, z) {
    var c = Math.cos(ROLL), s = Math.sin(ROLL);
    return [v.cx + (X * c - Y * s) * v.S, v.cy - (X * s + Y * c) * v.S, z];
  }

  function proj(v, p) {
    var X = p[0] * v.ca - p[2] * v.sa, Z = p[0] * v.sa + p[2] * v.ca;
    return scr(v, X, p[1] * v.ct - Z * v.st, p[1] * v.st + Z * v.ct);
  }

  /* profile sample i at angle th; z is the normal's part towards the visitor (above zero, it faces us) */
  function surf(v, i, th) {
    var c = Math.cos(th + v.A), s = Math.sin(th + v.A);
    return scr(v, P.r[i] * c, P.y[i] * v.ct - P.r[i] * s * v.st, P.ny[i] * v.st + P.nr[i] * s * v.ct);
  }

  function meridian(v, th, i0, i1) {
    var pts = [];
    for (var i = i0; i <= i1; i += 1) {
      pts.push(surf(v, i, th));
    }
    return pts;
  }

  function ring(v, i, th0, th1, n) {
    var pts = [];
    for (var k = 0; k <= n; k += 1) {
      pts.push(surf(v, i, th0 + ((th1 - th0) * k) / n));
    }
    return pts;
  }

  /* The silhouette of a surface of revolution depends only on the tip, not the turn: on each ring it sits where the normal is
     side-on, sin(th) = -ny tan(T) / nr. Each run of rings with a solution is a closed outline whose ends (where its two sides
     meet) are found by bisection; the widest is the outer outline, the others are lips inside the dimple and are left out. */
  function silAt(v, fi) {
    var i = Math.min(N - 1, Math.floor(fi)), t = fi - i;
    var nr = P.nr[i] + (P.nr[i + 1] - P.nr[i]) * t, ny = P.ny[i] + (P.ny[i + 1] - P.ny[i]) * t;
    return { r: P.r[i] + (P.r[i + 1] - P.r[i]) * t, y: P.y[i] + (P.y[i + 1] - P.y[i]) * t, s: Math.abs(nr) < 1e-6 ? 9 : (-ny * v.st) / (nr * v.ct) };
  }

  function outline(v) {
    var runs = [], R = null, L = null, fi, q, k, m;

    function push(q) {
      var s = clamp(q.s, -1, 1), X = q.r * Math.sqrt(1 - s * s), Y = q.y * v.ct - q.r * s * v.st;
      R.push(scr(v, X, Y, 1));
      L.push(scr(v, -X, Y, 1));
    }

    function joint(a, b) {
      for (k = 0; k < 14; k += 1) {
        m = (a + b) / 2;
        if (Math.abs(silAt(v, m).s) <= 1) { a = m; } else { b = m; }
      }
      push(silAt(v, a));
    }

    for (fi = 0; fi <= P.last + 0.25; fi += 0.25) {
      q = silAt(v, Math.min(fi, P.last));
      if (fi <= P.last && Math.abs(q.s) <= 1) {
        if (!R) {
          R = [];
          L = [];
          if (fi > 0) { joint(fi, fi - 0.25); }
        }
        push(q);
      } else if (R) {
        if (fi <= P.last) { joint(fi - 0.25, fi); }
        runs.push(L.reverse().concat(R));
        R = null;
      }
    }

    return runs.reduce(function (best, run) {
      return bounds(run).rx > bounds(best).rx ? run : best;
    });
  }

  function bounds(pts) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) {
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    });
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2, bottom: y1 };
  }

  function trace(ctx, pts) {
    ctx.beginPath();
    pts.forEach(function (p, k) {
      ctx[k ? "lineTo" : "moveTo"](p[0], p[1]);
    });
    ctx.closePath();
  }

  /* Light from the upper left, read from the ellipse around the outline (a sphere's normals): close enough to decide where a
     few strokes go, and the strokes themselves are clipped by the true outline. */
  function shade(box, x, y) {
    var u = (x - box.cx) / box.rx, w = (y - box.cy) / box.ry, d = Math.max(1, Math.hypot(u, w));
    u /= d;
    w /= d;
    return u * LIGHT[0] - w * LIGHT[1] + Math.sqrt(Math.max(0, 1 - u * u - w * w)) * LIGHT[2];
  }

  /* the visible segments of a contour (back-facing ones are culled), thinning away as the surface turns side-on */
  function contour(B, pts, base, fn) {
    for (var k = 0, a; k < pts.length - 1; k += 1) {
      a = Math.min(pts[k][2], pts[k + 1][2]);
      if (a > 0) {
        B.add(base * clamp(a / 0.3, 0, 1) * fn(k / (pts.length - 1), pts[k][0], pts[k][1]), pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1]);
      }
    }
  }

  function hatch(B, box, angle, gap, limit, alpha, seed) {
    var dx = Math.cos(angle), dy = Math.sin(angle), R = Math.hypot(box.rx, box.ry), o, t, x, y, on, sx, sy, lim;

    for (o = -R; o <= R; o += gap) {
      on = false;
      lim = limit + (hash(o, seed) - 0.5) * 0.05;
      for (t = -R; t <= R + 2; t += 1.5) {
        x = box.cx - dy * o + dx * t;
        y = box.cy + dx * o + dy * t;
        if (t <= R && shade(box, x, y) < lim) {
          if (!on) {
            on = true;
            sx = x;
            sy = y;
          }
        } else if (on) {
          on = false;
          B.add(alpha, sx, sy, x, y);
        }
      }
    }
  }

  function add(o, list) {
    var p = o.slice();
    list.forEach(function (pair) {
      for (var j = 0; j < 3; j += 1) {
        p[j] += pair[0][j] * pair[1];
      }
    });
    return p;
  }

  function stemAt(t) {
    return [0.1 * t * t, P.y[0] + 0.02 + 0.55 * t, -0.03 * t];
  }

  /* The stem rises out of the dimple and bends; the leaf grows from it, curls along its length and droops at the tip. Both are
     filled with paper first, so the contours behind them stop at their edges. */
  function stemLeaf(ctx, v, c, lw, alpha) {
    var stem = [], edge = [], rim = [], leaf = [], leafZ = 0, k, a, b, hw;

    for (k = 0; k <= 8; k += 1) {
      stem.push(proj(v, stemAt(k / 8)));
    }

    for (k = 0; k <= 8; k += 1) {
      a = stem[Math.max(0, k - 1)];
      b = stem[Math.min(8, k + 1)];
      hw = ((0.042 - 0.014 * (k / 8)) * v.S) / Math.hypot(b[0] - a[0], b[1] - a[1]);
      edge.splice(k, 0, [stem[k][0] + (a[1] - b[1]) * hw, stem[k][1] + (b[0] - a[0]) * hw], [stem[k][0] - (a[1] - b[1]) * hw, stem[k][1] - (b[0] - a[0]) * hw]);
    }

    /* whatever part of the stem is below the near rim of the dimple is hidden behind the apple */
    for (k = 0; k <= 16; k += 1) {
      a = (k / 16) * PI;
      rim.push(scr(v, P.r[P.top] * Math.cos(a), P.y[P.top] * v.ct - P.r[P.top] * Math.sin(a) * v.st));
    }
    rim.push([rim[16][0], -99], [rim[0][0], -99]);

    /* the leaf: a base on the stem, a direction d, a sideways axis rolled about it, and the leaf's own normal */
    var base = stemAt(0.5), d = [0.907, 0.315, -0.28];
    var side = add([0, 0, 0], [[[0.295, 0, 0.955], Math.cos(0.7)], [[-0.3, 0.949, 0.093], Math.sin(0.7)]]);
    var nrm = [side[1] * d[2] - side[2] * d[1], side[2] * d[0] - side[0] * d[2], side[0] * d[1] - side[1] * d[0]];

    function leafAt(u, w) {
      var width = 0.3 * Math.pow(Math.sin(PI * Math.pow(u, 0.7)), 0.85);
      return proj(v, add(base, [[d, 0.06 + u * 0.92], [side, w * width], [nrm, 0.25 * w * w * width], [[0, -1, 0], 0.3 * u * u]]));
    }

    for (k = 0; k <= 40; k += 1) {
      leaf.push(leafAt(k <= 20 ? k / 20 : (40 - k) / 20, k <= 20 ? 1 : -1));
      leafZ += leaf[k][2] / 41;
    }

    function fillStroke(pts) {
      trace(ctx, pts);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c.paper;
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.stroke();
    }

    function paintStem() {
      ctx.save();
      trace(ctx, rim);
      ctx.clip();
      fillStroke(edge);
      ctx.restore();
    }

    function paintLeaf() {
      var B = buckets(3);

      fillStroke(leaf);
      a = proj(v, base);
      for (k = 0; k <= 12; k += 1) {
        b = leafAt((k / 12) * 0.95, 0);
        B.add(0.9, a[0], a[1], b[0], b[1]);
        a = b;
      }
      for (k = 0; k < 10; k += 1) {
        a = leafAt(0.13 + (k >> 1) * 0.15, 0);
        b = leafAt(0.27 + (k >> 1) * 0.15, k % 2 ? 0.8 : -0.8);
        B.add(0.55, a[0], a[1], b[0], b[1]);
      }
      B.flush(ctx, alpha);
    }

    ctx.strokeStyle = c.ink;
    if (leafZ < stem[4][2]) {
      paintLeaf();
      paintStem();
    } else {
      paintStem();
      paintLeaf();
    }
  }

  /* clearly: the whole apple, with contours, outline, hatching on the shaded side and a small shadow on the table */
  function drawClear(ctx, v, c, lw, alpha) {
    var outer = outline(v), box = bounds(outer), gap = Math.max(3, v.S * 0.042), B = buckets(3), k, y, half;

    ctx.strokeStyle = c.ink;
    ctx.lineWidth = lw;
    for (k = 0; k < 5; k += 1) {
      y = box.bottom - gap * 0.4 + k * gap * 0.7;
      half = box.rx * (0.85 - k * 0.12);
      B.add(0.75 - k * 0.12, box.cx - box.rx * (0.15 - hash(k, 3) * 0.2) - half * 0.2, y, box.cx + box.rx * 0.25 + half, y);
    }
    B.flush(ctx, alpha * 0.6);
    trace(ctx, outer);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.paper;
    ctx.fill();

    /* the contours break up where the light is strongest, so the apple reads as lit and not as a wire globe */
    function lit(u, x, y) {
      return 1 - 0.85 * clamp((shade(box, x, y) - 0.7) / 0.22, 0, 1);
    }

    B = buckets(4);
    for (k = 0; k < 12; k += 1) {
      contour(B, meridian(v, (k / 12) * TAU, 7, P.last), 0.42, lit);
    }
    [0.16, 0.6, 0.95, 1.3, 1.65, 2.0, 2.35].forEach(function (f) {
      contour(B, ring(v, Math.round((f / PI) * N), 0, TAU, 120), 0.38, lit);
    });
    B.flush(ctx, alpha);

    ctx.save();
    trace(ctx, outer);
    ctx.clip();
    B = buckets(2);
    hatch(B, box, -0.86, gap, 0.16, 0.95, 1);
    hatch(B, box, 0.5, gap * 1.1, -0.18, 0.7, 2);
    B.flush(ctx, alpha * 0.5);
    ctx.restore();

    ctx.globalAlpha = alpha;
    ctx.lineWidth = lw * 1.2;
    trace(ctx, outer);
    ctx.stroke();
    stemLeaf(ctx, v, c, lw, alpha);
  }

  /* sort of: a few loose contours and the stem, drawing themselves and then half-fading, like an image only half held */
  function drawSort(ctx, v, c, lw, t) {
    var B = buckets(6), runs = [{ pts: outline(v), seed: 0.2, delay: 0 }], stem = [], k;

    for (k = 0; k < 4; k += 1) {
      runs.push({ pts: meridian(v, 0.5 + k * 1.37, P.top - 3, Math.round(P.last * (0.7 + 0.08 * k))), seed: 1 + k, delay: 0.5 + k * 0.25 });
    }
    [0.06, 0.4, 0.6].forEach(function (f, k) {
      runs.push({ pts: ring(v, Math.round(N * f), k * 2, k * 2 + 3.4, 60), seed: 6 + k, delay: 0.8 + k * 0.3 });
    });
    for (k = 0; k <= 6; k += 1) {
      stem.push(proj(v, stemAt(k / 6)));
    }
    runs.push({ pts: stem, seed: 9, delay: 1.3 });

    runs.forEach(function (run) {
      var reveal = clamp((t - run.delay) / 1.6, 0, 1), breathe = 0.55 + 0.45 * Math.sin(t * 0.45 + run.seed * 2.1);

      run.pts.forEach(function (p) {
        var x = p[0];
        p[0] += 1.3 * Math.sin(p[1] * 0.05 + t * 0.5 + run.seed);
        p[1] += 1.3 * Math.sin(x * 0.045 - t * 0.4 + run.seed);
      });
      contour(B, run.pts, 0.95, function (u) {
        return u > reveal ? 0 : breathe * clamp(0.5 + 0.8 * Math.sin(u * 7 + run.seed * 5 - t * 0.7), 0.08, 1);
      });
    });
    ctx.lineWidth = lw;
    ctx.strokeStyle = c.ink;
    B.flush(ctx, 0.7);
  }

  /* not really: only the word, and a dotted outline whose two ends chase each other round and never meet */
  function drawNot(ctx, v, c, t, dpr) {
    var pts = [], len = [0], B = [[], [], []], step = Math.max(5, v.S * 0.075), start = (t * 0.022) % 1, dot = Math.max(0.75, 1 / dpr);
    var i, k, at, rel, fade, f, total;

    for (i = -N; i <= N; i += 1) {
      pts.push(scr(v, (i < 0 ? -1 : 1) * P.r[Math.abs(i)], P.y[Math.abs(i)] - 0.05));
      if (i > -N) {
        len.push(len[len.length - 1] + Math.hypot(pts[i + N][0] - pts[i + N - 1][0], pts[i + N][1] - pts[i + N - 1][1]));
      }
    }

    total = len[len.length - 1];
    i = 1;
    for (k = 0; k * step < total; k += 1) {
      at = k * step;
      rel = (at / total - start + 1) % 1;
      fade = Math.min(1, rel / 0.12, (0.8 - rel) / 0.12);
      while (len[i] < at) {
        i += 1;
      }
      if (fade > 0) {
        f = (at - len[i - 1]) / (len[i] - len[i - 1] || 1);
        B[Math.min(2, Math.floor(fade * 3))].push(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f);
      }
    }

    ctx.fillStyle = c.ink;
    B.forEach(function (list, b) {
      ctx.globalAlpha = 0.15 * (b + 1);
      ctx.beginPath();
      for (k = 0; k < list.length; k += 2) {
        ctx.moveTo(list[k] + dot, list[k + 1]);
        ctx.arc(list[k], list[k + 1], dot, 0, TAU);
      }
      ctx.fill();
    });
  }

  function mount(host) {
    var Ink = window.HariniInk;

    if (!Ink || !host) {
      return null;
    }

    var original = host.innerHTML, td = Ink.teardown(), mem = Ink.memory("apple"), reduced = Ink.reducedMotion;
    var mode = "ask", A = -0.25, T = TILT, w = 0, vT = 0, dir = 1, time = 0, prev = [A, T, 0];
    var drag = null, loop = null, queued = 0, stage = null, colors = Ink.theme(host);
    var box = Ink.el("div", "about-apple-stage"), foot = Ink.el("figcaption", "about-apple-foot");

    box.innerHTML = '<p class="about-apple-question">picture an apple.<br>can you see it?</p><span class="about-apple-word" aria-hidden="true">apple</span><p class="about-apple-aside" aria-live="polite">same here, says my brother.</p>';
    foot.innerHTML = '<div class="about-apple-choices play-buttons" role="group" aria-label="can you see it?">' +
      '<button class="play-button" type="button" data-answer="clearly">clearly</button><span class="about-apple-dot" aria-hidden="true">·</span>' +
      '<button class="play-button" type="button" data-answer="sort">sort of</button><span class="about-apple-dot" aria-hidden="true">·</span>' +
      '<button class="play-button" type="button" data-answer="not">not really</button></div>' +
      '<div class="about-apple-coda"><p class="play-line">most of my work starts from that difference.</p><button class="play-button" type="button" data-answer="ask">try again</button></div>';
    host.innerHTML = "";
    host.appendChild(box);
    host.appendChild(foot);

    var first = foot.querySelector("button"), again = foot.querySelector('[data-answer="ask"]');

    stage = Ink.stage(box, {
      onResize: function () {
        colors = Ink.theme(host);
        paint(1);
      }
    });

    function spins() {
      return mode === "clearly" || mode === "sort";
    }

    function paint(k) {
      if (!stage) {
        return;
      }

      var a = k === undefined ? 1 : k, tm = prev[2] + (time - prev[2]) * a, lw = Ink.hair(stage, 0.8), ctx = stage.ctx;
      var v = view(stage.w, stage.h, prev[0] + (A - prev[0]) * a, prev[1] + (T - prev[1]) * a, mode === "not" ? 0.5 : 0.56);

      stage.clear();
      if (mode === "clearly") {
        drawClear(ctx, v, colors, lw, clamp(tm / 0.9, 0, 1));
      } else if (mode === "sort") {
        drawSort(ctx, v, colors, lw, tm);
      } else if (mode === "not") {
        drawNot(ctx, v, colors, tm, stage.dpr);
      }
      ctx.globalAlpha = 1;
    }

    /* reduced motion: nothing moves by itself, the drawing is only redrawn when the visitor drags or presses a key */
    function repaint() {
      if (!queued) {
        queued = window.requestAnimationFrame(function () {
          queued = 0;
          prev = [A, T, time];
          paint(1);
        });
      }
    }

    /* one fixed step: a slow idle turn that a flick speeds up and that settles back, and a tip that springs back to rest */
    function step(dt) {
      prev = [A, T, time];
      time += dt;
      if (!drag) {
        w += ((mode === "clearly" ? 0.32 : 0.16) * dir - w) * (1 - Math.exp(-dt * 0.9));
        A += w * dt;
        vT += (-(T - TILT) * 16 - vT * 8) * dt;
        T += vT * dt;
      }
    }

    function choose(id, fresh) {
      if (loop) {
        loop.stop();
        loop = null;
      }

      mode = id;
      host.setAttribute("data-state", id);
      A = -0.25;
      T = TILT;
      vT = 0;
      dir = 1;
      w = id === "clearly" ? 0.32 : 0.16;
      /* a remembered answer (and any answer under reduced motion) starts finished, with the drawing already all there */
      time = fresh && !reduced ? 0 : 6;
      prev = [A, T, time];
      box[spins() ? "setAttribute" : "removeAttribute"]("tabindex", "0");
      box[id === "ask" ? "removeAttribute" : "setAttribute"]("role", "img");
      box.setAttribute("aria-label", spins() ? "an apple drawn in fine lines. drag it, or use the arrow keys, to spin it." : id === "not" ? "no apple, only the word, with an outline that never closes." : "");

      if (id === "ask") {
        box.removeAttribute("aria-label");
        stage.clear();
        if (fresh) {
          first.focus({ preventScroll: true });
        }
        return;
      }

      if (fresh) {
        mem.set();
        try {
          window.sessionStorage.setItem(KEY, id);
        } catch (error) {
          /* private mode: the answer is simply not remembered */
        }
        /* the clicked buttons are about to fade away, so focus moves on to what took their place */
        (spins() ? box : again).focus({ preventScroll: true });
      }

      if (reduced) {
        paint(1);
      } else {
        loop = Ink.loop(step, paint, box);
        loop.start();
      }
    }

    function onClick(e) {
      var b = e.target.closest("[data-answer]");
      if (b) {
        choose(b.getAttribute("data-answer"), true);
      }
    }

    function onKey(e) {
      var dx = { ArrowRight: 1, ArrowLeft: -1 }[e.key] || 0, dy = { ArrowDown: 1, ArrowUp: -1 }[e.key] || 0;

      if (e.target !== box || !spins() || (!dx && !dy)) {
        return;
      }

      e.preventDefault();
      if (reduced) {
        A += dx * 0.3;
        T = clamp(T + dy * 0.12, 0.08, 0.95);
        repaint();
      } else {
        w += dx * 1.6;
        vT += dy * 1.4;
        dir = dx || dir;
      }
    }

    td.add(Ink.pointer(stage.canvas, {
      down: function (x, y, e) {
        if (spins()) {
          drag = { x: x, y: y, t: e.timeStamp, v: 0 };
          host.classList.add("is-dragging");
        }
      },
      move: function (x, y, e, active) {
        if (drag && active) {
          var dA = ((x - drag.x) * 5.4) / stage.w;

          A += dA;
          T = clamp(T + ((y - drag.y) * 2.4) / stage.h, 0.08, 0.95);
          drag = { x: x, y: y, t: e.timeStamp, v: drag.v * 0.5 + (dA / (Math.max(4, e.timeStamp - drag.t) / 1000)) * 0.5 };
          if (reduced) {
            repaint();
          }
        }
      },
      up: function (x, y, e) {
        if (drag) {
          /* a flick keeps turning and slows back to the idle turn; a drag that stopped before letting go does not fling */
          w = reduced || e.timeStamp - drag.t > 90 ? 0 : clamp(drag.v, -10, 10);
          dir = Math.abs(w) > 0.05 ? Math.sign(w) : dir;
          drag = null;
          host.classList.remove("is-dragging");
        }
      }
    }));

    host.addEventListener("click", onClick);
    host.addEventListener("keydown", onKey);
    td.add(function () {
      host.removeEventListener("click", onClick);
      host.removeEventListener("keydown", onKey);
      if (loop) {
        loop.stop();
      }
      window.cancelAnimationFrame(queued);
      stage.destroy();
      stage = null;
      host.removeAttribute("data-state");
      host.classList.remove("is-dragging");
      host.innerHTML = original;
    });

    var remembered = null;

    try {
      remembered = window.sessionStorage.getItem(KEY);
    } catch (error) {
      /* without storage the kit's memory has no answer either, so the question is simply asked again */
    }

    choose(mem.done() ? (/^(clearly|sort|not)$/.test(remembered) ? remembered : "clearly") : "ask", false);
    return { teardown: td };
  }

  function unmount(handle) {
    if (handle && handle.teardown) {
      handle.teardown.run();
    }
  }

  window.HariniApple = { mount: mount, unmount: unmount };
})();
