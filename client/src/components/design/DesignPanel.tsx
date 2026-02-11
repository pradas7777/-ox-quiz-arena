"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDesignMode, type DesignOverride, type EditKind } from "@/contexts/DesignModeContext";
import { RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const COLOR_OPTIONS = [
  { label: "Primary", value: "text-primary" },
  { label: "Secondary", value: "text-secondary" },
  { label: "Muted", value: "text-muted-foreground" },
  { label: "Cyan", value: "text-cyan-400" },
  { label: "Magenta", value: "text-[#ff00ff]" },
  { label: "Green", value: "text-green-400" },
  { label: "Yellow", value: "text-yellow-400" },
  { label: "White", value: "text-white" },
];

const SPACING_OPTIONS = [
  { label: "없음", value: "" },
  { label: "p-2", value: "p-2" },
  { label: "p-4", value: "p-4" },
  { label: "p-6", value: "p-6" },
  { label: "px-4 py-2", value: "px-4 py-2" },
  { label: "gap-2", value: "gap-2" },
  { label: "gap-4", value: "gap-4" },
  { label: "gap-6", value: "gap-6" },
  { label: "mb-4", value: "mb-4" },
  { label: "mt-6", value: "mt-6" },
];

const LAYOUT_OPTIONS = [
  { label: "없음", value: "" },
  { label: "flex", value: "flex" },
  { label: "flex flex-col", value: "flex flex-col" },
  { label: "flex items-center", value: "flex items-center" },
  { label: "flex justify-between", value: "flex justify-between" },
  { label: "flex flex-wrap gap-4", value: "flex flex-wrap gap-4" },
  { label: "grid grid-cols-2", value: "grid grid-cols-2" },
  { label: "text-center", value: "text-center" },
];

export function DesignPanel() {
  const {
    enabled,
    selectedId,
    selectedKind,
    setSelected,
    getOverride,
    setOverride,
    clearOverride,
    clearAll,
  } = useDesignMode();

  const override = selectedId ? getOverride(selectedId) : undefined;
  const [text, setText] = useState(override?.text ?? "");
  const [colorClass, setColorClass] = useState(override?.colorClass ?? "");
  const [spacingClass, setSpacingClass] = useState(override?.spacingClass ?? "");
  const [layoutClass, setLayoutClass] = useState(override?.layoutClass ?? "");
  const [customClass, setCustomClass] = useState(override?.className ?? "");

  useEffect(() => {
    if (override) {
      setText(override.text ?? "");
      setColorClass(override.colorClass ?? "");
      setSpacingClass(override.spacingClass ?? "");
      setLayoutClass(override.layoutClass ?? "");
      setCustomClass(override.className ?? "");
    }
  }, [selectedId, override]);

  const apply = useCallback(() => {
    if (!selectedId) return;
    const patch: Partial<DesignOverride> = {};
    if (selectedKind === "text") patch.text = text;
    patch.colorClass = colorClass || undefined;
    patch.spacingClass = spacingClass || undefined;
    patch.layoutClass = layoutClass || undefined;
    patch.className = customClass || undefined;
    setOverride(selectedId, patch);
  }, [selectedId, selectedKind, text, colorClass, spacingClass, layoutClass, customClass, setOverride]);

  const resetOne = useCallback(() => {
    if (selectedId) clearOverride(selectedId);
    setSelected(null, null);
  }, [selectedId, clearOverride, setSelected]);

  if (!enabled) return null;
  if (!selectedId) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] rounded-lg border border-primary/50 bg-background/95 p-3 shadow-lg backdrop-blur">
        <p className="text-sm text-muted-foreground font-['Rajdhani']">
          요소를 클릭하여 편집
        </p>
      </div>
    );
  }

  return (
    <div className="fixed right-4 top-20 bottom-20 z-[9999] w-72 overflow-y-auto rounded-lg border border-primary/50 bg-background/95 p-4 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-['Orbitron'] text-sm font-bold text-primary">
          편집: {selectedId}
        </span>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={resetOne} title="이 요소 초기화">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setSelected(null, null)} title="닫기">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selectedKind === "text" && (
        <div className="mb-4">
          <Label className="text-xs font-['Rajdhani']">텍스트</Label>
          <Input
            className="mt-1 font-['Rajdhani']"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="내용 입력"
          />
        </div>
      )}

      <div className="mb-4">
        <Label className="text-xs font-['Rajdhani']">색상</Label>
        <select
          className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm font-['Rajdhani']"
          value={colorClass}
          onChange={(e) => setColorClass(e.target.value)}
        >
          {COLOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <Label className="text-xs font-['Rajdhani']">간격 (padding / margin / gap)</Label>
        <select
          className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm font-['Rajdhani']"
          value={spacingClass}
          onChange={(e) => setSpacingClass(e.target.value)}
        >
          {SPACING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <Label className="text-xs font-['Rajdhani']">레이아웃</Label>
        <select
          className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm font-['Rajdhani']"
          value={layoutClass}
          onChange={(e) => setLayoutClass(e.target.value)}
        >
          {LAYOUT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <Label className="text-xs font-['Rajdhani']">추가 클래스 (Tailwind)</Label>
        <Input
          className="mt-1 font-mono text-xs"
          value={customClass}
          onChange={(e) => setCustomClass(e.target.value)}
          placeholder="예: rounded-lg shadow"
        />
      </div>

      <Button className="w-full font-['Orbitron']" onClick={apply}>
        적용
      </Button>
    </div>
  );
}
