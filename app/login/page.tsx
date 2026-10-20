import { Login } from "@/components/Login";
import { TrustPoints } from "@/components/TrustPoints";

export const metadata = { title: "Sign in · Paperbridge" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-mist px-4 py-24">
      <Login />
      <TrustPoints variant="login" />
    </main>
  );
}
