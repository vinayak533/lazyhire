import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Native select with the workspace's input styling. The control is opaque on
 * purpose: browsers paint the option list with the select's own background, so
 * a translucent field produced unreadable, washed-out options.
 */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select"> & { wrapperClassName?: string }
>(({ className, wrapperClassName, children, ...props }, ref) => (
  <span className={cn("relative block", wrapperClassName)}>
    <select
      ref={ref}
      className={cn(
        "h-11 w-full cursor-pointer appearance-none rounded-md border border-input bg-card px-3.5 pr-9 text-sm font-semibold text-foreground shadow-subtle transition-colors hover:border-muted-foreground/60 hover:bg-secondary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
    />
  </span>
));
Select.displayName = "Select";
export { Select };
