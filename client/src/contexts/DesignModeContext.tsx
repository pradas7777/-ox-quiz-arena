"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "design-overrides";

export type EditKind = "text" | "box";

export type DesignOverride = {
  text?: string;
  className?: string;
  /** Tailwind-style color class (text-*, bg-*) */
  colorClass?: string;
  /** p-4, px-2, m-4, gap-4 etc. */
  spacingClass?: string;
  /** flex, flex-col, grid, items-center, justify-between etc. */
  layoutClass?: string;
};

type OverridesStore = Record<string, DesignOverride>;

function loadOverrides(): OverridesStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as OverridesStore;
  } catch (_) {}
  return {};
}

function saveOverrides(store: OverridesStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {}
}

type DesignModeContextValue = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  overrides: OverridesStore;
  selectedId: string | null;
  selectedKind: EditKind | null;
  setSelected: (id: string | null, kind: EditKind | null) => void;
  setOverride: (id: string, patch: Partial<DesignOverride>) => void;
  getOverride: (id: string) => DesignOverride | undefined;
  clearOverride: (id: string) => void;
  clearAll: () => void;
  /** Build full className from override (color + spacing + layout + className) */
  mergeClassName: (id: string, baseClassName: string) => string;
};

const DesignModeContext = createContext<DesignModeContextValue | null>(null);

export function DesignModeProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [overrides, setOverrides] = useState<OverridesStore>(loadOverrides);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<EditKind | null>(null);

  const setOverride = useCallback((id: string, patch: Partial<DesignOverride>) => {
    setOverrides((prev) => {
      const next = { ...prev, [id]: { ...prev[id], ...patch } };
      saveOverrides(next);
      return next;
    });
  }, []);

  const getOverride = useCallback(
    (id: string) => overrides[id],
    [overrides]
  );

  const clearOverride = useCallback((id: string) => {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      saveOverrides(next);
      return next;
    });
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedKind(null);
    }
  }, [selectedId]);

  const clearAll = useCallback(() => {
    setOverrides({});
    saveOverrides({});
    setSelectedId(null);
    setSelectedKind(null);
  }, []);

  const mergeClassName = useCallback(
    (id: string, baseClassName: string) => {
      const o = overrides[id];
      if (!o) return baseClassName;
      const parts = [
        baseClassName,
        o.colorClass,
        o.spacingClass,
        o.layoutClass,
        o.className,
      ].filter(Boolean);
      return parts.join(" ");
    },
    [overrides]
  );

  const setSelected = useCallback((id: string | null, kind: EditKind | null) => {
    setSelectedId(id);
    setSelectedKind(kind);
  }, []);

  const value = useMemo<DesignModeContextValue>(
    () => ({
      enabled,
      setEnabled,
      overrides,
      selectedId,
      selectedKind,
      setSelected,
      setOverride,
      getOverride,
      clearOverride,
      clearAll,
      mergeClassName,
    }),
    [
      enabled,
      overrides,
      selectedId,
      selectedKind,
      setSelected,
      setOverride,
      getOverride,
      clearOverride,
      clearAll,
      mergeClassName,
    ]
  );

  return (
    <DesignModeContext.Provider value={value}>
      {children}
    </DesignModeContext.Provider>
  );
}

export function useDesignMode() {
  const ctx = useContext(DesignModeContext);
  if (!ctx) throw new Error("useDesignMode must be used within DesignModeProvider");
  return ctx;
}
