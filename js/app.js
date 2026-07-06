/* ============================================================
   app.js — background FX + boot.
   Depends on: UI (and the rest, loaded before this).
   Exposes: window.FX
   ============================================================ */
(function () {
  'use strict';

  var STAR_GLYPHS = ['✦', '✧', '·', '✩', '⋆'];
  var PETALS = ['🌸', '🌷', '💜', '⭐'];

  var FX = {
    // twinkling stars + slow falling petals in the fixed #stars layer
    stars: function (host) {
      if (!host) return;
      var html = '';
      for (var i = 0; i < 44; i++) {
        var g = STAR_GLYPHS[(Math.random() * STAR_GLYPHS.length) | 0];
        var size = (8 + Math.random() * 14).toFixed(0);
        var left = (Math.random() * 100).toFixed(2);
        var top = (Math.random() * 100).toFixed(2);
        var dur = (2 + Math.random() * 3).toFixed(2);
        var delay = (Math.random() * 4).toFixed(2);
        var color = Math.random() > 0.5 ? '#c084fc' : (Math.random() > 0.5 ? '#f472b6' : '#fbbf24');
        html += '<div class="star" style="left:' + left + '%;top:' + top + '%;font-size:' + size +
          'px;color:' + color + ';--dur:' + dur + 's;--d:' + delay + 's">' + g + '</div>';
      }
      for (var p = 0; p < 7; p++) {
        var pg = PETALS[(Math.random() * PETALS.length) | 0];
        var pl = (Math.random() * 100).toFixed(2);
        var pdur = (9 + Math.random() * 8).toFixed(2);
        var pdelay = (Math.random() * 10).toFixed(2);
        var pfs = (12 + Math.random() * 10).toFixed(0);
        html += '<div class="petal" style="left:' + pl + '%;--dur:' + pdur + 's;--d:' + pdelay + 's;--fs:' + pfs + 'px">' + pg + '</div>';
      }
      host.innerHTML = html;
    },
    // drifting music notes inside a given layer (used by the family hub)
    notes: function (layer) {
      if (!layer) return;
      var glyphs = ['♪', '♫', '✿', '❀', '♡'];
      var html = '';
      for (var i = 0; i < 8; i++) {
        var g = glyphs[(Math.random() * glyphs.length) | 0];
        var left = (Math.random() * 100).toFixed(2);
        var top = (40 + Math.random() * 55).toFixed(2);
        var nx = ((Math.random() - 0.5) * 120).toFixed(0);
        var ny = (-60 - Math.random() * 120).toFixed(0);
        var nr = ((Math.random() - 0.5) * 90).toFixed(0);
        var dur = (4 + Math.random() * 4).toFixed(2);
        var delay = (Math.random() * 5).toFixed(2);
        var fs = (14 + Math.random() * 12).toFixed(0);
        html += '<div class="note" style="left:' + left + '%;top:' + top + '%;color:#c084fc;' +
          '--nx:' + nx + 'px;--ny:' + ny + 'px;--nr:' + nr + 'deg;--dur:' + dur + 's;--d:' + delay + 's;--fs:' + fs + 'px">' + g + '</div>';
      }
      layer.innerHTML = html;
    }
  };
  window.FX = FX;

  function init() {
    FX.stars(document.getElementById('stars'));
    if (window.UI) UI.route();
  }
  // stop the camera if the tab is hidden / app closed
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && window.Booth && Booth.stop) Booth.stop();
  });
  window.addEventListener('pagehide', function () { if (window.Booth && Booth.stop) Booth.stop(); });

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
