import type { Metadata } from "next";
import { AuthWorkspace } from "@/components/auth/auth-workspace";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage() {
  return <AuthWorkspace mode="login" />;
}
