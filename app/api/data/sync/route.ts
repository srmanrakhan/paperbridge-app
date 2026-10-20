import { logAction } from "@/lib/actions";
import { friendlyError } from "@/lib/errors";
import { recordSync, type SyncSource } from "@/lib/workspace";

// POST /api/data/sync { source: "ksef" | "bank" } -> { synced_at, new_items }
// Demo sync: nothing new arrives between syncs, it only records the time. The live demo never calls KSeF.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { source?: unknown } | null;
  const source = body?.source;
  if (source !== "ksef" && source !== "bank") return Response.json({ error: "Unknown source." }, { status: 400 });
  try {
    const syncedAt = await recordSync(source as SyncSource);
    await logAction("sync", { source: source === "ksef" ? "KSeF (demo)" : "Bank (demo)", new_items: 0 }, "logged");
    return Response.json({ synced_at: syncedAt, new_items: 0 });
  } catch (err) {
    console.error("sync failed", err);
    return Response.json({ error: friendlyError(err) }, { status: 500 });
  }
}
