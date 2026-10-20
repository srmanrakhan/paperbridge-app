import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Paperbridge",
  description: "AI finance copilot for small Polish B2B companies",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col font-sans text-ink">
        <Nav />
        {children}
      </body>
    </html>
  );
}
