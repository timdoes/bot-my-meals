"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSupper } from "@/components/supper-provider";
import { navigatorHref } from "@/lib/week-navigator";
import { selectionFromSearch } from "@/lib/week-session";

/**
 * Meals and List share one selected week (NAV-TABS lock §3). `?week=next` / `?past=` in the URL wins;
 * with no (or a stale) param, keep the shared week and write it into the URL so reload and share keep it.
 */
export function useWeekUrlSync(base: "/week" | "/list") {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { snapshot, viewedWeek, setViewedWeek } = useSupper();
  const viewedRef = useRef(viewedWeek);
  useEffect(() => {
    viewedRef.current = viewedWeek;
  }, [viewedWeek]);
  const searchKey = searchParams.toString();
  const pastStartsOn = snapshot?.mealHistory.map((week) => week.startsOn) ?? [];
  const known = snapshot ? `${Boolean(snapshot.planning)}|${pastStartsOn.join(",")}` : null;

  useEffect(() => {
    if (known == null) return;
    const params = new URLSearchParams(searchKey);
    if (params.get("setup")) return;
    const [hasPlanning, past] = known.split("|");
    const selection = selectionFromSearch(params, {
      hasPlanning: hasPlanning === "true",
      pastStartsOn: past ? past.split(",") : [],
    });
    if (selection) {
      setViewedWeek(selection);
      return;
    }
    const want = navigatorHref(viewedRef.current, base);
    const now = searchKey ? `${base}?${searchKey}` : base;
    if (want !== now) router.replace(want, { scroll: false });
  }, [base, known, router, searchKey, setViewedWeek]);
}
