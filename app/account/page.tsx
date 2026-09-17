import type { Metadata } from "next";
import { AccountWorkspace } from "@/components/account/account-workspace";

export const metadata: Metadata = { title: "Account security" };

export default function AccountPage() {
  return <AccountWorkspace />;
}
