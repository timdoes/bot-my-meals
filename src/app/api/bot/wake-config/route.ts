import { botWakeConfiguredResponse } from "@/lib/bot-wake-http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return botWakeConfiguredResponse(request);
}
