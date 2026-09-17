import Image from "next/image";
import platformLogo from "@/data/image/platform image logo.png";
import loginLockup from "@/data/image/lazyhire-lockup.png";
import { cn } from "@/lib/utils";

export function LazyHireMark({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) {
  return (
    <span
      className={cn(
        "relative block size-10 shrink-0 overflow-hidden rounded-lg",
        className,
      )}
    >
      <Image
        src={platformLogo}
        alt="LazyHire"
        fill
        sizes="80px"
        className={cn("object-contain", imageClassName)}
      />
    </span>
  );
}

export function LazyHireLoginLogo({
  className,
  imageClassName,
}: {
  className?: string;
  imageClassName?: string;
}) {
  return (
    <Image
      src={loginLockup}
      alt="LazyHire - Where AI finds the job that finds you"
      preload
      sizes="(max-width: 1023px) 88vw, 46vw"
      className={cn("h-auto w-full max-w-full", className, imageClassName)}
    />
  );
}
