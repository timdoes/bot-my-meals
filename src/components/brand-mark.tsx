import { PRODUCT_TAGLINE } from "@/lib/config";
import { BRAND_MARK_SRC } from "@/lib/theme";
import { cn } from "@/lib/utils";

const MARK_SIZE = {
  hero: "size-16",
  compact: "size-9",
  wordmark: "size-10",
} as const;

const WORDMARK_CLASS = {
  hero: "text-[32px] leading-9",
  compact: "text-[20px] leading-6",
  wordmark: "text-[22px] leading-7",
} as const;

export function BrandMark({
  align = "start",
  size = "hero",
  tagline,
}: {
  align?: "start" | "center";
  size?: "hero" | "compact" | "wordmark";
  tagline?: boolean;
}) {
  const showTagline = tagline ?? size === "hero";

  return (
    <div className={cn(align === "center" && "text-center")}>
      <div
        className={cn(
          "inline-flex items-center",
          size === "hero" ? "gap-3" : "gap-2.5",
          align === "center" && "mx-auto",
        )}
      >
        {/* Cos chef mark PNG — wordmark is HTML, not in the file. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- next/image is wrong for this static mark beside an HTML wordmark */}
        <img src={BRAND_MARK_SRC} alt="" className={cn("shrink-0", MARK_SIZE[size])} />
        <p
          className={cn(
            "font-heading font-bold tracking-tight whitespace-nowrap",
            WORDMARK_CLASS[size],
          )}
        >
          <span className="text-primary">Bot</span>{" "}
          <span className="text-approve">My Meals</span>
        </p>
      </div>
      {showTagline ? (
        <p
          className={cn(
            "text-muted-foreground",
            size === "compact" ? "mt-2 text-sm" : "mt-3 max-w-sm text-base",
            align === "center" && "mx-auto",
          )}
        >
          {PRODUCT_TAGLINE}
        </p>
      ) : null}
    </div>
  );
}
