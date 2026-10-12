"use client";

import { useState, type ReactNode } from "react";
import { Image as ImageIcon, MessageSquareText, Printer, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  LIST_COPIED_TOAST,
  LIST_TITLE,
  SHARE_CANCEL,
  SHARE_FOOTER,
  SHARE_IMAGE_HELPER,
  SHARE_IMAGE_LABEL,
  SHARE_INCLUDE_CHECKED,
  SHARE_LABEL,
  SHARE_PRINT_HELPER,
  SHARE_PRINT_LABEL,
  SHARE_SHEET_TITLE,
  SHARE_TEXT_HELPER,
  SHARE_TEXT_LABEL,
  filterShareGroups,
  printSubline,
  shareImageFilename,
  shareItemCount,
  shareTitle,
  shoppingListShareText,
  type ShareGroup,
} from "@/lib/list-share";

/** Share button in the List title row, top right (≥44). */
export function ListShareButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      data-slot="list-share-button"
      className="tap-target h-11 min-h-11 min-w-11 gap-1.5 px-3 text-primary"
      onClick={onOpen}
    >
      <Share aria-hidden className="size-5" />
      {SHARE_LABEL}
    </Button>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Draws the list on a clean white canvas (no app chrome, no prices). */
function drawListImage(title: string, groups: ShareGroup[]): Promise<Blob | null> {
  const scale = 2;
  const width = 390;
  const pad = 24;
  const line = 28;
  const rows = groups.reduce((n, group) => n + 1 + group.items.length, 0);
  const height = pad * 2 + 40 + rows * line + groups.length * 16 + 40;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111827";
  ctx.font = "600 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(title, pad, pad + 20);
  let y = pad + 40 + 12;
  for (const group of groups) {
    y += 16;
    ctx.fillStyle = "#2563eb";
    ctx.font = "600 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(group.store.toUpperCase(), pad, y);
    y += line;
    ctx.font = "16px system-ui, -apple-system, sans-serif";
    for (const item of group.items) {
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pad, y - 13, 14, 14);
      if (item.checked) {
        ctx.beginPath();
        ctx.moveTo(pad + 3, y - 6);
        ctx.lineTo(pad + 6, y - 2);
        ctx.lineTo(pad + 11, y - 10);
        ctx.stroke();
      }
      ctx.fillStyle = "#111827";
      ctx.fillText(item.quantity ? `${item.name} — ${item.quantity}` : item.name, pad + 24, y);
      y += line;
    }
  }
  ctx.fillStyle = "#6b7280";
  ctx.font = "12px system-ui, -apple-system, sans-serif";
  ctx.fillText(SHARE_FOOTER, pad, height - pad);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

function SheetRow({
  slot,
  icon,
  label,
  helper,
  busy,
  onClick,
}: {
  slot: string;
  icon: ReactNode;
  label: string;
  helper: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-slot={slot}
      disabled={busy}
      aria-busy={busy}
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-muted disabled:opacity-60"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="type-section block">{label}</span>
        <span className="type-meta block text-muted-foreground">{helper}</span>
      </span>
    </button>
  );
}

export function ListShareSheet({
  open,
  onOpenChange,
  range,
  startsOn,
  groups,
  onToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  range: string;
  startsOn: string;
  groups: ShareGroup[];
  onToast: (message: string) => void;
}) {
  const [includeChecked, setIncludeChecked] = useState(false);
  const [busy, setBusy] = useState<"image" | null>(null);
  const text = shoppingListShareText(range, groups, includeChecked);
  const title = shareTitle(range);

  const sendText = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        onOpenChange(false);
        return;
      } catch (err) {
        if (isAbort(err)) return;
      }
    }
    if (await copyText(text)) onToast(LIST_COPIED_TOAST);
    onOpenChange(false);
  };

  const saveImage = async () => {
    setBusy("image");
    try {
      const blob = await drawListImage(title, filterShareGroups(groups, includeChecked));
      if (!blob) return;
      const file = new File([blob], shareImageFilename(startsOn), { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title });
          onOpenChange(false);
          return;
        } catch (err) {
          if (isAbort(err)) return;
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onOpenChange(false);
    } finally {
      setBusy(null);
    }
  };

  const print = () => {
    onOpenChange(false);
    window.setTimeout(() => window.print(), 50);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" data-slot="list-share-sheet">
          <SheetHeader className="px-0">
            <SheetTitle>{SHARE_SHEET_TITLE}</SheetTitle>
            <SheetDescription className="sr-only">{title}</SheetDescription>
          </SheetHeader>
          <div className="space-y-1">
            <SheetRow
              slot="share-text"
              icon={<MessageSquareText aria-hidden className="size-5" />}
              label={SHARE_TEXT_LABEL}
              helper={SHARE_TEXT_HELPER}
              onClick={() => void sendText()}
            />
            <SheetRow
              slot="share-image"
              icon={<ImageIcon aria-hidden className="size-5" />}
              label={SHARE_IMAGE_LABEL}
              helper={SHARE_IMAGE_HELPER}
              busy={busy === "image"}
              onClick={() => void saveImage()}
            />
            <SheetRow
              slot="share-print"
              icon={<Printer aria-hidden className="size-5" />}
              label={SHARE_PRINT_LABEL}
              helper={SHARE_PRINT_HELPER}
              onClick={print}
            />
          </div>
          <label className="mt-3 flex min-h-12 items-center justify-between gap-3 px-2" data-slot="share-include-checked">
            <span className="type-body">{SHARE_INCLUDE_CHECKED}</span>
            <Switch checked={includeChecked} onCheckedChange={setIncludeChecked} aria-label={SHARE_INCLUDE_CHECKED} />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="fat"
            className="mt-2 w-full"
            data-slot="share-cancel"
            onClick={() => onOpenChange(false)}
          >
            {SHARE_CANCEL}
          </Button>
        </SheetContent>
      </Sheet>
      <ListPrintView range={range} groups={filterShareGroups(groups, includeChecked)} />
    </>
  );
}

/** Printer-friendly page: only visible when printing (globals.css). Black on white, no chrome. */
function ListPrintView({ range, groups }: { range: string; groups: ShareGroup[] }) {
  return (
    <div data-slot="list-print" aria-hidden className="hidden">
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{LIST_TITLE}</h1>
      <p style={{ margin: "4px 0 16px", fontSize: 13 }}>{printSubline(range, shareItemCount(groups))}</p>
      <div style={{ columnCount: groups.length > 1 ? 2 : 1, columnGap: 32 }}>
        {groups.map((group) => (
          <section key={group.store} style={{ breakInside: "avoid", marginBottom: 16 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", margin: "0 0 6px" }}>
              {group.store}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {group.items.map((item, index) => (
                <li key={`${item.name}-${index}`} style={{ fontSize: 14, padding: "3px 0" }}>
                  {item.checked ? "☑" : "☐"} {item.name}
                  {item.quantity ? ` — ${item.quantity}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p style={{ marginTop: 24, fontSize: 11 }}>{SHARE_FOOTER}</p>
    </div>
  );
}
