(function () {
  var root = document.documentElement;
  var KEY = "jsm-theme";

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    var icons = document.querySelectorAll("[data-theme-icon]");
    var labels = document.querySelectorAll("[data-theme-label]");
    for (var i = 0; i < icons.length; i++) {
      icons[i].textContent = theme === "light" ? "🌙" : "☀️";
    }
    for (var j = 0; j < labels.length; j++) {
      labels[j].textContent = theme === "light" ? "Dark" : "Light";
    }
    try {
      localStorage.setItem(KEY, theme);
    } catch (e) {}
  }

  function current() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function init() {
    var saved = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch (e) {}
    if (saved === "light" || saved === "dark") {
      applyTheme(saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      applyTheme("light");
    } else {
      applyTheme("dark");
    }

    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("[data-theme-toggle]");
      if (!btn) return;
      applyTheme(current() === "dark" ? "light" : "dark");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
