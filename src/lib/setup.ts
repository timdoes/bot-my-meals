import type { SupabaseSetupStatus } from "./config";

export const SETUP_TITLE = "Set up this house";
export const SETUP_HELPER =
  "Seven short steps. Invite people first — then how many people, which nights, stores, budget, and create meals.";

export const CREATE_HOUSE_TITLE = "Create household";
export const CREATE_HOUSE_BODY = "We’ll plan plates for everyone at the table.";
export const CREATE_HOUSE_HELPER = "One household. Partners join from a link you share — no invite code to type.";
export const CREATE_HOUSE_DEFAULT_NAME = "Our house";

export const SETUP_STARTED_KEY = "supper.setup-started";

export const BACKEND_SETUP_TITLE = "Set up the real house";
export const BACKEND_SETUP_HELPER =
  "This app will not keep dinners only on this device. You need free Cloudflare hosting and a free Supabase project so everyone shares the same week.";
export const BACKEND_SETUP_CTA = "Continue setup";

export const BACKEND_SETUP_STEPS = [
  {
    id: "worker",
    title: "Host it on Cloudflare (free)",
    body: "Create a free Cloudflare account and deploy this app as a Worker. This product's Worker name is bot-my-meals — leave that name as it is. Open it on your workers.dev URL or your own domain. Do not use a {handle}.botmymeals.com address — that is not a DIY hostname.",
  },
  {
    id: "supabase",
    title: "Create a Supabase project (free)",
    body: "At supabase.com, start a Free project. Turn on Email sign-in. Turn Confirm email OFF so people create an account with email and password and stay in the app. Set Site URL to the HTTPS address people will open, and add that same host plus /auth/callback and /login/new-password as Redirect URLs. People use email and password in the app — not a magic link. Do not turn on Apple or Google. Optional later: custom SMTP and {{ .Token }} in the email template for sign-in codes.",
  },
  {
    id: "migrations",
    title: "Apply the house rules",
    body: "In the Supabase SQL editor, run every file in supabase/migrations/ in date order (or supabase db push). That creates the tables and Row Level Security. Do not skip this.",
  },
  {
    id: "keys",
    title: "Paste the public URL and anon key",
    body: "From Supabase Settings → API, copy the Project URL and the anon public key. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on the Worker (or in .env.local on your computer). Then redeploy.",
  },
  {
    id: "homescreen",
    title: "Open the app and install it",
    body: "Reload the site. Create an account with email and password in this app, or sign in, then create or join the household. Install it from this browser so it sits with your other apps.",
  },
] as const;

export function backendSetupStatusMessage(status: SupabaseSetupStatus): string | null {
  switch (status) {
    case "missing":
      return "Nothing is connected yet. Tap Continue setup — it is a short list.";
    case "partial":
      return "You started the keys, but one of them is still missing.";
    case "invalid":
      return "Those keys do not look usable yet. Check the Project URL and the anon public key.";
    case "ready":
      return null;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function shouldOpenBackendChecklist(status: SupabaseSetupStatus, started: boolean): boolean {
  switch (status) {
    case "partial":
    case "invalid":
      return true;
    case "missing":
    case "ready":
      return started;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
