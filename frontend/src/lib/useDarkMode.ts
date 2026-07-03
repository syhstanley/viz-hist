import { useEffect, useState } from "react";

/**
 * Observe the .dark class on <html> and return the current state.
 * Reacts to changes from any source (toggle button, system preference, etc).
 */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from DOM on mount
    setDark(html.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setDark(html.classList.contains("dark"));
    });
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return dark;
}
