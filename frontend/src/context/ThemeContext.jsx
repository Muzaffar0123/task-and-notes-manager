import { useEffect, useState } from "react";
import ThemeContext from "./ThemeContext";
const storageKey = "taskflow_theme";
const availableThemes = ["light", "dark", "system"];

function readThemePreference() {
  try {
    const savedTheme = localStorage.getItem(storageKey);
    return availableThemes.includes(savedTheme) ? savedTheme : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readThemePreference);
  const [systemTheme, setSystemTheme] = useState(() =>
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) return undefined;

    function updateSystemTheme(event) {
      setSystemTheme(event.matches ? "dark" : "light");
    }

    mediaQuery.addEventListener("change", updateSystemTheme);
    return () => mediaQuery.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  function setTheme(nextTheme) {
    if (!availableThemes.includes(nextTheme)) return;
    setThemeState(nextTheme);
    try {
      localStorage.setItem(storageKey, nextTheme);
    } catch {
      // Theme still applies for the current session when storage is unavailable.
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
