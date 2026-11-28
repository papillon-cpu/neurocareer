(function () {
  var root = document.documentElement;
  try {
    var t = localStorage.getItem("theme") === "light" ? "light" : "dark";
    root.dataset.theme = t;
    root.style.colorScheme = t;
  } catch (e) {
    root.dataset.theme = "dark";
    root.style.colorScheme = "dark";
  }

  var btn = document.querySelector("[data-theme-toggle]");
  if (btn) {
    btn.addEventListener("click", function () {
      var next = root.dataset.theme === "light" ? "dark" : "light";
      root.dataset.theme = next;
      root.style.colorScheme = next;
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
    });
  }
})();
