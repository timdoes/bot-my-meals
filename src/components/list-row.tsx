import { Checkbox } from "@/components/ui/checkbox";
import { FOOD_RULE_CHECK_LABEL } from "@/lib/food-rule-check";
import { cn } from "@/lib/utils";

export function ListRow({
  name,
  quantity,
  checked,
  onCheckedChange,
  checkLabel,
}: {
  name: string;
  quantity: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  checkLabel?: "allergy" | "intolerance" | null;
}) {
  return (
    <li data-slot="list-row" className="flex min-h-12 items-center gap-3 px-1">
      <Checkbox
        checked={checked}
        className="size-5 data-checked:border-approve data-checked:bg-approve data-checked:text-approve-foreground"
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={`Got ${name}`}
      />
      <span className={cn("type-body flex-1", checked && "text-muted-foreground line-through")}>
        {name}
      </span>
      {checkLabel ? (
        <span
          data-slot="food-rule-check-label"
          data-severity={checkLabel}
          className={cn(
            "type-chip shrink-0 rounded-full border px-2 py-0.5",
            checkLabel === "allergy"
              ? "border-destructive/40 text-destructive"
              : "border-[color:var(--swap)]/40 text-swap",
          )}
        >
          {FOOD_RULE_CHECK_LABEL}
        </span>
      ) : null}
      <span className="type-meta font-mono text-muted-foreground">{quantity}</span>
    </li>
  );
}
