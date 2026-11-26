// Client layer: redraws charts when a switch is used. Reads the snapshot the build
// wrote into the page; never calls the Taskmarket API.
(function () {
  "use strict";
  var snap = JSON.parse(document.getElementById("snap").textContent);
  var P = snap.platform, C = snap.chains;
  var SANS = '13px "Inter Tight", system-ui, sans-serif';
  var MONO = '10px "Departure Mono", ui-monospace, monospace';
  var COL = { cream: "#EFE9E2", muted: "#B0A79D", line: "#453E37", magenta: "#E74079",
              salmon: "#D9A097", base: "#9fb6cf" };

  var money = function (n) {
    if (n >= 1000) return "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    if (n >= 1) return "$" + n.toFixed(n >= 100 ? 0 : 1);
    if (n === 0) return "$0";
    return "$" + n.toFixed(2);
  };
  var intf = function (n) { return new Intl.NumberFormat("en-US").format(n); };
  var niceMax = function (v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  };

  /* ---------------- posted vs paid ---------------- */
  var range = "7d";
  function drawTS() {
    var cv = document.getElementById("ts");
    if (!cv) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = cv.clientWidth || 640, H = 300;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + "px";
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    var rows = P.ts[range] || [];
    if (rows.length < 2) {
      g.fillStyle = COL.muted; g.font = SANS;
      g.fillText("Not enough data in this window.", 20, H / 2);
      return;
    }
    var pad = { t: 16, r: 14, b: 34, l: 52 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var posted = rows.map(function (r) { return Number(r.rewardVolume || 0) / 1e6; });
    var paid = rows.map(function (r) { return Number(r.paidVolume || 0) / 1e6; });
    var max = niceMax(Math.max.apply(null, posted.concat(paid).concat([1])));

    var X = function (i) { return pad.l + (rows.length === 1 ? iw / 2 : (iw * i) / (rows.length - 1)); };
    var Y = function (v) { return pad.t + ih * (1 - v / max); };

    // grid + y ticks
    g.font = MONO; g.textAlign = "right"; g.textBaseline = "middle";
    for (var i = 0; i <= 4; i++) {
      var yv = max * (1 - i / 4), y = Y(yv);
      g.strokeStyle = "rgba(69,62,55,.5)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(pad.l, Math.round(y) + .5); g.lineTo(W - pad.r, Math.round(y) + .5); g.stroke();
      g.fillStyle = COL.muted; g.fillText(money(yv), pad.l - 9, y);
    }
    // x ticks
    g.textAlign = "center"; g.textBaseline = "top";
    var step = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(iw / 64))));
    rows.forEach(function (r, i) {
      if (i % step && i !== rows.length - 1) return;
      g.fillStyle = COL.muted;
      g.fillText(String(r.bucket || "").slice(5), X(i), H - pad.b + 9);
    });

    // posted band
    g.beginPath();
    g.moveTo(X(0), Y(posted[0]));
    posted.forEach(function (v, i) { g.lineTo(X(i), Y(v)); });
    g.lineTo(X(rows.length - 1), pad.t + ih);
    g.lineTo(X(0), pad.t + ih);
    g.closePath();
    g.fillStyle = "rgba(231,64,121,.14)";
    g.fill();

    // posted line (dashed)
    g.beginPath();
    posted.forEach(function (v, i) { i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); });
    g.strokeStyle = "rgba(231,64,121,.85)"; g.lineWidth = 1.6; g.setLineDash([5, 4]); g.stroke();

    // paid line (solid)
    g.beginPath();
    paid.forEach(function (v, i) { i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)); });
    g.setLineDash([]); g.strokeStyle = COL.cream; g.lineWidth = 2.2; g.stroke();

    paid.forEach(function (v, i) {
      g.beginPath(); g.arc(X(i), Y(v), 2.6, 0, Math.PI * 2);
      g.fillStyle = COL.cream; g.fill();
    });

    document.getElementById("tslegend").innerHTML =
      '<span><i style="background:' + COL.cream + '"></i>paid</span>' +
      '<span><i style="background:' + COL.magenta + '"></i>posted (dashed, shaded band)</span>';

    var tp = posted.reduce(function (a, b) { return a + b; }, 0);
    var tq = paid.reduce(function (a, b) { return a + b; }, 0);
    var st = rows.reduce(function (a, r) { return a + (r.settlements || 0); }, 0);
    var na = rows.reduce(function (a, r) { return a + (r.newAgents || 0); }, 0);
    var note = document.getElementById("tsnote");
    if (note) note.innerHTML = "In this window: <b>" + money(tp) + "</b> posted, <b>" + money(tq) +
      "</b> paid across <b>" + intf(st) + "</b> settlements (" + (tq ? money(tq / st) : "$0") +
      " average), and <b>" + intf(na) + "</b> new agents joined.";
  }

  /* ---------------- heatmap ---------------- */
  var heatDim = "mode";
  function heatRows() {
    var h = heatDim === "mode" ? P.heatMode : P.heatHour;
    var acc = {}, rows = [], cols = {};
    (h.cells || []).forEach(function (x) {
      acc[x.row + "|" + x.col] = (acc[x.row + "|" + x.col] || 0) + (x.count || 0);
    });
    (h.rowKeys || []).forEach(function (r) { if (rows.indexOf(r) < 0) rows.push(r); });
    (h.colKeys || []).forEach(function (c) { cols[c] = 1; });
    return { acc: acc, rows: rows, cols: Object.keys(cols).sort() };
  }
  function drawHeat() {
    var el = document.getElementById("heatmap");
    if (!el) return;
    var d = heatRows();
    if (!d.rows.length || !d.cols.length) { el.textContent = "No heatmap data."; return; }

    var tick = Math.max(1, Math.ceil(d.cols.length / 14));
    var html = "<table><thead><tr><th></th>";
    d.cols.forEach(function (c, i) {
      html += "<th>" + ((i % tick === 0 || i === d.cols.length - 1) ? c.slice(5) : "") + "</th>";
    });
    html += "</tr></thead><tbody>";
    d.rows.forEach(function (r) {
      var vals = d.cols.map(function (c) { return d.acc[r + "|" + c] || 0; });
      var rowMax = Math.max(1, Math.max.apply(null, vals));
      html += '<tr><td class="rl">' + r.replace(/_/g, " ") + "</td>";
      vals.forEach(function (v, i) {
        var t = v / rowMax;
        var bg = v === 0 ? "#191512" : "rgba(231,64,121," + (0.10 + 0.78 * Math.pow(t, 0.7)).toFixed(3) + ")";
        var hot = v === rowMax && v > 0;
        html += '<td class="c' + (hot ? " hot" : "") + '" title="' + r.replace(/_/g, " ") + " · " +
          (d.cols[i] || "") + " · " + v + ' tasks" style="background:' + bg + '">' + (hot ? v : "") + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    el.innerHTML = html;
  }

  /* ---------------- wiring ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-range]"), function (b) {
    b.addEventListener("click", function () {
      range = b.getAttribute("data-range");
      Array.prototype.forEach.call(document.querySelectorAll("[data-range]"), function (x) {
        var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on));
      });
      drawTS();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-heat]"), function (b) {
    b.addEventListener("click", function () {
      heatDim = b.getAttribute("data-heat");
      Array.prototype.forEach.call(document.querySelectorAll("[data-heat]"), function (x) {
        var on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-selected", String(on));
      });
      drawHeat();
    });
  });

  drawTS();
  drawHeat();

  var t;
  window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(drawTS, 140); });
})();
