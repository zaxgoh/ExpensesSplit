"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "1stsplit:theme";

/** Applies the stored theme before first paint to avoid a flash of the wrong theme. */
export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}`,
      }}
    />
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    if (current === "light" || current === "dark") setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable; the theme still applies for this session.
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </Button>
  );
}
