"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Search,
  ShieldCheck,
} from "lucide-react";
import { LazyHireMark } from "@/components/brand/lazyhire-logo";
import { cn } from "@/lib/utils";
import { clearSensitiveClientState, secureFetch } from "@/lib/client-security";

interface SessionUser {
  email: string;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const aborter = new AbortController();
    fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: aborter.signal,
    })
      .then(async (response) => {
        if (response.ok) return response.json();
        if (response.status === 401) {
          await clearSensitiveClientState();
          router.replace("/login");
          router.refresh();
        }
        return null;
      })
      .then((body) => {
        if (!aborter.signal.aborted) setUser(body?.user ?? null);
      })
      .catch(() => {});
    return () => aborter.abort();
  }, [path, router]);

  async function logout() {
    await secureFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await clearSensitiveClientState();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-card p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-card/88 shadow-subtle backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between gap-2 px-5 sm:gap-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md text-sm font-semibold tracking-heading sm:gap-2.5 sm:text-base"
            aria-label="LazyHire home"
          >
            <LazyHireMark className="size-9" />
            <span>LazyHire</span>
          </Link>
          <nav
            aria-label="Main navigation"
            className="flex flex-wrap justify-end gap-1 sm:gap-2"
          >
            {[
              { href: "/career-os", label: "Career OS", icon: LayoutDashboard },
              { href: "/", label: "Find jobs", icon: Search },
              { href: "/cv", label: "CV review", icon: FileText },
              { href: "/account", label: "Account", icon: ShieldCheck },
            ].map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={path === href ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-md border border-transparent px-2.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
                  path === href
                    ? "border-primary/15 bg-accent text-primary shadow-subtle"
                    : "text-muted-foreground hover:border-border hover:bg-card hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sr-only sm:hidden">{label}</span>
              </Link>
            ))}
            {user && (
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-transparent px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-card hover:text-foreground sm:px-3 sm:text-sm"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Log out</span>
                <span className="sr-only sm:hidden">Log out</span>
              </button>
            )}
          </nav>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1320px] flex-1 px-5 pb-14 pt-8 sm:px-8 sm:pt-12"
      >
        {children}
      </main>
      <footer className="border-t bg-card/70">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-muted-foreground sm:px-8">
          <span>Kerala, India</span>
          <span>LazyHire</span>
        </div>
      </footer>
    </div>
  );
}
