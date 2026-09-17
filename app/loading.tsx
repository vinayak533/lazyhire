import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16" role="status">
      <span className="sr-only">Loading workspace</span>
      <Skeleton className="mb-4 h-9 w-2/3" />
      <Skeleton className="mb-10 h-4 w-1/2" />
      <Skeleton className="mb-8 h-28 w-full" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}
