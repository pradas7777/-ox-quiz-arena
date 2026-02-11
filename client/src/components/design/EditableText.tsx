"use client";

import { useDesignMode } from "@/contexts/DesignModeContext";
import type { EditKind } from "@/contexts/DesignModeContext";
import { useCallback } from "react";

type EditableTextProps = {
  id: string;
  kind?: EditKind;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "div" | "label";
};

export function EditableText({
  id,
  kind = "text",
  children,
  className = "",
  style,
  as: Tag = "span",
}: EditableTextProps) {
  const { enabled, getOverride, mergeClassName, setSelected } = useDesignMode();
  const override = getOverride(id);
  const displayText = override?.text !== undefined ? override?.text : children;
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
      className={mergedClass + (enabled ? " cursor-pointer ring-2 ring-primary/50 ring-offset-2 ring-offset-background rounded" : "")}
      style={style}
      onClick={handleClick}
    >
      {typeof displayText === "string" ? displayText : displayText}
    </Tag>
  );
}
