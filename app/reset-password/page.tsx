import type { Metadata } from "next";
import { ResetPasswordWorkspace } from "@/components/auth/reset-password-workspace";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return <ResetPasswordWorkspace />;
}
