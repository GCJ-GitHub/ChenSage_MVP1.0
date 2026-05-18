"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { themeTokens, type ThemeTokens } from "./theme-config";

interface ThemeCtx {
  dark: boolean;
  toggle: () => void;
  t: ThemeTokens;
}

const ThemeCtx = createContext<ThemeCtx>({
  dark: true,
  toggle: () => {},
  t: themeTokens.dark,
});

export function useThemeConfig() {
  const { t } = useContext(ThemeCtx);
  return t;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("chenshu-dark");
    const next = stored === null ? true : stored === "true";
    document.documentElement.classList.toggle("dark", next);
    queueMicrotask(() => setDark(next));
  }, []);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("chenshu-dark", String(next));
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);

  const t = dark ? themeTokens.dark : themeTokens.light;

  return (
    <ThemeCtx.Provider value={{ dark, toggle, t }}>
      {children}
    </ThemeCtx.Provider>
  );
}
