import type { Metadata } from "next";
import { AuthWorkspace } from "@/components/auth/auth-workspace";

export const metadata: Metadata = { title: "Create an Account" };

export default function SignupPage() {
  return <AuthWorkspace mode="signup" />;
}
