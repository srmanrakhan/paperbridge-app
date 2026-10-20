import { connection } from "next/server";
import { Suspense } from "react";
import { Chat } from "@/components/Chat";
import { getProfile, getSettings } from "@/lib/workspace";

export const metadata = { title: "Copilot · Paperbridge" };

// /chat?buyer=b1 opens the copilot and asks it to draft a reminder for that buyer.
export default function ChatPage({ searchParams }: PageProps<"/chat">) {
  return (
    <Suspense fallback={<Chat />}>
      <ChatWithPrompt searchParams={searchParams} />
    </Suspense>
  );
}

async function ChatWithPrompt({ searchParams }: Pick<PageProps<"/chat">, "searchParams">) {
  await connection();
  const { buyer } = await searchParams;
  if (typeof buyer !== "string") return <Chat />;
  const profile = await getProfile();
  if (buyer === "all") {
    const { remind_after_days } = await getSettings(profile);
    return <Chat initialPrompt={`Draft reminders for buyers ${remind_after_days}+ days late.`} />;
  }
  const name = profile.buyers.find((b) => b.id === buyer)?.name;
  return <Chat initialPrompt={name ? `Draft a payment reminder for ${name}.` : undefined} />;
}
