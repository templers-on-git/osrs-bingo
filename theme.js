// Dark/light theme toggle, shared across index.html/login.html/dev.html.
// Persisted in localStorage; falls back to the OS-level preference the
// first time a browser has no saved choice yet.
const STORAGE_KEY = "bingo-theme";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function initTheme(toggleBtn) {
  const saved = localStorage.getItem(STORAGE_KEY);
  const theme = saved ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  applyTheme(theme);
  toggleBtn.textContent = theme === "light" ? "🌙" : "☀️";

  toggleBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    toggleBtn.textContent = next === "light" ? "🌙" : "☀️";
  });
}
