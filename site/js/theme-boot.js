// Sätter tema m.m. innan sidan ritas så att det inte blinkar. Läser samma värden som prefs.js speglar till localStorage. Standard = mörkt (som förut).
(function () {
  try {
    var u = JSON.parse(localStorage.getItem("cs2hub.ui") || "{}"), r = document.documentElement, t = u.theme || "dark";
    if (t === "system") t = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    r.dataset.theme = t === "light" ? "light" : "dark";
    r.dataset.density = u.density === "compact" ? "compact" : "normal";
    r.dataset.motion = ["on", "off"].indexOf(u.motion) >= 0 ? u.motion : "auto";
    r.dataset.cards = ["small", "large"].indexOf(u.cards) >= 0 ? u.cards : "normal";
  } catch (e) { /* ignorera */ }
})();
