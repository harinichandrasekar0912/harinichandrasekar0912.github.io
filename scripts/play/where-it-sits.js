/*
  "where it sits": the Spatial Archive's ritual (project-02, before the panels). The prototype's landing field comes up, six
  fragments of its sample material drift in, and a fragment dropped near the one it belongs with is tied to it by a thread.
*/
(function () {
  "use strict";

  var NAME = "where-it-sits";
  var DIR = "assets/images/play/where-it-sits/";

  /* the one colour the piece adds: a muted warm red for the threads (exact colour to be confirmed by Harini from her sketches) */
  var WARM_THREAD = "#c4553f";

  /* DRAFT copy, used verbatim */
  var LINE = "place what belongs together.";

  var LINKS_TO_FINISH = 2;
  var IDLE_SECONDS = 10;
  var LONGEST = 24;
  var INVITING = 1.2;
  var INTRO_DIM = 0.3;

  /* r = height / width, k = width factor, wide / tall = start (x, y, depth); related fragments start apart */
  var FRAGMENTS = [
    { id: "photo", label: "render of the courtyard", cap: "render", r: 0.7, k: 1, wide: [0.13, 0.2, 0.15], tall: [0.18, 0.1, 0.2] },
    { id: "massing", label: "massing model", cap: "massing model", r: 0.475, k: 1.2, wide: [0.47, 0.1, 0.65], tall: [0.52, 0.36, 0.6] },
    { id: "note", label: "note: very few access points to the waterfront", cap: "note", text: "Very few access points to the waterfront", r: 0.755, k: 1, wide: [0.85, 0.24, 0.35], tall: [0.7, 0.06, 0.45] },
    { id: "sketch", label: "line drawing of the massing", cap: "drawing", r: 0.99, k: 0.85, wide: [0.25, 0.8, 0.45], tall: [0.84, 0.62, 0.4] },
    { id: "reference", label: "reference map of the waterfront", cap: "reference", r: 0.92, k: 0.85, wide: [0.58, 0.66, 0.1], tall: [0.12, 0.56, 0.15] },
    { id: "plan", label: "site plan", cap: "site plan", r: 0.705, k: 1, wide: [0.86, 0.82, 0.55], tall: [0.4, 0.9, 0.55] }
  ];

  /* what belongs together, either way round */
  var RELATIONS = [["photo", "plan"], ["sketch", "massing"], ["note", "reference"]];

  /* the field in world units: the camera looks along z */
  var FLOOR_Y = -1.6;
  var Z_NEAR = 2;
  var Z_FAR = 14;
  var PIVOT = 7;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function ease(t) {
    t = clamp(t, 0, 1);
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInOut(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function related(a, b) {
    return RELATIONS.some(function (p) {
      return (p[0] === a && p[1] === b) || (p[1] === a && p[0] === b);
    });
  }

  function src(id, imageUrl) {
    var path = DIR + id + ".webp";

    return imageUrl ? imageUrl(path) : path;
  }

  /* the gap between two cards' boxes (0 when they overlap) */
  function gap(a, b) {
    var gx = Math.max(0, Math.abs(a.tx - b.tx) - (a.w + b.w) / 2);
    var gy = Math.max(0, Math.abs(a.ty - b.ty) - (a.h + b.h) / 2);

    return Math.sqrt(gx * gx + gy * gy);
  }

  /* where the line from a card's centre towards (x, y) leaves its box */
  function edge(c, x, y) {
    var dx = x - c.rx;
    var dy = y - c.ry;
    var s = Math.min(1, 1 / Math.max(Math.abs(dx) / (c.rw / 2) || 0, Math.abs(dy) / (c.rh / 2) || 0, 1e-6));

    return { x: c.rx + dx * s, y: c.ry + dy * s };
  }

  /* each point has a scattered start (it gathers as the field forms) and a time to appear */
  function makeDots() {
    var dots = [];

    for (var x = -7; x <= 7; x += 1) {
      for (var y = 0; y < 6; y += 1) {
        for (var z = 0; z < 9; z += 1) {
          dots.push({
            x: x, y: -1.2 + y * 0.8, z: 3 + z * 1.25, at: 0.12 + Math.random() * 0.45, ph: Math.random() * 6.28,
            jx: (Math.random() - 0.5) * 3, jy: (Math.random() - 0.5) * 2.4, jz: (Math.random() - 0.5) * 3
          });
        }
      }
    }

    return dots;
  }

  function project(v, x, y, z, out) {
    var dz = z - PIVOT;
    var rz = dz * v.cos + x * v.sin + PIVOT;
    var k = v.F / rz;

    out.x = v.cx + (x * v.cos - dz * v.sin) * k;
    out.y = v.cy - y * k;
    out.z = rz;
  }

  var pa = { x: 0, y: 0, z: 0 };
  var pb = { x: 0, y: 0, z: 0 };

  function floorLine(c, v, x0, z0, x1, z1, alpha) {
    project(v, x0, FLOOR_Y, z0, pa);
    project(v, x1, FLOOR_Y, z1, pb);
    c.globalAlpha = alpha;
    c.beginPath();
    c.moveTo(pa.x, pa.y);
    c.lineTo(pb.x, pb.y);
    c.stroke();
  }

  /* the floor draws itself outwards and fades with distance; half a unit off centre, so no line runs into the close button */
  function drawFloor(c, v, reach, a) {
    var span = Z_FAR - Z_NEAR;
    var far = Z_NEAR + span * reach;

    for (var x = -7.5; x <= 7.5; x += 1) {
      for (var i = 0; i < 4; i += 1) {
        var z0 = Z_NEAR + (span * i) / 4;
        var z1 = Math.min(far, z0 + span / 4);

        if (z1 > z0) {
          floorLine(c, v, x, z0, x, z1, a * 0.13 * (1 - i / 4));
        }
      }
    }

    for (var z = Z_NEAR + 0.5; z <= far; z += 1) {
      floorLine(c, v, -7.5, z, 7.5, z, a * 0.12 * (1 - (z - Z_NEAR) / span));
    }
  }

  /* dots appear, gather, then breathe; those near the pointer brighten a little */
  function drawDots(c, v, dots, T, glow, a) {
    var form = easeInOut((T - 0.35) / 0.6);
    var sway = ease((T - 0.9) / 0.9);
    var r2 = v.stacked ? 8100 : 16900;

    for (var i = 0; i < dots.length; i += 1) {
      var p = dots[i];
      var shown = ease((T - p.at) / 0.3);
      var loose = 1 - form;

      if (shown <= 0) {
        continue;
      }

      project(v, p.x + p.jx * loose, p.y + p.jy * loose + 0.05 * sway * Math.sin(T * 0.6 + p.ph), p.z + p.jz * loose, pa);

      if (pa.z < 1) {
        continue;
      }

      var dx = pa.x - glow.x;
      var dy = pa.y - glow.y;
      var g = glow.on * Math.exp(-(dx * dx + dy * dy) / r2);
      var near = 1 - clamp((pa.z - 3) / 11, 0, 1);
      var size = clamp(7.5 / pa.z, 0.8, 2.6) * (1 + g * 0.9);

      c.globalAlpha = clamp(((0.16 + 0.5 * near) * shown + g * 0.6) * a, 0, 1);
      c.fillRect(pa.x - size / 2, pa.y - size / 2, size, size);
    }
  }

  /* a thread runs between the facing edges, pinned with small dots, sagging a little */
  function drawThread(c, a, b, t, alpha, hw) {
    var e1 = edge(a, b.rx, b.ry);
    var e2 = edge(b, a.rx, a.ry);
    var mx = (e1.x + e2.x) / 2;
    var my = (e1.y + e2.y) / 2 + 5;
    var u = 1 - t;

    c.globalAlpha = alpha;
    c.strokeStyle = WARM_THREAD;
    c.fillStyle = WARM_THREAD;
    c.lineWidth = hw;
    c.beginPath();
    c.moveTo(e1.x, e1.y);
    c.quadraticCurveTo(u * e1.x + t * mx, u * e1.y + t * my, u * u * e1.x + 2 * u * t * mx + t * t * e2.x, u * u * e1.y + 2 * u * t * my + t * t * e2.y);
    c.stroke();
    c.beginPath();
    c.arc(e1.x, e1.y, 2.2, 0, 6.2832);

    if (t > 0.98) {
      c.moveTo(e2.x + 2.2, e2.y);
      c.arc(e2.x, e2.y, 2.2, 0, 6.2832);
    }

    c.fill();
  }

  /* one run */
  function run(host, ctx, resolve, seen) {
    var Ink = window.HariniInk;
    var tear = Ink.teardown();
    var finished = false;
    var T = 0;
    var lastInput = INVITING;
    var leaving = null;
    var finishAt = 0;
    var links = [];
    var preview = { on: false, alpha: 0 };
    var drag = null;
    var grab = { x: 0, y: 0 };
    var glow = { x: 0, y: 0, tx: 0, ty: 0, on: 0, want: 0 };
    var area = null;
    var view = { w: 1, h: 1, F: 1, cx: 0, cy: 0, cos: 1, sin: 0, stacked: ctx.isStackedMode() };
    var dots = makeDots();
    var cards = [];
    var ink = Ink.theme(host).ink;
    var intro = ctx.track.querySelector(".project-panel-intro .project-panel-image");

    /* the field (canvas and cards) takes the pointer */
    var field = Ink.el("div", "wis-field");
    var skip = Ink.el("button", "play-button wis-skip", "skip");
    var hint = Ink.el("p", "sr-only", "enter picks a fragment up, arrow keys move it, enter puts it down.");
    var live = Ink.el("p", "sr-only");

    hint.id = "wis-hint";
    live.setAttribute("aria-live", "polite");
    skip.type = "button";
    host.classList.add("wis");
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", "where it sits: " + LINE);
    host.tabIndex = -1;
    [field, Ink.el("p", "play-line wis-line", LINE), skip, hint, live].forEach(function (node) {
      host.appendChild(node);
    });

    var stage = Ink.stage(field, { className: "wis-stage", onResize: layout });

    tear.add(stage.destroy);

    FRAGMENTS.forEach(function (f, i) {
      var b = Ink.el("button", "wis-card");

      b.type = "button";
      b.setAttribute("aria-label", f.label);
      b.setAttribute("aria-describedby", hint.id);
      b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<img alt="" draggable="false" decoding="async" src="' + src(f.id, ctx.imageUrl) + '">' + (f.text ? '<span class="wis-note">' + f.text + "</span>" : "") + '<span class="wis-cap">' + f.cap + "</span>";          // (a note is set as real text: the scanned handwriting is too small to read on a card)
      if (f.text) {
        b.classList.add("wis-card-note");
      }
      field.appendChild(b);
      b.wisCard = { f: f, el: b, born: 0.85 + i * 0.11, d: 0, td: 0, z: -1, delay: 0 };
      cards.push(b.wisCard);
    });

    /* where cards may go: clear of the edges and bottom controls; on a wide screen only the open side beside the first picture */
    function freeArea(w, h) {
      var a = view.stacked ? { l: w * 0.05, t: h * 0.1, r: w * 0.95, b: h - 190 } : { l: w * 0.06, t: h * 0.1, r: w * 0.94, b: h - 140 };
      var r = !view.stacked && intro ? intro.getBoundingClientRect() : null;

      if (r && r.width && r.left > w * 0.35 && r.left - 40 - a.l >= 320) {
        a.r = r.left - 40;
      } else if (r && r.width && r.right < w * 0.65 && a.r - r.right - 40 >= 320) {
        a.l = r.right + 40;
      }

      return a;
    }

    function scaleOf(d) {
      return 1.04 - 0.18 * d;
    }

    function measure(c) {
      c.w = c.w0 * scaleOf(c.td);
      c.h = c.h0 * scaleOf(c.td);
    }

    function keepInside(c) {
      c.tx = clamp(c.tx, area.l + c.w / 2, Math.max(area.l + c.w / 2, area.r - c.w / 2));
      c.ty = clamp(c.ty, area.t + c.h / 2, Math.max(area.t + c.h / 2, area.b - c.h / 2));
    }

    /* on a resize the cards keep their place as a fraction of the free area */
    function layout(s) {
      var old = cards.length && cards[0].w0 ? area : null;

      view.stacked = ctx.isStackedMode();
      view.w = s.w;
      view.h = s.h;
      view.F = Math.max(s.w, s.h) * 0.55;
      view.cx = s.w / 2;
      view.cy = s.h * (view.stacked ? 0.44 : 0.42);
      area = freeArea(s.w, s.h);

      var base = view.stacked ? clamp(s.w * 0.23, 76, 100) : clamp(s.w * 0.088, 108, 200);          // (big screens: bigger cards, so six fragments do not get lost in the field)
      var tall = area.b - area.t > area.r - area.l;

      cards.forEach(function (c) {
        var p = tall ? c.f.tall : c.f.wide;

        c.w0 = Math.round(base * c.f.k);
        c.h0 = Math.round(c.w0 * c.f.r);
        c.el.style.width = c.w0 + "px";
        c.el.style.height = c.h0 + "px";

        if (c.f.text) {
          c.el.querySelector(".wis-note").style.fontSize = clamp(c.w0 * 0.088, 8.5, 15).toFixed(1) + "px";          // the note's words grow with its card
        }

        if (old) {
          c.tx = area.l + ((c.tx - old.l) / Math.max(1, old.r - old.l)) * (area.r - area.l);
          c.ty = area.t + ((c.ty - old.t) / Math.max(1, old.b - old.t)) * (area.b - area.t);
        } else {
          c.tx = area.l + p[0] * (area.r - area.l);
          c.ty = area.t + p[1] * (area.b - area.t);
          c.d = c.td = p[2];
        }

        measure(c);
        keepInside(c);

        if (!old) {
          c.x = c.tx;
          c.y = c.ty;
        }
      });
    }

    layout(stage);

    /* ---- picking up, carrying, putting down, linking ---- */
    function snap() {
      return view.stacked ? 26 : 36;
    }

    function partnerFor(c) {
      return cards.filter(function (o) {
        return o !== c && !o.partner && !c.partner && related(c.f.id, o.f.id) && gap(c, o) < snap();
      })[0] || null;
    }

    function moveTo(c, x, y) {
      var p = c.partner;
      var dx = p ? p.tx - c.tx : 0;
      var dy = p ? p.ty - c.ty : 0;

      c.tx = x;
      c.ty = y;
      keepInside(c);

      if (p) {
        p.tx = c.tx + dx;
        p.ty = c.ty + dy;
        keepInside(p);
      }

      var near = partnerFor(c);

      preview.on = Boolean(near);

      if (near) {
        preview.a = c;
        preview.b = near;
      }
    }

    function lift(c, keys) {
      if (leaving || T < c.born + 0.4 || drag) {
        return;
      }

      drag = c;
      c.lifted = true;
      c.el.classList.add("is-lifted");
      c.el.setAttribute("aria-pressed", "true");
      lastInput = T;

      if (keys) {
        live.textContent = "picked up the " + c.f.cap + ". arrow keys move it, enter puts it down.";
      }
    }

    /* a linked pair settles side by side and a little nearer; loose cards in the way step aside */
    function link(a, b) {
      var across = Math.abs(a.tx - b.tx) / (a.w + b.w) >= Math.abs(a.ty - b.ty) / (a.h + b.h);
      var space = view.stacked ? 30 : 46;
      var x;
      var y;

      a.partner = b;
      b.partner = a;
      a.td = b.td = Math.max(0, Math.min(a.td, b.td) - 0.14);
      measure(a);
      measure(b);

      a.tx = across ? b.tx + (a.tx < b.tx ? -1 : 1) * ((a.w + b.w) / 2 + space) : b.tx + 6;
      a.ty = across ? b.ty + 6 : b.ty + (a.ty < b.ty ? -1 : 1) * ((a.h + b.h) / 2 + space + 16);
      x = a.tx;
      y = a.ty;
      keepInside(a);
      b.tx += a.tx - x;
      b.ty += a.ty - y;
      a.el.classList.add("is-linked");
      b.el.classList.add("is-linked");
      x = (a.tx + b.tx) / 2;
      y = (a.ty + b.ty) / 2;

      cards.forEach(function (o) {
        var ox = Math.abs(a.tx - b.tx) / 2 + Math.max(a.w, b.w) / 2 + o.w / 2 + 16 - Math.abs(o.tx - x);
        var oy = Math.abs(a.ty - b.ty) / 2 + Math.max(a.h, b.h) / 2 + o.h / 2 + 28 - Math.abs(o.ty - y);

        if (o !== a && o !== b && ox > 0 && oy > 0) {
          if (ox < oy) {
            o.tx += o.tx < x ? -ox : ox;
          } else {
            o.ty += o.ty < y ? -oy : oy;
          }

          keepInside(o);
        }
      });

      links.push({ a: a, b: b, at: T });
      live.textContent = "linked: " + a.f.cap + " and " + b.f.cap + ". " + links.length + " of " + LINKS_TO_FINISH + ".";

      if (links.length >= LINKS_TO_FINISH) {
        finishAt = T + 1.3;
      }
    }

    function drop(c, keys) {
      if (!c || !c.lifted) {
        return;
      }

      var b = preview.on && preview.a === c ? preview.b : null;

      c.lifted = false;
      drag = null;
      preview.on = false;
      c.el.classList.remove("is-lifted");
      c.el.setAttribute("aria-pressed", "false");
      lastInput = T;

      if (b && gap(c, b) < snap()) {
        link(c, b);
      } else if (keys) {
        live.textContent = "put down.";
      }
    }

    function pointAt(x, y) {
      lastInput = T;
      glow.tx = x;
      glow.ty = y;
      glow.want = 1;
    }

    /* pointer, touch and pen: the card follows from where it was taken */
    tear.add(Ink.pointer(field, {
      down: function (x, y, event) {
        var b = event.target.closest && event.target.closest(".wis-card");
        var c = b && b.wisCard;

        pointAt(x, y);

        if (c) {
          lift(c, false);
          grab.x = c.tx - x;
          grab.y = c.ty - y;
        }
      },
      move: function (x, y, event, active) {
        pointAt(x, y);

        if (active && drag && !leaving) {
          moveTo(drag, x + grab.x, y + grab.y);
        }
      },
      up: function (x, y, event) {
        glow.want = event.pointerType === "mouse" ? 1 : 0;
        drop(drag, false);
      }
    }));

    function leaveField() {
      glow.want = 0;
    }

    field.addEventListener("pointerleave", leaveField);

    /* Tab reaches a card, Enter picks it up, the arrows move it, Enter puts it down; Escape is left to the viewer */
    cards.forEach(function (c) {
      c.el.addEventListener("keydown", function (event) {
        var k = event.key;
        var step = (event.shiftKey ? 3 : 1) * (view.stacked ? 14 : 22);
        var dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0;
        var dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;

        if (k === "Enter" || k === " ") {
          event.preventDefault();

          if (drag === c) {
            drop(c, true);
          } else {
            lift(c, true);
          }
        } else if ((dx || dy) && drag === c) {
          event.preventDefault();
          lastInput = T;
          moveTo(c, c.tx + dx, c.ty + dy);
        }
      });
      c.el.addEventListener("blur", function () {
        if (drag === c) {
          drop(c, true);
        }
      });
    });

    skip.addEventListener("click", function () {
      finish();
    });

    /* ---- the end: the fragments fly off towards the second panel and the first picture comes back ---- */
    function panelTwoPoint() {
      var fig = ctx.track.querySelector(".project-panel:nth-child(2) .project-panel-image");
      var r = fig ? fig.getBoundingClientRect() : { left: view.w, right: view.w, top: 0, height: view.h };

      return { x: (Math.min(r.left, view.w + 30) + Math.min(r.right, view.w + 30)) / 2, y: clamp(r.top + r.height / 2, -30, view.h + 40) };
    }

    function restoreIntro(now) {
      if (intro) {
        intro.style.opacity = "";
        intro.style.transition = now ? "" : intro.style.transition;
      }
    }

    function finish() {
      if (leaving || finished) {
        return;
      }

      var order = 0;

      seen();          // finished, skipped or left alone: it counts as seen (closing the project half way does not)
      drop(drag, false);
      leaving = { at: T, to: panelTwoPoint() };
      host.classList.add("is-leaving");
      restoreIntro(false);

      /* pairs leave first and together (their thread stays short), loose cards follow */
      links.forEach(function (l) {
        l.a.delay = l.b.delay = order * 0.07;
        order += 1;
      });
      cards.forEach(function (c) {
        if (!c.partner) {
          c.delay = order * 0.07;
          order += 1;
        }

        c.fx = c.rx;
        c.fy = c.ry;
        c.el.tabIndex = -1;
      });
    }

    function done() {
      if (!finished) {
        finished = true;
        tear.run();
        resolve();
      }
    }

    /* the viewer closing mid-ritual: fade out, then clean up */
    function onClosing() {
      restoreIntro(true);
      host.classList.add("is-closing");
      window.setTimeout(done, 200);
    }

    document.addEventListener("harini:project-closing", onClosing);
    document.addEventListener("harini:project-closed", done);
    tear.add(function () {
      document.removeEventListener("harini:project-closing", onClosing);
      document.removeEventListener("harini:project-closed", done);
      field.removeEventListener("pointerleave", leaveField);
      restoreIntro(true);
    });

    /* ---- the loop: fixed steps move, frames draw ---- */
    function step(dt) {
      if (!host.isConnected) {
        done();
        return;
      }

      T += dt;

      var follow = 1 - Math.exp(-dt * 16);
      var quick = 1 - Math.exp(-dt * 40);
      var slow = 1 - Math.exp(-dt * 5);
      var soft = 1 - Math.exp(-dt * 10);

      cards.forEach(function (c) {
        var k = c.lifted || (drag && drag.partner === c) ? quick : follow;

        c.x += (c.tx - c.x) * k;
        c.y += (c.ty - c.y) * k;
        c.d += (c.td - c.d) * slow;
      });

      glow.on += (glow.want - glow.on) * (1 - Math.exp(-dt * 6));
      glow.x += (glow.tx - glow.x) * soft;
      glow.y += (glow.ty - glow.y) * soft;
      preview.alpha += ((preview.on ? 1 : 0) - preview.alpha) * soft;

      if (leaving) {
        if (T - leaving.at > 1.35) {
          done();
        }
      } else if ((finishAt && T >= finishAt) || T - lastInput > IDLE_SECONDS || T > LONGEST) {
        finish();
      }
    }

    function draw() {
      if (finished) {
        return;
      }

      var c = stage.ctx;
      var out = leaving ? 1 - easeInOut((T - leaving.at) / 1.1) : 1;
      var yaw = 0.035 * ease((T - 0.9) / 0.9) * Math.sin(T * 0.32);
      var hw = Ink.hair(stage, 0.8);

      view.cos = Math.cos(yaw);
      view.sin = Math.sin(yaw);
      stage.clear();
      c.strokeStyle = ink;
      c.fillStyle = ink;
      c.lineWidth = hw;
      drawFloor(c, view, ease((T - 0.3) / 0.75), out);
      drawDots(c, view, dots, T, glow, out);

      /* each card: drifting in, carried, or flying off (fading only near the end) */
      cards.forEach(function (card) {
        var a = ease((T - card.born) / 1.0);
        var s = scaleOf(card.d) * (0.92 + 0.08 * a) * (card.lifted ? 1.06 : 1);
        var x = card.x + (1 - a) * (view.stacked ? 10 : 22);
        var y = card.y + (1 - a) * 26;
        var alpha = a * (1 - card.d * 0.28);

        if (leaving) {
          var p = easeInOut((T - leaving.at - card.delay) / 0.95);

          x = card.fx + (leaving.to.x - card.fx) * p;
          y = card.fy + (leaving.to.y - card.fy) * p - Math.sin(p * Math.PI) * 24;
          s *= 1 - 0.62 * p;
          alpha *= 1 - p * p;
        }

        card.rx = x;
        card.ry = y;
        card.rs = s;
        card.ra = alpha;
        card.rw = card.w0 * s;
        card.rh = card.h0 * s;
      });

      links.forEach(function (l) {
        drawThread(c, l.a, l.b, ease((T - l.at) / 0.6), Math.min(l.a.ra, l.b.ra), hw * 1.1);
      });

      if (preview.alpha > 0.01 && !preview.a.partner) {
        drawThread(c, preview.a, preview.b, 1, preview.alpha * 0.45 * out, hw * 1.1);
      }

      c.globalAlpha = 1;

      /* nearer cards on top, the carried one above all */
      cards.slice().sort(function (a, b) {
        return (b.lifted ? -1 : b.d) - (a.lifted ? -1 : a.d);
      }).forEach(function (card, order) {
        if (card.z !== order) {
          card.z = order;
          card.el.style.zIndex = String(order + 1);
        }

        card.el.style.opacity = card.ra.toFixed(3);
        card.el.style.transform = "translate3d(" + (card.rx - card.w0 / 2).toFixed(2) + "px," + (card.ry - card.h0 / 2).toFixed(2) + "px,0) scale(" + card.rs.toFixed(4) + ")";
      });
    }

    var loop = Ink.loop(step, draw, host);

    tear.add(loop.stop);

    /* the first picture dims to about a third meanwhile */
    if (intro) {
      intro.style.transition = "opacity 700ms cubic-bezier(0.22, 1, 0.36, 1)";
      window.requestAnimationFrame(function () {
        intro.style.opacity = finished || leaving ? "" : String(INTRO_DIM);
      });
    }

    host.classList.add("is-inviting");

    host.focus({ preventScroll: true });
    loop.start();
  }

  window.HariniProjectRituals = window.HariniProjectRituals || {};
  window.HariniProjectRituals[NAME] = function (host, ctx) {
    var memory = window.HariniInk.memory(NAME);

    if (ctx.reducedMotion || window.HariniInk.reducedMotion || memory.done()) {
      return Promise.resolve();
    }

    return new Promise(function (resolve) {
      run(host, ctx, resolve, function () {
        memory.set();
      });
    });
  };
})();
