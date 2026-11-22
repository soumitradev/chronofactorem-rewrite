import { Bird } from "lucide-react";
import { cn } from "@/lib/utils";

// hops once on mount; reduced motion cuts the animation short in index.css
export function EmptyBird({ className }: { className?: string }) {
  return (
    <Bird
      size={112}
      strokeWidth={1.5}
      aria-hidden="true"
      className={cn(
        "animate-[cf-hop_300ms_cubic-bezier(.2,0,0,1)] text-ink-faint",
        className,
      )}
    />
  );
}
