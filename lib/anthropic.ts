import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/lib/errors";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;

// Server-side Anthropic client. Created lazily so the app still builds without env vars.
export function getAnthropic(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AppError("The copilot isn't connected to the AI yet: ANTHROPIC_API_KEY is missing.");
  }
  client = new Anthropic();
  return client;
}
