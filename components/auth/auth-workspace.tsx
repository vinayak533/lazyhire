"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { LazyHireLoginLogo } from "@/components/brand/lazyhire-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearSensitiveClientState } from "@/lib/client-security";

export function AuthWorkspace({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(
      () => setCooldown((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function submit() {
    setBusy(true);
    setError("");
    await clearSensitiveClientState();
    try {
      const response = await fetch(
        mode === "signup" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({ email, password }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        if (body.error?.code === "RATE_LIMITED" && retryAfter > 0)
          setCooldown(retryAfter);
        throw new Error(body.error?.message ?? "Try again.");
      }
      router.replace("/");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1120px] items-center px-5 py-8 sm:px-8">
      <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center">
        <section className="flex min-w-0 items-center justify-center lg:justify-start">
          <LazyHireLoginLogo className="max-w-[440px] sm:max-w-[520px] lg:max-w-[560px]" />
        </section>
        <Card className="border-border/80 bg-card/92 p-5 shadow-elevated backdrop-blur-xl sm:p-7">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="mb-6">
              <h1 className="text-2xl leading-tight">
                {mode === "signup" ? "Create an Account" : "Sign In"}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {mode === "signup"
                  ? "Use your email and a secure password to start."
                  : "Use your email and password to continue."}
              </p>
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold"
                htmlFor="email"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="pl-9"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy || !hydrated}
                  required
                />
              </div>
            </div>
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  className="pl-9 pr-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy || !hydrated}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide characters" : "Show characters"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-2.5 inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={busy || !hydrated}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm leading-6 text-destructive">
                {error}
              </p>
            )}
            <Button
              className="w-full"
              disabled={busy || !hydrated || cooldown > 0}
              type="submit"
            >
              {cooldown > 0
                ? `Try again in ${cooldown}s`
                : busy
                ? "Checking..."
                : mode === "signup"
                  ? "Create an Account"
                  : "Sign In"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {mode === "signup"
                ? "Already have an account? "
                : "Don't have an account? "}
              <Link
                href={mode === "signup" ? "/login" : "/signup"}
                className="rounded-sm font-semibold text-primary hover:text-primary-hover"
              >
                {mode === "signup" ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </main>
  );
}
