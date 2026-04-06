import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Chip({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-[color:var(--line)] bg-[color:var(--panel-soft)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
