"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { LazyHireLoginLogo } from "@/components/brand/lazyhire-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearSensitiveClientState } from "@/lib/client-security";

function subscribeHydration() {
  return () => {};
}

export function ResetPasswordWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );

  async function submit() {
    setBusy(true);
    setError("");
    await clearSensitiveClientState();
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        body: JSON.stringify({ token, password }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? "Password reset failed.");
      setDone(true);
      window.setTimeout(() => router.replace("/login"), 1200);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Password reset failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[920px] items-center px-5 py-8 sm:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[1fr_400px] lg:items-center">
        <section className="min-w-0">
          <Link
            href="/login"
            className="mb-8 block max-w-sm rounded-md"
          >
            <LazyHireLoginLogo className="aspect-[3.2/1]" />
          </Link>
          <p className="mb-3 text-[11px] font-semibold uppercase text-muted-foreground">
            Account recovery
          </p>
          <h1 className="max-w-xl text-3xl leading-tight sm:text-[40px]">
            Choose a new password.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground">
            Reset links expire after 15 minutes and sign out existing sessions
            once the password changes.
          </p>
        </section>
        <Card className="p-5 shadow-elevated sm:p-7">
          {done ? (
            <div className="rounded-lg border border-primary/25 bg-accent p-4 text-primary">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                <div>
                  <h2 className="text-base">Password updated</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    You can sign in with the new password now.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div>
                <label
                  className="mb-1.5 block text-xs font-semibold"
                  htmlFor="new-password"
                >
                  New password
                </label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    className="pl-9"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={busy || !hydrated || !token}
                    minLength={12}
                    required
                  />
                </div>
              </div>
              {!token && (
                <p role="alert" className="text-sm leading-6 text-destructive">
                  This reset link is missing its token. Request a fresh link.
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm leading-6 text-destructive">
                  {error}
                </p>
              )}
              <Button
                className="w-full"
                disabled={busy || !hydrated || !token}
                type="submit"
              >
                {busy ? "Updating..." : "Reset password"}
              </Button>
              <Button asChild className="w-full" variant="secondary">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
