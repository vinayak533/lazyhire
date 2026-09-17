"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-2xl">A small interruption.</h1>
      <p className="mb-6 mt-3 text-sm leading-6 text-muted-foreground">
        Something prevented this page from loading. Try once more to get back to
        your workspace.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
