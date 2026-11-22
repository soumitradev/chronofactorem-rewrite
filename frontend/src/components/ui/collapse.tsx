import type * as React from "react";
import { cn } from "@/lib/utils";

export function Collapse({
  id,
  open,
  children,
  onExited,
  appearOpen,
}: {
  id?: string;
  open: boolean;
  children: React.ReactNode;
  onExited?: () => void;
  appearOpen?: boolean;
}) {
  return (
    <div
      id={id}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-(--d-2) ease-(--e-out)",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        appearOpen && "starting:grid-rows-[1fr] starting:opacity-100",
      )}
      // still fires under reduced motion, whose transitions last 0.01ms
      onTransitionEnd={(e) => {
        if (
          e.target === e.currentTarget &&
          e.propertyName === "grid-template-rows" &&
          !open
        ) {
          onExited?.();
        }
      }}
    >
      <div
        className="min-h-0 overflow-hidden"
        inert={!open}
        aria-hidden={!open || undefined}
      >
        {children}
      </div>
    </div>
  );
}
