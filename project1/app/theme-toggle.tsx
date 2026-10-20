"use client";

import { useEffect, useSyncExternalStore } from "react";

const themeStorageKey = "supper-club-theme";
const themeChangeEvent = "supper-club-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(themeChangeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(themeChangeEvent, onChange);
  };
}

function getSnapshot() {
  return localStorage.getItem(themeStorageKey) === "dark";
}

function getServerSnapshot() {
  return false;
}

export default function ThemeToggle() {
  const darkMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);

  function toggleTheme() {
    const nextDarkMode = !darkMode;
    localStorage.setItem(themeStorageKey, nextDarkMode ? "dark" : "light");
    document.documentElement.dataset.theme = nextDarkMode ? "dark" : "light";
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
      aria-pressed={darkMode}
      onClick={toggleTheme}
    >
      {darkMode ? (
        <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <path d="M12 2v2.3M12 19.7V22M4.93 4.93l1.63 1.63m10.88 10.88 1.63 1.63M2 12h2.3m15.4 0H22M4.93 19.07l1.63-1.63M17.44 6.56l1.63-1.63" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.7 8.7 0 1 0 20.2 15.1Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
