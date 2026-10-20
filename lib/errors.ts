import Anthropic from "@anthropic-ai/sdk";

// An error whose message is safe to show the owner as-is (one friendly line).
export class AppError extends Error {}

export const FRIENDLY_DEFAULT = "Something went wrong. Please try again.";

// Turns any server error into one friendly line. The raw error is logged server-side only.
export function friendlyError(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "The AI key was not accepted. Check ANTHROPIC_API_KEY.";
  }
  if (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.APIConnectionError ||
    (err instanceof Anthropic.APIError && typeof err.status === "number" && err.status >= 500)
  ) {
    return "The AI service is busy right now. Please try again in a moment.";
  }
  return FRIENDLY_DEFAULT;
}
