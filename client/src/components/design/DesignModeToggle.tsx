"use client";

import { Button } from "@/components/ui/button";
import { useDesignMode } from "@/contexts/DesignModeContext";
import { Palette } from "lucide-react";

export function DesignModeToggle() {
  const { enabled, setEnabled, clearAll } = useDesignMode();

  return (
    <div className="fixed bottom-4 left-4 z-[9999] flex flex-col gap-2">
      <Button
        size="sm"
        variant={enabled ? "default" : "outline"}
        className="gap-2 font-['Orbitron']"
        onClick={() => setEnabled(!enabled)}
      >
        <Palette className="h-4 w-4" />
        {enabled ? "디자인 모드 ON" : "디자인 모드"}
      </Button>
      {enabled && (
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-muted-foreground"
          onClick={clearAll}
        >
          전체 초기화
        </Button>
      )}
    </div>
  );
}
