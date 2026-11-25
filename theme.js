
(() => {
  const KEY = "herald_theme";
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  if (saved === "light" || saved === "dark") root.dataset.theme = saved;

  const current = () =>
    root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  function updateButton(btn) {
    const dark = current() === "dark";
    btn.textContent = dark ? "☀" : "☾";
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.title = btn.getAttribute("aria-label");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    updateButton(btn);
    btn.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch {}
      updateButton(btn);
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => updateButton(btn));
  });
})();
