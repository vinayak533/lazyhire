import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <p className="mb-4 text-xs font-semibold text-primary">404</p>
      <h1 className="text-2xl">A different path, perhaps.</h1>
      <p className="mb-6 mt-3 text-sm leading-6 text-muted-foreground">
        This page isn’t here. Your next opportunity could be.
      </p>
      <Button asChild>
        <Link href="/">Find jobs</Link>
      </Button>
    </main>
  );
}
