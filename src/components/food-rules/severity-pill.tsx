import { severityLabel } from "@/lib/food-rules";
import type { FoodRuleSeverity } from "@/lib/types";
import { cn } from "@/lib/utils";

export function severityPillClass(severity: FoodRuleSeverity): string {
  switch (severity) {
    case "allergy":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "intolerance":
      return "border-swap/40 bg-swap/10 text-swap";
    case "dislike":
      return "border-border bg-muted text-muted-foreground";
    default: {
      const _exhaustive: never = severity;
      return _exhaustive;
    }
  }
}

export function SeverityPill({
  severity,
  className,
}: {
  severity: FoodRuleSeverity;
  className?: string;
}) {
  return (
    <span
      data-slot="severity-pill"
      data-severity={severity}
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold",
        severityPillClass(severity),
        className,
      )}
    >
      {severityLabel(severity)}
    </span>
  );
}
