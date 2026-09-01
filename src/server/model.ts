// The LLM, routed through OpenRouter; needs OPENROUTER_API_KEY in .env.
// Swap models with OPENROUTER_MODEL (paid ones need OpenRouter credits).
import "dotenv/config";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

/**
 * Model id, surfaced in server logs so failures name their culprit.
 * Default: OpenRouter's router across the whole free pool — dodges
 * per-model rate limits and filters for tool support. Pin a specific model
 * (e.g. "minimax/minimax-m3:free") via OPENROUTER_MODEL for consistent
 * turn-to-turn behavior.
 */
export const MODEL_ID = process.env.OPENROUTER_MODEL ?? "openrouter/free";

export const model = openrouter.chat(MODEL_ID);
