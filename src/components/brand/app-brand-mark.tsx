import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function AppBrandMark({
  className,
  nameClassName,
  betaClassName,
}: {
  className?: string;
  nameClassName?: string;
  betaClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-start gap-1.5 leading-none", className)}>
      <span className={cn("font-semibold tracking-tight", nameClassName)}>{APP_NAME}</span>
      <sup className={cn("brand-beta-sup", betaClassName)}>BETA</sup>
    </span>
  );
}
