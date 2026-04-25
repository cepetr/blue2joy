import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import "./theme.css";

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-bs-theme", theme);
}

export function currentTheme(): Theme {
  return (
    (document.documentElement.getAttribute("data-bs-theme") as Theme) ?? "light"
  );
}

export function toggleTheme() {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
  window.dispatchEvent(new CustomEvent("themechange", { detail: next }));
}

// Init: use stored preference, fall back to system
const stored = localStorage.getItem("theme") as Theme | null;
applyTheme(stored ?? systemTheme());

// Track system changes when no manual preference is set
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (!localStorage.getItem("theme")) {
      applyTheme(systemTheme());
      window.dispatchEvent(
        new CustomEvent("themechange", { detail: systemTheme() }),
      );
    }
  });
