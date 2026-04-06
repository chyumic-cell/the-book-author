import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[color:var(--line)] bg-[color:var(--panel)] p-4 shadow-[0_12px_28px_var(--shadow)]",
        className,
      )}
      {...props}
    />
  );
}
