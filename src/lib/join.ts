export const JOIN_SHARE_PREFILL =
  "Join our Bot My Meals house — open this in your browser:";

export const JOIN_TITLE = "You’re invited";
export const JOIN_HELPER = "One household. No invite code to type.";
export const JOIN_CTA = "Continue";
export const JOIN_HOUSE_SAMPLE = "Our house";

export function joinInviteBody(houseName: string): string {
  const name = houseName.trim() || JOIN_HOUSE_SAMPLE;
  return `This link opens ${name}. Continue to join the table and see this week's dinners.`;
}

export const JOIN_TOKEN_TTL_DAYS = 14;

export const JOIN_TOKEN_STATUSES = ["ok", "expired", "used", "invalid"] as const;
export type JoinTokenStatus = (typeof JOIN_TOKEN_STATUSES)[number];

export type JoinPeek = {
  status: JoinTokenStatus;
  householdName?: string;
  householdId?: string;
};

export function isJoinTokenFormat(token: string): boolean {
  return /^[a-zA-Z0-9]{8,64}$/.test(token.trim());
}

export function joinPath(token: string): string {
  return `/join/${token.trim()}`;
}

export function joinUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${joinPath(token)}`;
}

export function joinShareText(url: string): string {
  return `${JOIN_SHARE_PREFILL}\n${url}`;
}

export function joinTokenReason(status: JoinTokenStatus): string {
  switch (status) {
    case "ok":
      return "";
    case "expired":
      return "This invite link has expired. Ask your partner for a new link.";
    case "used":
      return "This invite link was already used. Ask your partner for a new link.";
    case "invalid":
      return "This invite link is not valid. Ask your partner for a new link.";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function parseJoinPeek(value: unknown): JoinPeek {
  if (!value || typeof value !== "object") {
    return { status: "invalid" };
  }
  const record = value as { status?: unknown; household_name?: unknown; household_id?: unknown };
  const status = JOIN_TOKEN_STATUSES.find((item) => item === record.status) ?? "invalid";
  if (status !== "ok") {
    return { status };
  }
  return {
    status,
    householdName: typeof record.household_name === "string" ? record.household_name : undefined,
    householdId: typeof record.household_id === "string" ? record.household_id : undefined,
  };
}

export async function shareJoinInvite(url: string): Promise<"shared" | "copied"> {
  const text = joinShareText(url);
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Bot My Meals",
        text,
        url,
      });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
    }
  }
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    throw new Error("Could not share that link.");
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}

export function canUseNativeShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}
