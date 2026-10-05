"use client";

import { useEffect, useState } from "react";

export interface ThemeColors {
  series: string;
  seriesFill: string;
  rival: string;
  grid: string;
  muted: string;
  fg: string;
  surface: string;
  border: string;
  gain: string;
  loss: string;
  accent: string;
}

const FALLBACK: ThemeColors = {
  series: "#0a1a33",
  seriesFill: "#ffd60a",
  rival: "#5878a3",
  grid: "#e3e9f2",
  muted: "#52627a",
  fg: "#0a1a33",
  surface: "#ffffff",
  border: "#d5dde9",
  gain: "#00866f",
  loss: "#d6303a",
  accent: "#ffd60a",
};

function read(): ThemeColors {
  const el = document.querySelector(".app") ?? document.documentElement;
  const style = getComputedStyle(el);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    series: v("--series", FALLBACK.series),
    seriesFill: v("--series-fill", FALLBACK.seriesFill),
    rival: v("--rival", FALLBACK.rival),
    grid: v("--grid", FALLBACK.grid),
    muted: v("--muted", FALLBACK.muted),
    fg: v("--fg", FALLBACK.fg),
    surface: v("--surface", FALLBACK.surface),
    border: v("--border", FALLBACK.border),
    gain: v("--gain", FALLBACK.gain),
    loss: v("--loss", FALLBACK.loss),
    accent: v("--accent", FALLBACK.accent),
  };
}

/**
 * Chart libraries need literal colours, so read the theme's tokens and read
 * them again whenever the theme or the system preference changes.
 */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);

  useEffect(() => {
    const update = () => setColors(read());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);

  return colors;
}
