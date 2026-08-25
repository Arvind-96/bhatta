import { useEffect, useState } from "react";

const STORAGE_KEY = "bhatta_theme";

// The .dark CSS variable block in index.css has existed since the design
// tokens were first written, but nothing in the app ever toggled the
// class that activates it -- this is the first real switch. Falls back to
// the OS-level preference on first visit, then remembers whatever the
// admin picked after that.
function getInitialIsDark(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark") return true;
    if (stored === "light") return false;
  } catch {
    // localStorage unavailable (private browsing, etc.) -- fall through to OS preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function useTheme() {
  const [isDark, setIsDark] = useState(getInitialIsDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
    } catch {
      // Ignore -- theme still applies for this session even if it can't persist.
    }
  }, [isDark]);

  return { isDark, toggleTheme: () => setIsDark((d) => !d) };
}
