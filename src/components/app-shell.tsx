"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, Settings2, Utensils } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ChromeBackLink } from "@/components/chrome-back";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/week", label: "This week", icon: Utensils },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/list", label: "List", icon: ClipboardList },
  { href: "/settings", label: "House", icon: Settings2 },
];

export function WeekTitleRow({
  title,
  titleAside,
  titleAction,
  className,
}: {
  title: string;
  titleAside?: ReactNode;
  titleAction?: ReactNode;
  className?: string;
}) {
  if (!titleAside && !titleAction) {
    return <h1 className={cn("type-title text-foreground", className)}>{title}</h1>;
  }
  return (
    <div
      data-slot="week-title-row"
      className={cn("flex items-center justify-between gap-2", className)}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="type-title text-foreground">{title}</h1>
        {titleAside}
      </div>
      {titleAction ? <div className="shrink-0">{titleAction}</div> : null}
    </div>
  );
}

export function AppShell({
  title,
  eyebrow,
  eyebrowMuted = false,
  backHref,
  backLabel = "This week",
  chrome,
  status,
  titleAside,
  titleAction,
  footer,
  hideNav = false,
  children,
}: {
  title: string;
  eyebrow?: string;
  eyebrowMuted?: boolean;
  backHref?: string;
  backLabel?: string;
  /** Flush under the title row, inside the same sticky block as the header. */
  chrome?: ReactNode;
  status?: ReactNode;
  titleAside?: ReactNode;
  /** Right side of the title row. Edit nights lives here, not on its own band. */
  titleAction?: ReactNode;
  footer?: ReactNode;
  hideNav?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const headRef = useRef<HTMLDivElement>(null);
  const [headH, setHeadH] = useState(0);

  useLayoutEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const update = () => setHeadH(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="mx-auto flex min-h-dvh w-full min-w-0 max-w-lg flex-col bg-background"
      style={{ "--shell-head-h": `${headH}px` } as CSSProperties}
    >
      <div
        ref={headRef}
        className={cn(
          "sticky top-0 z-20 pt-[env(safe-area-inset-top)]",
          chrome ? "bg-card" : "bg-card/95 backdrop-blur-md",
        )}
      >
        <header className={cn("px-5 pt-2", chrome ? "pb-0" : "pb-3")} data-slot="app-header">
          <BrandMark size="compact" />
          {backHref ? <ChromeBackLink href={backHref} label={backLabel} /> : null}
          {eyebrow ? (
            <p
              className={cn(
                "type-eyebrow",
                backHref ? "text-muted-foreground" : "mt-3 text-primary",
                eyebrowMuted && "!text-muted-foreground",
              )}
            >
              {eyebrow}
            </p>
          ) : null}
          <WeekTitleRow
            title={title}
            titleAside={titleAside}
            titleAction={titleAction}
            className={!eyebrow && !backHref ? "mt-2" : undefined}
          />
        </header>
        {chrome ? <div data-slot="shell-chrome">{chrome}</div> : null}
        {status}
      </div>
      <main
        className={cn(
          "min-w-0 flex-1 px-4 pt-4",
          footer
            ? hideNav
              ? "pb-20"
              : "pb-[calc(5rem+env(safe-area-inset-bottom))]"
            : hideNav
              ? "pb-10"
              : "pb-36",
        )}
      >
        {children}
      </main>
      {footer ? (
        <div
          className={cn(
            "sticky z-20 bg-background/85 px-4 py-2 backdrop-blur-md",
            hideNav
              ? "bottom-0 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
              : "bottom-[calc(3.75rem+env(safe-area-inset-bottom))]",
          )}
        >
          {footer}
        </div>
      ) : null}
      {hideNav ? null : (
      <nav
        data-slot="app-tabs"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/80 bg-card/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-md"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "tap-target type-nav flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-button)]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
      )}
    </div>
  );
}
