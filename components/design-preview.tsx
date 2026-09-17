"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Component,
  Layers3,
  MapPin,
  MousePointer2,
  RotateCcw,
  Search,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyHireMark } from "@/components/brand/lazyhire-logo";

const navigation = [
  { href: "#foundations", label: "Foundations", icon: Layers3 },
  { href: "#components", label: "Components", icon: Component },
  { href: "#typography", label: "Typography", icon: Type },
];

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">
        {number}
      </span>
      <div>
        <h2 className="text-lg">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

export function DesignPreview() {
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ready = window.setTimeout(() => setHydrated(true), 0);
    return () => {
      window.clearTimeout(ready);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function replayLoading() {
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLoading(false), 1800);
  }

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-card p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-secondary/35 lg:flex">
        <a
          href="/design-preview"
          className="mx-6 mt-8 flex w-fit items-center gap-2.5 rounded-md text-base font-semibold tracking-heading"
        >
          <LazyHireMark className="size-9" />
          LazyHire
        </a>
        <div className="px-4 pt-13">
          <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Workspace foundations
          </p>
          <nav aria-label="Design system sections" className="space-y-1">
            {navigation.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                <Icon className="size-4" />
                {label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mx-6 mb-6 mt-auto border-t pt-5">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="size-1.5 rounded-full bg-primary" />A quieter way
            forward.
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Thoughtful details.
            <br />
            Room to focus on what matters.
          </p>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="flex h-[73px] items-center justify-between gap-3 border-b px-5 sm:px-9 lg:px-12">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground lg:hidden">
              LazyHire
            </span>
            <span className="hidden sm:inline">Workspace</span>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground">Design system</span>
          </div>
          <Badge variant="outline">Version 0.1</Badge>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1200px] px-5 pb-8 pt-10 motion-safe:animate-fade-in sm:px-9 lg:px-12 lg:pt-12"
        >
          <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" />
                THE FOUNDATION
              </div>
              <h1 className="text-3xl leading-tight sm:text-[36px]">
                Good design gets out of the way.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                A calm, clear visual language for LazyHire. Built to keep the
                focus on your next step.
              </p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <a href="#components">
                Explore components
                <ArrowDown />
              </a>
            </Button>
          </div>

          <section id="foundations" className="scroll-mt-6 border-t pt-7">
            <SectionHeading
              number="01"
              title="A little color. A lot of clarity."
              description="Neutral surfaces, a single accent, and enough contrast to stay readable."
            />
            <div className="mb-9 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  name: "Signal Orange",
                  hex: "#FFA61A",
                  role: "Actions & focus",
                  color: "bg-primary",
                },
                {
                  name: "Moon",
                  hex: "#EEF4FF",
                  role: "Primary text",
                  color: "bg-foreground",
                },
                {
                  name: "Steel",
                  hex: "#9AA7BA",
                  role: "Supporting text",
                  color: "bg-muted-foreground",
                },
                {
                  name: "Midnight",
                  hex: "#050B16",
                  role: "Workspace background",
                  color: "bg-background",
                },
              ].map((swatch) => (
                <div
                  key={swatch.name}
                  className="overflow-hidden rounded-lg border bg-card"
                >
                  <div className={`h-14 border-b ${swatch.color}`} />
                  <div className="p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-xs font-semibold">
                        {swatch.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {swatch.hex}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {swatch.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section id="components" className="scroll-mt-6">
            <SectionHeading
              number="02"
              title="Small details. Shared language."
              description="Every component starts with the same considered defaults."
            />
            <div className="grid items-start gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <div className="mb-1 flex items-center justify-between">
                    <CardTitle>Buttons</CardTitle>
                    <MousePointer2 className="size-4 text-muted-foreground" />
                  </div>
                  <CardDescription>
                    Clear actions, without competing for attention.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={!hydrated}
                      onClick={() =>
                        setNotice(
                          "Primary action selected. You're ready for the next step.",
                        )
                      }
                    >
                      Continue
                      <ArrowRight />
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!hydrated}
                      onClick={() =>
                        setNotice(
                          "Secondary action selected. Your changes are kept here.",
                        )
                      }
                    >
                      Save for later
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!hydrated}
                      onClick={() => setNotice("Preview reset.")}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <Button
                      size="sm"
                        onClick={() => setNotice("Compact action selected.")}
                        disabled={!hydrated}
                    >
                      Small action
                    </Button>
                    <Button size="sm" disabled>
                      Unavailable
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Compact & disabled states
                    </span>
                  </div>
                  <div
                    className="mt-5 min-h-10 border-t pt-3 text-xs leading-5 text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    {notice ||
                      "Try an action, or use Tab to see the focus treatment."}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Input fields</CardTitle>
                  <CardDescription>
                    Helpful labels. A little breathing room.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label
                      htmlFor="preview-keyword"
                      className="mb-2 block text-xs font-semibold"
                    >
                      Role or keyword
                    </label>
                    <div className="relative">
                      <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground"
                      />
                      <Input
                        id="preview-keyword"
                        placeholder="e.g. Product designer"
                        className="pl-10"
                        aria-describedby="keyword-hint"
                      />
                    </div>
                    <p
                      id="keyword-hint"
                      className="mt-2 text-xs text-muted-foreground"
                    >
                      A title, a skill, or something you enjoy doing.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="preview-error"
                        className="mb-2 block text-xs font-semibold"
                      >
                        Email · error state
                      </label>
                      <Input
                        id="preview-error"
                        type="email"
                        defaultValue="alex@"
                        aria-invalid="true"
                        aria-describedby="email-error"
                      />
                      <p
                        id="email-error"
                        className="mt-2 text-xs text-destructive"
                      >
                        Enter a complete email address.
                      </p>
                    </div>
                    <div>
                      <label
                        htmlFor="preview-disabled"
                        className="mb-2 block text-xs font-semibold"
                      >
                        Disabled state
                      </label>
                      <Input
                        id="preview-disabled"
                        placeholder="Not available yet"
                        disabled
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Cards</CardTitle>
                    <Badge variant="outline">Example content</Badge>
                  </div>
                  <CardDescription>
                    A clear hierarchy, with room for the essentials.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border bg-background p-5">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-lg border bg-card text-primary">
                        <Layers3 className="size-5" />
                      </span>
                      <Badge variant="secondary">
                        <Clock3 />2 days ago
                      </Badge>
                    </div>
                    <h3 className="text-base">A more focused workspace</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Thoughtful tools for your next chapter.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5" />
                        Kochi, Kerala
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Card specimen</span>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
                      <span className="text-xs text-muted-foreground">
                        A place for the next step
                      </span>
                      <Button
                        size="sm"
                        variant={saved ? "secondary" : "default"}
                        aria-pressed={saved}
                        onClick={() => setSaved(!saved)}
                        disabled={!hydrated}
                      >
                        {saved ? <Check /> : <CheckCheck />}
                        {saved ? "Saved" : "Save example"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Badges & chips</CardTitle>
                    <CardDescription>
                      Useful context, kept in the background.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      <Badge>Featured</Badge>
                      <Badge variant="secondary">Full-time</Badge>
                      <Badge variant="outline">
                        <MapPin />
                        Kochi
                      </Badge>
                      <Badge variant="secondary">
                        <Clock3 />3 days ago
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle>Loading with intention</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={replayLoading}
                        disabled={loading || !hydrated}
                      >
                        <RotateCcw />
                        Replay
                      </Button>
                    </div>
                    <CardDescription>
                      Keep the layout steady while content arrives.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      aria-busy={loading}
                      className="flex min-h-[68px] items-center gap-3 rounded-md border bg-background p-3"
                    >
                      {loading ? (
                        <>
                          <Skeleton className="size-10 shrink-0" />
                          <div className="w-full space-y-2">
                            <Skeleton className="h-3 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                            <Check className="size-4" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold">
                              Everything in its place.
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Press replay to preview the skeleton.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                    <p role="status" className="sr-only">
                      {loading
                        ? "Loading example content"
                        : "Example content loaded"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>

          <section id="typography" className="mt-9 scroll-mt-6">
            <SectionHeading
              number="03"
              title="Easy on the eyes."
              description="One typeface. Two weights. A rhythm that feels natural."
            />
            <Card>
              <CardContent className="grid gap-6 p-6 sm:grid-cols-[1fr_1.3fr]">
                <div className="flex items-center gap-5">
                  <span className="text-5xl tracking-heading">Aa</span>
                  <div>
                    <h3 className="text-sm">Inter</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Regular 400 · Semibold 600
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      4px spacing rhythm · 6px / 10px corners
                    </p>
                  </div>
                </div>
                <div className="border-t pt-5 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
                  <h3 className="text-xl">Your next chapter starts here.</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Good typography makes space for the message. Clear headings,
                    comfortable line lengths, and details that never get in the
                    way.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="border-t px-6 pb-4 pt-4 text-xs text-muted-foreground">
                <CircleHelp className="size-3.5 shrink-0" />
                Motion respects your device’s reduced-motion preference.
              </CardFooter>
            </Card>
          </section>
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t pt-5 text-[11px] text-muted-foreground">
            <span>LazyHire / Design foundations</span>
            <span>Quietly purposeful. Consistently considered.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
