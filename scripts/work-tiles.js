/*
  The work tiles' response to the navigation ball (styles/work-tiles.css has the three layouts).

  The ball announces each contact with a picture as a "navball:contact" event (detail: { element, x, strength }; strength 0..1, the height
  of the bounce that ends in this contact) and its departure as "navball:leave" (detail: { element }). Both are heard on window in the
  capture phase, so they arrive wherever the ball dispatches them (window, document or the picture itself).

  - flex: the picture dips a few px at its free tip and springs back, as if the slab gives under the hit (a damped spring of about 300 ms,
    scaled to the bounce). A slab fixed to the left screen edge turns about that edge, one fixed to the right edge about the right edge; a
    sheet frame (fixed to neither, or to both) sinks as a whole. Transform only, on the picture's own compositor layer.
  - wake (&wake=1): the picture warms to colour while the ball is on it and eases back to grey once it has gone.
  - each picture also says which way the ball should roll off it (data-ball-roll="left" / "right": towards the screen edge it hangs from;
    in the sheet, along the top row and off the far edge). It is a hint for the ball's code; nothing here moves the ball.
  - ?tilesdebug=1: a small button that plays a fake landing (four contacts, then leave) on the first picture.
*/
(function () {
  "use strict";

  var html = document.documentElement;
  var reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var SPRING = [0, 1, -0.38, 0.14, -0.05, 0]; // the tip's travel at each step, as a share of the full dip
  var SPRING_AT = [0, 0.2, 0.46, 0.7, 0.87, 1];
  var WAKE_FALLBACK_MS = 7000; // back to grey even if no "leave" ever comes
  var WAKE_AFTER_LEAVE_MS = 350;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function layout() {
    return html.getAttribute("data-tiles") || "cantilever";
  }

  function pictureFrom(element) {
    if (!element || element.nodeType !== 1) {
      return null;
    }

    return (element.closest && element.closest(".work-tile-media")) || (element.querySelector && element.querySelector(".work-tile-media"));
  }

  /* the screen edge a picture hangs from: "left", "right", or "none" (a sheet frame, or one touching both edges) */
  function fixedEdge(picture) {
    var rect = picture.getBoundingClientRect();
    var width = html.clientWidth;
    var atLeft = rect.left <= 0.5;
    var atRight = rect.right >= width - 0.5;

    if (atLeft && !atRight) {
      return "left";
    }

    if (atRight && !atLeft) {
      return "right";
    }

    return "none";
  }

  function rollHint(picture) {
    if (layout() === "sheet") {
      return "right";
    }

    var edge = fixedEdge(picture);

    return edge === "none" ? "left" : edge;
  }

  function markRollHints() {
    Array.prototype.forEach.call(document.querySelectorAll(".work-tile-media"), function (picture) {
      picture.setAttribute("data-ball-roll", rollHint(picture));
    });
  }

  function flex(picture, strength) {
    var power = clamp(Number(strength) || 0, 0, 1);

    if (!power || reducedMotion.matches || !picture.animate) {
      return;
    }

    var rect = picture.getBoundingClientRect();
    /* a sheet frame is butted against its neighbour: it sinks as a whole (turning about the screen edge would open the seam) */
    var edge = layout() === "sheet" ? "none" : fixedEdge(picture);
    var dip = (html.clientWidth < 768 ? 3 : 4.5) * power; // px at the free tip
    var frames;

    if (edge === "none") {
      frames = SPRING.map(function (share, index) {
        return { offset: SPRING_AT[index], transform: "translateY(" + (share * dip * 0.6).toFixed(2) + "px)", easing: "ease-in-out" };
      });
    } else {
      var degrees = (Math.atan(dip / Math.max(1, rect.width)) * 180) / Math.PI * (edge === "left" ? 1 : -1);
      var origin = edge === "left" ? "0% 50%" : "100% 50%";

      frames = SPRING.map(function (share, index) {
        return { offset: SPRING_AT[index], transform: "rotate(" + (share * degrees).toFixed(4) + "deg)", transformOrigin: origin, easing: "ease-in-out" };
      });
    }

    if (picture._flex) {
      picture._flex.cancel();
    }

    picture._flex = picture.animate(frames, { duration: Math.round(240 + 90 * power) });
  }

  function wake(picture) {
    var tile = picture.closest(".work-tile");

    if (!tile || !html.hasAttribute("data-tiles-wake")) {
      return;
    }

    window.clearTimeout(tile._sleep);
    tile.classList.add("is-woken");
    tile._sleep = window.setTimeout(function () {
      tile.classList.remove("is-woken");
    }, WAKE_FALLBACK_MS);
  }

  function sleep(picture) {
    var tiles = picture ? [picture.closest(".work-tile")] : Array.prototype.slice.call(document.querySelectorAll(".work-tile.is-woken"));

    tiles.forEach(function (tile) {
      if (!tile) {
        return;
      }

      window.clearTimeout(tile._sleep);
      tile._sleep = window.setTimeout(function () {
        tile.classList.remove("is-woken");
      }, WAKE_AFTER_LEAVE_MS);
    });
  }

  function onContact(event) {
    var detail = event.detail || {};
    var picture = pictureFrom(detail.element) || pictureFrom(event.target);

    if (!picture) {
      return;
    }

    flex(picture, detail.strength == null ? 1 : detail.strength);
    wake(picture);
  }

  function onLeave(event) {
    var detail = event.detail || {};

    sleep(pictureFrom(detail.element) || pictureFrom(event.target));
  }

  /* the fake landing: the main hit and the three settling bounces, then the ball rolls away */
  function addDebugButton() {
    var button = document.createElement("button");

    button.type = "button";
    button.className = "tiles-debug";
    button.textContent = "fake ball contact";
    button.addEventListener("click", function () {
      var picture = document.querySelector(".work-tile-media");
      var rect = picture.getBoundingClientRect();
      var send = function (name, strength) {
        picture.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { element: picture, x: rect.left + rect.width * 0.8, strength: strength } }));
      };

      [[0, 1], [430, 0.75], [770, 0.5], [1030, 0.25]].forEach(function (step) {
        window.setTimeout(function () {
          send("navball:contact", step[1]);
        }, step[0]);
      });
      window.setTimeout(function () {
        send("navball:leave");
      }, 2600);
    });
    document.body.appendChild(button);
  }

  function init() {
    window.addEventListener("navball:contact", onContact, true);
    window.addEventListener("navball:leave", onLeave, true);
    markRollHints();
    window.addEventListener("resize", markRollHints, { passive: true });

    if (html.hasAttribute("data-tiles-debug")) {
      addDebugButton();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
