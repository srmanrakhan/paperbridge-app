import { runAgent, type AgentEvent, type ChatTurn } from "@/lib/agent";
import { friendlyError } from "@/lib/errors";

// POST /api/agent  { messages: [{ role: "user" | "assistant", content: string }, ...] }
// -> NDJSON stream of AgentEvent (step, text, tool, draft, done | error)
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const messages = (body as { messages?: unknown } | null)?.messages;

  const wellFormed =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= 4000,
    ) &&
    messages[0].role === "user" &&
    messages[messages.length - 1].role === "user";
  if (!wellFormed) {
    return Response.json({ error: "Please type a question (up to 4,000 characters)." }, { status: 400 });
  }
  if (messages.length > 40) {
    return Response.json({ error: "This chat is getting long. Refresh the page to start a new one." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await runAgent(messages as ChatTurn[], emit);
      } catch (err) {
        console.error("agent failed", err);
        emit({ type: "error", message: friendlyError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
