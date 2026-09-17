"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Lock, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { clearSensitiveClientState, secureFetch } from "@/lib/client-security";

export function AccountWorkspace() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (active) setEmail(body?.user?.email ?? "");
      })
      .catch(() => {
        if (active) setEmail("");
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleExpiredSession(response: Response) {
    if (response.status !== 401) return false;
    await clearSensitiveClientState();
    setMessage("Please sign in again.");
    router.replace("/login");
    router.refresh();
    return true;
  }

  async function exportData() {
    setBusyAction("export");
    setMessage("");
    try {
      const response = await secureFetch("/api/account/export");
      if (await handleExpiredSession(response)) return;
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Your export could not be prepared.");
      const blob = new Blob([JSON.stringify(body, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lazyhire-data-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Your export was prepared in this browser.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your export could not be prepared.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeAll() {
    setBusyAction("revoke-all");
    setMessage("");
    try {
      await secureFetch("/api/auth/sessions/revoke-all", { method: "POST" });
    } catch {
      /* Local cleanup still gives the user a clean session boundary. */
    } finally {
      await clearSensitiveClientState();
      router.replace("/login");
      router.refresh();
      setBusyAction(null);
    }
  }

  async function deleteAccount() {
    setBusyAction("delete");
    setMessage("");
    try {
      const response = await secureFetch("/api/account/delete", {
        method: "DELETE",
      });
      if (await handleExpiredSession(response)) return;
      if (response.ok) {
        await clearSensitiveClientState();
        router.replace("/signup");
        router.refresh();
      } else setMessage("Account deletion could not be completed.");
    } catch {
      setMessage("Account deletion could not be completed.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <AppShell>
      <div className="motion-safe:animate-fade-in">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Account security
            </p>
            <h1 className="text-3xl leading-tight sm:text-[40px]">
              Privacy controls
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Signed in as {email || "your account"}.
            </p>
          </div>
          <Badge variant="secondary">Private by default</Badge>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <Lock className="mb-4 size-6 text-primary" />
            <h2 className="text-lg">Visibility</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <label className="flex items-start gap-3">
                <input type="checkbox" disabled className="mt-1" />
                Recruiter access remains off until you explicitly publish it.
              </label>
              <label className="flex items-start gap-3">
                <input type="checkbox" disabled className="mt-1" />
                Contact details, resumes, and application history are private.
              </label>
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <Lock className="mb-4 size-6 text-primary" />
            <h2 className="text-lg">Password access</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Sign in with the same email and password you used when creating
              the account.
            </p>
          </Card>
          <Card className="p-5 sm:p-6">
            <Download className="mb-4 size-6 text-primary" />
            <h2 className="text-lg">Your data</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Export or permanently delete your account data.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void exportData()}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "export" ? "Preparing..." : "Export data"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
                disabled={Boolean(busyAction)}
              >
                Delete account
              </Button>
            </div>
            {confirmingDelete && (
              <div
                role="alertdialog"
                aria-labelledby="delete-account-title"
                aria-describedby="delete-account-description"
                className="mt-4 rounded-md border border-destructive/25 bg-destructive/5 p-4"
              >
                <h3
                  id="delete-account-title"
                  className="text-sm font-semibold text-destructive"
                >
                  Permanently delete this account?
                </h3>
                <p
                  id="delete-account-description"
                  className="mt-2 text-xs leading-5 text-muted-foreground"
                >
                  This removes saved jobs, CV uploads, sessions, and account
                  history. This cannot be undone.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={Boolean(busyAction)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void deleteAccount()}
                    disabled={Boolean(busyAction)}
                  >
                    {busyAction === "delete"
                      ? "Deleting..."
                      : "Permanently delete"}
                  </Button>
                </div>
              </div>
            )}
          </Card>
          <Card className="p-5 sm:p-6">
            <ShieldAlert className="mb-4 size-6 text-primary" />
            <h2 className="text-lg">Sessions</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              End every active session for this account.
            </p>
            <Button
              className="mt-4"
              onClick={() => void revokeAll()}
              disabled={Boolean(busyAction)}
            >
              {busyAction === "revoke-all"
                ? "Signing out..."
                : "Log out from all devices"}
            </Button>
          </Card>
        </div>
        {message && (
          <p role="status" className="mt-5 text-sm text-muted-foreground">
            {message}
          </p>
        )}
      </div>
    </AppShell>
  );
}
