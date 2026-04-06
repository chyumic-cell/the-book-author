import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--accent-rgb),0.35)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_8px_18px_rgba(var(--accent-rgb),0.18)] hover:bg-[var(--accent-strong)] hover:border-[var(--accent-strong)]",
        variant === "secondary" &&
          "border-[color:var(--line)] bg-white text-[var(--text)] hover:border-[color:rgba(var(--accent-rgb),0.35)] hover:bg-[color:var(--panel-soft)]",
        variant === "ghost" &&
          "border-transparent bg-transparent text-[var(--muted)] hover:border-[color:var(--line)] hover:bg-[color:var(--panel-soft)] hover:text-[var(--text)]",
        variant === "danger" && "border-rose-700 bg-rose-700 text-white hover:bg-rose-800",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
