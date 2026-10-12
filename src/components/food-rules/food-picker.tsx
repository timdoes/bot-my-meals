"use client";

import { ALLERGEN_LABELS, allergenLabel, foodKeyFromLabel } from "@/lib/food-rules";
import { textHasTerm, normText } from "@/lib/food-rule-match";
import { ALLERGEN_CODES, type AllergenCode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOOD_FIELD_LABEL, FOOD_FIELD_PLACEHOLDER } from "./copy";

export function allergenCodeForLabel(label: string): AllergenCode | null {
  const key = foodKeyFromLabel(label);
  if (!key) return null;
  for (const code of ALLERGEN_CODES) {
    if (foodKeyFromLabel(ALLERGEN_LABELS[code]) === key) return code;
  }
  const norm = normText(label);
  for (const code of ALLERGEN_CODES) {
    if (textHasTerm(norm, ALLERGEN_LABELS[code])) return code;
  }
  return null;
}

export function FoodPicker({
  value,
  allergenCode,
  onChange,
  disabled = false,
  id = "food-rule-food",
}: {
  value: string;
  allergenCode: AllergenCode | null;
  onChange: (next: { foodLabel: string; allergenCode: AllergenCode | null }) => void;
  disabled?: boolean;
  id?: string;
}) {
  const selected = allergenCode ?? allergenCodeForLabel(value);

  return (
    <div data-slot="food-picker" className="space-y-2">
      <Label htmlFor={id} className="type-meta text-muted-foreground">
        {FOOD_FIELD_LABEL}
      </Label>
      <div role="radiogroup" aria-label={FOOD_FIELD_LABEL} className="flex flex-wrap gap-2">
        {ALLERGEN_CODES.map((code) => {
          const active = selected === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              data-slot="allergen-chip"
              data-allergen={code}
              disabled={disabled}
              onClick={() => {
                if (active) {
                  onChange({ foodLabel: "", allergenCode: null });
                  return;
                }
                onChange({ foodLabel: allergenLabel(code), allergenCode: code });
              }}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              {allergenLabel(code)}
            </button>
          );
        })}
      </div>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder={FOOD_FIELD_PLACEHOLDER}
        maxLength={60}
        onChange={(event) => {
          const foodLabel = event.target.value;
          onChange({ foodLabel, allergenCode: allergenCodeForLabel(foodLabel) });
        }}
        className="h-11 min-h-11 rounded-[14px] px-4"
      />
    </div>
  );
}
