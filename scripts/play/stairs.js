/*
  "would you take the stairs?" - Harini's dissertation question, playable (a custom project panel: window.HariniProjectPanels.stairs).

  A paper card on the dark stage: a hairline flight of ten risers rising to a landing with a door. The landing girl stands at the foot of it (the same rig,
  through window.HariniGirl). She can climb - a real stair climb, each foot planted on its tread - or, because gravity is optional here, float up: gravity eases
  off, she rises gently with her ponytail and dress drifting up, and when she is let go it comes back and sets her down softly on the nearest tread. She never
  falls hard and never fails. At the door: "you took the stairs." / "you floated." / "a bit of both."

  Controls: right / left arrow or D / A walk, hold up arrow or space to float; touch: hold the lower right / left of the card to walk, hold the upper part to
  float; the "step" and "rise" buttons do the same for a pointer or a switch. Every step is announced ("on step 4 of 10").
  Reduced motion: two buttons, "take the stairs" / "float", each showing a still drawing and the result line.
  Copy lines are drafts for Harini to approve.
*/
(function () {
  "use strict";

  var Ink = window.HariniInk;

  /* the card is a 750 x 600 world (any size on screen); the stair, the girl and the door are drawn in it */
  var WW = 750;
  var WH = 600;
  var FLOOR = 556;
  var N = 10;
  var TREAD = 44;
  var RISER = 25;
  var X0 = 168;
  var TOP = FLOOR - N * RISER;
  var XTOP = X0 + N * TREAD;
  var DOOR_X = 668;
  var DOOR_W = 64;
  var DOOR_H = 250;
  var GIRL_H = 222;
  var START_X = 74;
  var CLIMB = 1.6 * TREAD;          // walking speed: about 1.6 treads per second
  var STRIDE = 2 * TREAD;           // one gait cycle = two treads
  var RISE = 0.18 * WH;             // floating: gentle rise, about 0.18 card heights per second
  var SOFT = 0.32 * WH;             // never comes down faster than this
  var LINES = {
    hint: "gravity is optional here.",
    stairs: "you took the stairs.",
    floated: "you floated.",
    mixed: "a bit of both."
  };

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function sstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* the height (screen y) of whatever she stands on at x: the floor, a tread, the landing */
  function groundAt(x) {
    if (x < X0) {
      return FLOOR;
    }

    if (x >= XTOP) {
      return TOP;
    }

    return FLOOR - (Math.floor((x - X0) / TREAD) + 1) * RISER;
  }

  /* the pelvis rides a smooth ramp along the flight (the feet find their own treads) */
  function rampAt(x) {
    return FLOOR - RISER * clamp((x - X0 + TREAD * 0.5) / TREAD, 0, N);
  }

  function treadIndex(x) {
    return x < X0 ? 0 : x >= XTOP ? N : Math.floor((x - X0) / TREAD) + 1;
  }

  function newPose(t) {
    return {
      x: START_X, y: FLOOR, yaw: 2,
      gait: { amount: 0, phase: 0, speed: 0, run: 0, stride: STRIDE },
      headYaw: 0, headPitch: 0, headRoll: 0, lean: 0, squash: 0, air: 0, wind: { x: 0, y: 0 }, t: t,
      tiptoe: 0, spread: 0, hand: [null, null], footZ: [0, 0]
    };
  }

  /* ---------------------------------------------------------------- drawing of the set (hairlines on paper) */
  function drawSet(ctx, k, lw, theme, floatK, t) {
    var i;

    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(14, FLOOR + 0.5);
    ctx.lineTo(X0, FLOOR + 0.5);

    for (i = 0; i < N; i++) {
      var x = X0 + i * TREAD;
      var y = FLOOR - i * RISER;

      ctx.lineTo(x, y - RISER);
      ctx.lineTo(x + TREAD, y - RISER);
    }

    ctx.lineTo(WW - 14, TOP);
    ctx.stroke();
    // the stringer under the flight and the landing's edge: a light structure, drawn thinner
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(X0 + 6, FLOOR);
    ctx.lineTo(XTOP, TOP + RISER + 10);
    ctx.lineTo(XTOP, TOP);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // the door: a frame on the landing, ajar
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(DOOR_X, TOP);
    ctx.lineTo(DOOR_X, TOP - DOOR_H);
    ctx.lineTo(DOOR_X + DOOR_W, TOP - DOOR_H);
    ctx.lineTo(DOOR_X + DOOR_W, TOP);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(DOOR_X + DOOR_W, TOP);
    ctx.lineTo(DOOR_X + DOOR_W + 16, TOP - 10);
    ctx.lineTo(DOOR_X + DOOR_W + 16, TOP - DOOR_H + 12);
    ctx.lineTo(DOOR_X + DOOR_W, TOP - DOOR_H);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // a little dust on the floor and the treads: it lifts a touch when gravity lets go
    ctx.fillStyle = theme.ink;

    for (i = 0; i < 26; i++) {
      var sx = 30 + ((i * 97.3) % (WW - 60));
      var gy = groundAt(sx) - 3 - ((i * 13) % 5);
      var lift = floatK * (6 + 10 * ((i * 0.618) % 1)) * (0.6 + 0.4 * Math.sin(t * 1.3 + i));

      ctx.globalAlpha = 0.22;
      ctx.beginPath();
      ctx.arc(sx, gy - lift, 1 + ((i * 7) % 3) * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }

  /* ---------------------------------------------------------------- the panel */
  function mount(figure, panel, ctx) {
    var td = Ink.teardown();
    var theme = Ink.theme(document.documentElement);
    var card = Ink.el("div", "play-card stairs-card");
    var ui = Ink.el("div", "stairs-ui");
    var live = Ink.el("p", "sr-only");
    var hint = Ink.el("p", "play-line stairs-hint");
    var result = Ink.el("div", "stairs-result");
    var resultLine = Ink.el("p", "play-line stairs-result-line");
    var buttons = Ink.el("div", "play-buttons stairs-controls");
    var stepBtn = Ink.el("button", "play-button", "step");
    var riseBtn = Ink.el("button", "play-button", "rise");
    var againBtn = Ink.el("button", "play-button", "again");
    var questionBtn = Ink.el("button", "play-button", "what's the question?");
    var memory = Ink.memory("stairs");

    live.setAttribute("aria-live", "polite");
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", "a stair with ten steps and a door at the top. right arrow walks, hold up arrow or space to float.");
    card.setAttribute("data-panel-interactive", "");
    hint.innerHTML = '<span class="stairs-key">&uarr; hold</span> <span>' + LINES.hint + "</span>";
    stepBtn.type = riseBtn.type = againBtn.type = questionBtn.type = "button";
    buttons.appendChild(stepBtn);
    buttons.appendChild(riseBtn);
    result.appendChild(resultLine);
    var resultButtons = Ink.el("div", "play-buttons");
    resultButtons.appendChild(againBtn);
    resultButtons.appendChild(questionBtn);
    result.appendChild(resultButtons);
    ui.appendChild(hint);
    ui.appendChild(result);
    ui.appendChild(buttons);
    card.appendChild(ui);
    figure.appendChild(card);
    figure.appendChild(live);

    var stage = Ink.stage(card, { className: "stairs-canvas" });
    var girl = window.HariniGirl ? window.HariniGirl.create({ height: GIRL_H, seed: 5 }) : null;
    var reduced = Ink.reducedMotion || !girl;

    // ---- state
    var st = { t: 0, x: START_X, y: FLOOR, vx: 0, vy: 0, dir: 1, phase: 0, airH: 0, floatK: 0, holdFloat: false, walk: 0, done: false, steps: 0, floated: 0, walkedUp: 0, idle: 0, hinted: false, lastTread: 0, land: 0, turn: 0, footZ: [0, 0] };
    var pose = newPose(0);
    var prevPose = null;
    var offHS = 0;

    if (girl) {
      // where the leading foot lands relative to her root, measured once from the rig, so her footfalls can be put on the treads
      var probe = newPose(0);
      probe.gait.amount = 1;
      probe.gait.phase = -0.1;
      probe.x = 0;
      var an = girl.anchors(probe);
      offHS = Math.max(an.footL.x, an.footR.x);
    }

    function phaseAt(x) {
      return (x - X0 - TREAD * 0.5 - offHS) / STRIDE - 0.1;          // a heel strike exactly when a foot is over the middle of a tread
    }

    function announce(text) {
      live.textContent = text;
    }

    function routeLine() {
      if (st.floated < 8) {
        return LINES.stairs;
      }

      if (st.walkedUp < TREAD) {
        return LINES.floated;
      }

      return LINES.mixed;
    }

    function finish() {
      st.done = true;
      card.classList.add("is-done");
      resultLine.textContent = routeLine();
      announce(resultLine.textContent);
      memory.set();
      try {
        window.sessionStorage.setItem("harini-play-stairs-route", resultLine.textContent);
      } catch (error) {
        /* a nicety only */
      }
    }

    function reset() {
      st.x = START_X; st.y = FLOOR; st.vx = 0; st.vy = 0; st.dir = 1; st.airH = 0; st.floatK = 0; st.holdFloat = false; st.walk = 0;
      st.done = false; st.steps = 0; st.floated = 0; st.walkedUp = 0; st.idle = 0; st.hinted = false; st.lastTread = 0; st.land = 0; st.footZ = [0, 0];
      st.phase = phaseAt(st.x);
      card.classList.remove("is-done", "is-hinting");
      resultLine.textContent = "";
      if (girl) {
        compose();
        girl.settle(pose);
      }
      announce("at the foot of the stairs.");
    }

    // ---- input: keys, touch / pointer zones, buttons
    var keys = { left: false, right: false, up: false };
    var press = { left: false, right: false, up: false };
    var tapWalk = 0;

    function onKey(event, down) {
      var k = event.key;

      if (k === "ArrowRight" || k === "d" || k === "D") {
        keys.right = down;
      } else if (k === "ArrowLeft" || k === "a" || k === "A") {
        keys.left = down;
      } else if (k === "ArrowUp" || k === " " || k === "Spacebar" || k === "w" || k === "W") {
        keys.up = down;
      } else {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      st.idle = 0;
    }

    var keyDown = function (event) {
      onKey(event, true);
    };
    var keyUp = function (event) {
      onKey(event, false);
    };

    card.addEventListener("keydown", keyDown);
    card.addEventListener("keyup", keyUp);
    card.addEventListener("blur", function () {
      keys.left = keys.right = keys.up = false;
    });

    var offPointer = Ink.pointer(stage.canvas, {
      down: function (x, y) {
        var upper = y < stage.h * 0.45;

        press.up = upper;
        press.right = !upper && x >= stage.w / 2;
        press.left = !upper && x < stage.w / 2;
        st.idle = 0;
      },
      up: function () {
        press.left = press.right = press.up = false;
      }
    });

    td.add(offPointer);
    stage.canvas.style.touchAction = "none";

    function holdButton(btn, key) {
      btn.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        press[key] = true;
        st.idle = 0;
      });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (name) {
        btn.addEventListener(name, function () {
          press[key] = false;
        });
      });
      btn.addEventListener("click", function (event) {
        if (event.detail === 0) {          // keyboard / switch: one press = one step (or a short float)
          if (key === "right") {
            tapWalk = 0.62;
          } else {
            st.holdFloat = true;
            window.setTimeout(function () {
              st.holdFloat = false;
            }, 1300);
          }
        }
      });
    }

    holdButton(stepBtn, "right");
    holdButton(riseBtn, "up");
    againBtn.addEventListener("click", function () {
      reset();
      card.focus({ preventScroll: true });
    });
    questionBtn.addEventListener("click", function () {
      ctx.next();
    });

    // ---- the simulation (fixed steps of 1/120 s)
    var G = 1;

    function measure() {
      var hPx = stage.h || 1;
      var unit = WH / hPx;          // world units per CSS px
      G = Ink.physics.gravityFor(window.innerHeight || 900) * unit;          // the page's gravity, in world units
    }

    function compose() {
      var p = pose;
      var walkAmt = sstep(0.02, 0.3, Math.abs(st.vx) / CLIMB) * (1 - sstep(0.05, 0.6, st.airH / 40));

      p.t = st.t;
      p.x = st.x;
      p.yaw = 2 + 2 * st.turn;          // facing right (2), turning round to face left (4 = 0) when she walks back
      p.gait.amount = walkAmt;
      p.gait.phase = st.phase;
      p.gait.speed = Math.abs(st.vx);
      p.gait.stride = STRIDE;
      p.y = rampAt(st.x) - st.airH;          // her root rides the ramp of the flight (her feet find the treads), lifted by the float
      p.air = 0.55 * st.floatK + 0.25 * sstep(2, 30, st.airH);
      p.tiptoe = 0;
      p.squash = 0.14 * Math.exp(-st.land * 12) * Math.sin(Math.min(Math.PI, st.land * 18)) * (st.land < 0.3 ? 1 : 0);
      p.headPitch = 0.15 * st.floatK + (st.done ? 0.12 : 0);
      p.headYaw = st.done ? -0.7 : 0;
      p.wind = { x: 0, y: -380 * st.floatK };
      p.spread = 0.6 * st.floatK;
      var armsUp = st.floatK;
      p.hand[0] = armsUp > 0.01 ? { w: armsUp * 0.9, f: "chest", at: [52, -70, 64], open: 1, pole: [-0.2, -1, 0.3] } : null;          // the arms drift up and forward, open hands (it reads in profile)
      p.hand[1] = armsUp > 0.01 ? { w: armsUp * 0.9, f: "chest", at: [34, 74, 84], open: 1, pole: [-0.2, 1, 0.3] } : null;
      p.footZ = [st.footZ[0], st.footZ[1]];
    }

    /* each foot stands on the tread under it (the swing foot travels from its old tread to its new one, clearing the nose of the step) */
    function placeFeet() {
      if (!girl) {
        return;
      }

      var S = girl.solve(pose);
      var sc = GIRL_H / 500;
      var cs = Math.cos(S.theta);
      var sn = Math.sin(S.theta);

      for (var i = 0; i < 2; i++) {
        var L = S.leg[i];
        var ff = L.Ff;
        var fx = ff.R[0] * 18 + ff.o[0];
        var fc = ff.R[3] * 18 + ff.o[1];
        var wx = pose.x - sc * (fx * cs + fc * sn);
        var q = S.legQ[i];
        var rho = 0.6;
        var h;

        if (pose.gait.amount < 0.05 || q < rho) {
          h = pose.y - groundAt(wx);
        } else {
          var u = (q - rho) / (1 - rho);
          var x1 = wx + st.dir * STRIDE * (1 - u);
          var x0 = wx - st.dir * STRIDE * u;
          var h0 = pose.y - groundAt(x0);
          var h1 = pose.y - groundAt(x1);
          h = h0 + (h1 - h0) * sstep(0.1, 0.75, u) + Math.abs(h1 - h0) * 0.55 * Math.sin(Math.PI * u);
        }

        st.footZ[i] += ((st.airH > 0.5 ? 0 : h / sc) - st.footZ[i]) * 0.5;
      }
    }

    function step(dt) {
      st.t += dt;

      if (st.done) {
        st.vx = 0;
        st.phase = phaseAt(st.x);
        compose();
        if (girl) {
          girl.step(dt, pose);
        }
        return;
      }

      var right = keys.right || press.right || tapWalk > 0;
      var left = keys.left || press.left;
      var up = keys.up || press.up || st.holdFloat;
      var want = right && !left ? 1 : left && !right ? -1 : 0;

      tapWalk = Math.max(0, tapWalk - dt);
      st.idle += dt;

      if (want !== 0 && want !== st.dir && st.airH < 0.5) {
        st.dir = want;
      }

      st.turn += ((st.dir > 0 ? 0 : 1) - st.turn) * Math.min(1, dt * 10);
      var target = want * CLIMB * (st.airH > 0.5 ? 1.2 : 1);
      st.vx += (target - st.vx) * Math.min(1, dt * 7);
      var nx = clamp(st.x + st.vx * dt, 40, DOOR_X + DOOR_W * 0.5);

      // floating: gravity eases off over 0.4 s while held, comes back over 0.6 s when let go
      st.floatK = clamp(st.floatK + (up ? dt / 0.4 : -dt / 0.6), 0, 1);
      var g = G * (1 - st.floatK);
      var vUp = RISE * st.floatK;

      st.vy += (st.floatK > 0 ? (vUp - st.vy) * 3 * st.floatK : 0) * dt - g * dt;
      st.vy = Math.max(st.vy, -SOFT);          // never a hard fall: the air takes her weight on the way down
      // keep her absolute height while the ramp under her changes, and her head inside the card
      st.airH += st.vy * dt + (st.airH > 0.5 ? rampAt(nx) - rampAt(st.x) : 0);
      var headroom = rampAt(nx) - GIRL_H - 26;
      if (st.airH > headroom) {
        st.airH = headroom;
        st.vy = Math.min(st.vy, 0);
      }

      if (st.airH <= 0) {
        if (st.vy < -40) {
          st.land = 0;
        }

        st.airH = 0;
        st.vy = Math.max(0, st.vy);
      }

      st.land += dt;

      var moved = nx - st.x;

      if (st.airH > 0.5) {
        st.floated += Math.abs(moved) + Math.max(0, st.vy * dt);
      } else if (nx > X0 && nx < XTOP && moved > 0) {
        st.walkedUp += moved;
      }

      st.x = nx;

      if (st.airH < 0.5 && Math.abs(st.vx) > 1) {
        st.phase += Math.abs(moved) / STRIDE;
      } else if (Math.abs(st.vx) < 2 && st.airH < 0.5) {
        var sync = phaseAt(st.x);
        st.phase += (sync - st.phase) * Math.min(1, dt * 4) * (1 - sstep(0.02, 0.3, Math.abs(st.vx) / CLIMB));
      }

      var tread = treadIndex(st.x);

      if (tread !== st.lastTread) {
        st.lastTread = tread;

        if (tread > 0 && tread <= N) {
          announce("on step " + tread + " of " + N + ".");
        }

        if (tread > st.steps) {
          st.steps = tread;
        }
      }

      if (!st.hinted && (st.steps >= 2 || st.idle > 4)) {
        st.hinted = true;
        card.classList.add("is-hinting");
      }

      if (st.x >= DOOR_X - 4 && st.airH < 0.5 && groundAt(st.x) === TOP) {
        st.vx = 0;
        finish();
      }

      compose();
      placeFeet();
      compose();

      if (girl) {
        girl.step(dt, pose);
      }
    }

    function draw() {
      var c = stage.ctx;
      var k = stage.w / WW;
      var kh = stage.h / WH;
      var s = Math.min(k, kh);
      var ox = (stage.w - WW * s) / 2;
      var oy = (stage.h - WH * s) / 2;

      stage.clear();
      c.save();
      c.translate(ox, oy);
      c.scale(s, s);
      drawSet(c, s, Ink.hair(stage) / s, theme, st.floatK, st.t);

      if (girl) {
        girl.draw(c, pose, s * stage.dpr);
      }

      c.restore();
    }

    // ---- reduced motion: two buttons, a still drawing and the result line
    if (reduced) {
      card.classList.add("is-reduced");
      buttons.innerHTML = "";
      var takeBtn = Ink.el("button", "play-button", "take the stairs");
      var floatBtn = Ink.el("button", "play-button", "float");
      takeBtn.type = floatBtn.type = "button";
      buttons.appendChild(takeBtn);
      buttons.appendChild(floatBtn);

      var still = function (route) {
        measure();
        st.x = DOOR_X - 6; st.airH = 0; st.floatK = route === "float" ? 1 : 0; st.done = true;
        if (route === "float") {
          st.x = XTOP - TREAD * 3; st.airH = 90;
        }
        compose();
        if (girl) {
          girl.settle(pose);
        }
        draw();
        resultLine.textContent = route === "float" ? LINES.floated : LINES.stairs;
        card.classList.add("is-done");
        announce(resultLine.textContent);
      };

      takeBtn.addEventListener("click", function () {
        still("stairs");
      });
      floatBtn.addEventListener("click", function () {
        still("float");
      });
      againBtn.addEventListener("click", function () {
        card.classList.remove("is-done");
        st.done = false; st.x = START_X; st.airH = 0; st.floatK = 0;
        compose();
        draw();
      });
      measure();
      reset();
      draw();
      return { destroy: function () { td.run(); stage.destroy(); } };
    }

    measure();
    reset();

    if (memory.done()) {          // already done this session: start at the door with the result and "again"
      st.x = DOOR_X - 4; st.y = TOP;
      var line = "";
      try {
        line = window.sessionStorage.getItem("harini-play-stairs-route") || "";
      } catch (error) {
        line = "";
      }
      compose();
      girl.settle(pose);
      st.done = true;
      card.classList.add("is-done");
      resultLine.textContent = line || LINES.stairs;
    }

    var loop = Ink.loop(step, draw, card);
    var onResize = function () {
      measure();
    };

    window.addEventListener("resize", onResize);
    td.add(function () {
      window.removeEventListener("resize", onResize);
    });
    loop.start();
    td.add(loop.stop);
    td.add(stage.destroy);

    return {
      destroy: function () {
        td.run();
      }
    };
  }

  window.HariniProjectPanels.stairs = {
    mount: mount,
    unmount: function (handle) {
      if (handle && handle.destroy) {
        handle.destroy();
      }
    }
  };

  /* the note after the game: a small drawing beside the question (a door in a wall with no floor in front of it) */
  window.HariniProjectPanels["stairs-question"] = {
    mount: function (figure) {
      var card = Ink.el("div", "play-card stairs-card");
      figure.appendChild(card);
      var stage = Ink.stage(card, {
        onResize: function (s) {
          var c = s.ctx;
          var th = Ink.theme(document.documentElement);
          var k = Math.min(s.w / WW, s.h / WH);

          s.clear();
          c.save();
          c.translate((s.w - WW * k) / 2, (s.h - WH * k) / 2);
          c.scale(k, k);
          c.strokeStyle = th.ink;
          c.lineWidth = Ink.hair(s) / k;
          c.beginPath();
          c.moveTo(250, 120); c.lineTo(250, 470); c.moveTo(500, 120); c.lineTo(500, 470);
          c.moveTo(250, 120); c.lineTo(500, 120);
          c.stroke();
          c.beginPath();
          c.rect(338, 250, 74, 150);
          c.stroke();
          c.setLineDash([2, 7]);
          c.beginPath();
          c.moveTo(150, 470); c.lineTo(600, 470);
          c.stroke();
          c.restore();
        }
      });

      return stage;
    },
    unmount: function (stage) {
      if (stage) {
        stage.destroy();
      }
    }
  };
})();
