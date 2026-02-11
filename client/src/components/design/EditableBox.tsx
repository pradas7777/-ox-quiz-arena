"use client";

import { useDesignMode } from "@/contexts/DesignModeContext";
import type { EditKind } from "@/contexts/DesignModeContext";
import { useCallback } from "react";

type EditableBoxProps = {
  id: string;
  kind?: EditKind;
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section" | "header" | "footer" | "main" | "article" | "aside" | "span";
};

export function EditableBox({
  id,
  kind = "box",
  className = "",
  children,
  as: Tag = "div",
}: EditableBoxProps) {
  const { enabled, mergeClassName, setSelected } = useDesignMode();
  const mergedClass = mergeClassName(id, className);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (enabled) {
        e.preventDefault();
        e.stopPropagation();
        setSelected(id, kind);
      }
    },
    [enabled, id, kind, setSelected]
  );

  return (
    <Tag
      data-edit-id={id}
      data-edit-kind={kind}
      className={mergedClass + (enabled ? " cursor-pointer ring-2 ring-primary/50 ring-offset-2 ring-offset-background rounded outline-none" : "")}
      onClick={handleClick}
    >
      {children}
    </Tag>
  );
}
