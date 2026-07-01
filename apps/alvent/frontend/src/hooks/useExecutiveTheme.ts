"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "executive_theme";

export function useExecutiveTheme() {
  const [isExecutiveDark, setIsExecutiveDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    const next = stored === "dark";
    setIsExecutiveDark(next);
  }, []);

  useEffect(() => {
    if (isExecutiveDark) {
      document.body.setAttribute("data-theme", "executive-dark");
      localStorage.setItem(THEME_KEY, "dark");
      return;
    }

    document.body.removeAttribute("data-theme");
    localStorage.setItem(THEME_KEY, "light");
  }, [isExecutiveDark]);

  const toggleExecutiveTheme = () => {
    setIsExecutiveDark((prev) => !prev);
  };

  return {
    isExecutiveDark,
    toggleExecutiveTheme,
  };
}
