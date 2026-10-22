"use client";

import { formatMealCardDayLabel } from "@/lib/dates";
import { weekStripCells, type WeekStripCell, type WeekStripNight } from "@/lib/week-strip";
import { cn } from "@/lib/utils";

const cellGeometry =
  "relative z-20 flex h-[44px] min-h-[44px] min-w-[44px] flex-1 basis-0 shrink-0 flex-col items-center justify-start gap-0.5 rounded-[12px] px-0.5 pt-0.5 leading-none";

export function WeekStrip({
  startsOn,
  nights,
  selectedMealId,
  todayIso,
  locked = false,
  mutedDates = [],
  onSelect,
  interactive = true,
}: {
  startsOn: string;
  nights: readonly WeekStripNight[];
  selectedMealId: string | null;
  todayIso: string;
  locked?: boolean;
  mutedDates?: readonly string[];
  onSelect: (mealId: string) => void;
  /** List: cells look the same but are not buttons (no per-day action). */
  interactive?: boolean;
}) {
  const cells = weekStripCells(startsOn, nights);
  const muted = new Set(mutedDates);

  return (
    <div
      data-slot="week-strip"
      data-locked={locked ? "true" : "false"}
      className="overflow-hidden px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        role="group"
        aria-label={interactive ? "Jump to a night" : "Nights this week"}
        className="flex w-max min-w-full gap-2">
        {cells.map((cell) => {
          if (!cell.hasMeal || !cell.mealId) {
            return (
              <EmptyStripCell
                key={cell.nightDate}
                cell={cell}
                past={muted.has(cell.nightDate) || cell.nightDate < todayIso}
              />
            );
          }
          return (
            <MealStripCell
              key={cell.nightDate}
              cell={cell}
              mealId={cell.mealId}
              selected={cell.mealId === selectedMealId}
              today={cell.nightDate === todayIso}
              past={muted.has(cell.nightDate) || cell.nightDate < todayIso}
              onSelect={onSelect}
              interactive={interactive}
            />
          );
        })}
      </div>
    </div>
  );
}

function EmptyStripCell({ cell, past }: { cell: WeekStripCell; past: boolean }) {
  return (
    <div
      data-slot="week-strip-cell"
      data-selectable="false"
      data-empty="true"
      data-today="false"
      data-past={past ? "true" : "false"}
      data-selected="false"
      className={cn(cellGeometry, "text-muted-foreground/60")}
    >
      <StripCellFace cell={cell} emphasis={false} />
    </div>
  );
}

function MealStripCell({
  cell,
  mealId,
  selected,
  today,
  past,
  onSelect,
  interactive,
}: {
  cell: WeekStripCell;
  mealId: string;
  selected: boolean;
  today: boolean;
  past: boolean;
  onSelect: (mealId: string) => void;
  interactive: boolean;
}) {
  const label = formatMealCardDayLabel(cell.nightDate);
  // One selected-day style (filled blue); today is a dot under the date.
  const face = (
    <>
      <StripCellFace cell={cell} emphasis />
      {today ? (
        <span
          aria-hidden
          data-slot="week-strip-today-dot"
          className={cn(
            "absolute bottom-0 left-1/2 size-1 -translate-x-1/2 rounded-full",
            selected ? "bg-primary-foreground" : "bg-primary",
          )}
        />
      ) : null}
    </>
  );
  const tone = cn(
    cellGeometry,
    "text-foreground",
    past && !selected && "text-muted-foreground",
    selected && "bg-primary text-primary-foreground",
  );
  if (!interactive) {
    return (
      <div
        data-slot="week-strip-cell"
        data-selectable="false"
        data-empty="false"
        data-meal-id={mealId}
        data-today={today ? "true" : "false"}
        data-past={past ? "true" : "false"}
        data-selected={selected ? "true" : "false"}
        aria-current={today ? "date" : undefined}
        aria-label={label}
        className={tone}
      >
        {face}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-slot="week-strip-cell"
      data-selectable="true"
      data-empty="false"
      data-meal-id={mealId}
      data-today={today ? "true" : "false"}
      data-past={past ? "true" : "false"}
      data-selected={selected ? "true" : "false"}
      aria-pressed={selected}
      aria-current={today ? "date" : undefined}
      aria-label={past ? `${label}, read only` : label}
      onClick={() => onSelect(mealId)}
      className={cn(tone, "cursor-pointer")}
    >
      {face}
    </button>
  );
}

function StripCellFace({ cell, emphasis }: { cell: WeekStripCell; emphasis: boolean }) {
  const weight = emphasis ? "font-semibold" : "font-medium";
  return (
    <>
      <span className={cn("text-[11px] leading-none", weight)}>{cell.letter}</span>
      <span className={cn("text-sm leading-none", weight)}>{cell.day}</span>
      {cell.month ? (
        <span
          className={cn(
            "absolute inset-x-0 bottom-0.5 text-center text-[10px] leading-none",
            weight,
            emphasis && "opacity-80",
          )}
        >
          {cell.month}
        </span>
      ) : null}
    </>
  );
}
