"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "zecpass.theme";

/**
 * Optional dark-mode switch. Light is the default and main mode; dark is opt-in
 * and remembered per browser. The initial attribute is set by a tiny inline
 * script in the layout (before paint), so this only has to stay in sync with it.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    if (next) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Storage blocked: the choice just will not persist across reloads.
    }
  };

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
      {dark ? "Light" : "Dark"}
    </button>
  );
}
