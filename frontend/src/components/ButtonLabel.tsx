import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ButtonLabel({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}) {
  return (
    <span className="inline-grid place-items-center">
      <span
        className={cn(
          "col-start-1 row-start-1 inline-flex items-center gap-2 transition-opacity duration-(--d-1)",
          loading && "opacity-0",
        )}
      >
        {children}
      </span>
      <LoaderCircle
        aria-hidden="true"
        className={cn(
          "col-start-1 row-start-1 size-5 animate-spin opacity-0 transition-opacity duration-(--d-1)",
          loading && "opacity-100",
        )}
      />
    </span>
  );
}
