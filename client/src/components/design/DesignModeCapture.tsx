"use client";

import { useDesignMode } from "@/contexts/DesignModeContext";
import type { EditKind } from "@/contexts/DesignModeContext";
import { useEffect } from "react";

export function DesignModeCapture() {
  const { enabled, setSelected } = useDesignMode();

  useEffect(() => {
    if (!enabled) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const el = target.closest("[data-edit-id]") as HTMLElement | null;
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        const id = el.getAttribute("data-edit-id");
        const kind = (el.getAttribute("data-edit-kind") as EditKind) || "box";
        if (id) setSelected(id, kind);
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [enabled, setSelected]);

  return null;
}
