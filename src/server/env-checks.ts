/**
 * Startup env check (warn-only; the server still boots so the UI stays
 * reachable). Lives server-side on purpose: with everything in one Nitro
 * server, the code that needs the vars is the right place to complain about
 * them — no separate pre-check scripts.
 */
export function warnOnMissingEnv(): void {
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? "";
  if (!openrouterKey || /^your[-_]|\.\.\.$/i.test(openrouterKey)) {
    console.warn(
      "⚠ OPENROUTER_API_KEY is missing or a placeholder — chat will not generate until you set it in .env (https://openrouter.ai/settings/keys) and restart.",
    );
  }
  if (
    process.env.COPILOTKIT_LICENSE_TOKEN &&
    !process.env.INTELLIGENCE_API_KEY
  ) {
    console.warn(
      "⚠ COPILOTKIT_LICENSE_TOKEN is set but INTELLIGENCE_API_KEY is not — threads/memory will fail with an opaque auth error. Restore it in .env or re-run `copilotkit init`.",
    );
  }
  if (!process.env.TAVILY_API_KEY) {
    console.warn(
      "ℹ TAVILY_API_KEY is unset — web search degrades to 'not configured' (optional; free tier at app.tavily.com).",
    );
  }
}

/**
 * The AI SDK prints "System messages in the prompt or messages fields can be
 * a security risk…" on EVERY model call. The mechanism it warns about is
 * internal to BuiltInAgent (it sends the system prompt as a message instead
 * of the `system` option, and exposes no way to pass allowSystemInMessages),
 * so we can't fix it at the call site. The actual injection surface — model-
 * readable data like trip state and web search results — is addressed in the
 * prompt's SECURITY section. Here we just collapse the repeats: log it once
 * with this explanation, swallow duplicates. Exact-match only; every other
 * warning passes through untouched.
 */
export function dedupeNoisySdkWarnings(): void {
  const NOISY = "AI SDK Warning: System messages in the prompt";
  const original = console.warn.bind(console);
  let seen = false;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith(NOISY)) {
      if (seen) return;
      seen = true;
      original(
        "ℹ AI SDK system-message warning (further repeats suppressed; see env-checks.ts — BuiltInAgent-internal, injection risk handled in the prompt's SECURITY section).",
      );
      return;
    }
    original(...args);
  };
}
