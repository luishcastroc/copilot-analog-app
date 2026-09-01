/**
 * Agent id registered in src/server/copilotkit-runtime.ts
 * (`agents: { default: ... }`) and used by <copilot-chat> / the threads
 * drawer throughout the app. Lives in its own module so
 * components don't have to import app.config (which imports the components —
 * that would be a cycle).
 */
export const AGENT_ID = "default";
