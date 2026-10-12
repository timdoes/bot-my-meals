/**
 * NAV-TABS lock §1/§5 redirects. Recipes tab is gone (`/recipes` → `/week`, no `/meals` alias).
 * House moved to `/house`; `/settings` is now the Settings page itself, so only its old subpages redirect.
 * Query strings pass through, so `?week=next` / `?past=` survive.
 */
export const NAV_REDIRECTS: readonly { source: string; destination: string; permanent: false }[] = [
  { source: "/recipes", destination: "/week", permanent: false },
  { source: "/settings/saved", destination: "/house/favorites", permanent: false },
  { source: "/settings/food-rules", destination: "/house/food-rules", permanent: false },
  { source: "/settings/never-again", destination: "/house/food-rules#meals", permanent: false },
  { source: "/settings/history", destination: "/house/past-weeks", permanent: false },
  { source: "/settings/history/:startsOn", destination: "/house/past-weeks/:startsOn", permanent: false },
];
