import type { sectionType, timetableWithSectionsType } from "lib";
import { Check } from "lucide-react";
import type z from "zod";
import { summarizeRoomTimes } from "@/lib/formatTime";
import { HapticTap } from "@/lib/haptics";
import { clashingSections } from "@/lib/sectionClash";
import { cn } from "@/lib/utils";
import { ClashingWith, ClashPill } from "./ClashPills";

type Section = z.infer<typeof sectionType>;
type ChosenSection = z.infer<
  typeof timetableWithSectionsType
>["sections"][number];

const rowGrid = "grid grid-cols-[40px_1fr_auto] gap-x-2.5 px-3.5 py-[13px]";

function SectionText({ section }: { section: Section }) {
  return (
    <>
      <span className="font-mono text-sm font-medium text-ink">
        {section.type}
        {section.number}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[14px] font-medium text-ink">
          {section.instructors.join(", ")}
        </span>
        {summarizeRoomTimes(section.roomTime).map((line) => (
          <span key={line} className="font-mono text-xs text-ink-muted">
            {line}
          </span>
        ))}
      </span>
    </>
  );
}

export function SectionList({
  sections,
  chosen,
  seenIds,
  pulse,
  busy,
  className,
  onPick,
  onHover,
  onClashPick,
  onPulsed,
}: {
  sections: Section[];
  chosen: ChosenSection[];
  // selected rows that already played their tick
  seenIds: Set<string>;
  pulse: boolean;
  busy: boolean;
  className: string;
  onPick: (section: Section) => void;
  onHover: (sectionId: string | null) => void;
  onClashPick: (item: ChosenSection) => void;
  onPulsed: () => void;
}) {
  const selectedIds = new Set(chosen.map((s) => s.id));
  return (
    <div className={className}>
      {sections.map((section) => {
        const clashing = clashingSections(section, chosen);
        if (clashing.length > 0) {
          return (
            <div key={section.id} className={rowGrid}>
              <button
                type="button"
                disabled
                className="col-span-3 grid grid-cols-subgrid text-left opacity-50"
              >
                <SectionText section={section} />
              </button>
              <div className="col-span-2 col-start-2 min-w-0">
                <ClashingWith>
                  {clashing.map((item) => (
                    <ClashPill
                      key={item.id}
                      label={`${item.roomTime[0].split(":")[0]} ${item.type}${item.number}`}
                      onSelect={() => onClashPick(item)}
                    />
                  ))}
                </ClashingWith>
              </div>
            </div>
          );
        }
        const selected = selectedIds.has(section.id);
        const fresh = selected && !seenIds.has(section.id);
        return (
          <button
            key={section.id}
            type="button"
            aria-pressed={selected}
            aria-busy={busy || undefined}
            onClick={() => onPick(section)}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") onHover(section.id);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") onHover(null);
            }}
            onAnimationEnd={(e) => {
              if (e.animationName === "cf-ring-pulse") onPulsed();
            }}
            className={cn(
              rowGrid,
              "relative w-full cursor-pointer items-start text-left transition-colors duration-(--d-2) focus-visible:outline-offset-[-2px]",
              selected
                ? "bg-brand-bg bg-[linear-gradient(to_right,var(--accent)_3px,transparent_3px)]"
                : "hover:bg-sunk",
              selected && pulse && "cf-ring-pulse",
              busy && "cursor-progress",
            )}
          >
            <SectionText section={section} />
            {selected ? (
              <span
                onAnimationEnd={(e) => {
                  if (e.animationName === "cf-tick-in") seenIds.add(section.id);
                }}
                className={cn(
                  "grid size-[22px] place-items-center self-center rounded-full bg-brand text-brand-ink",
                  fresh && "animate-[cf-tick-in_var(--d-3)_var(--e-spring)]",
                )}
              >
                <Check size={14} strokeWidth={3} aria-hidden="true" />
              </span>
            ) : (
              <span className="size-[22px] self-center rounded-full border-[1.5px] border-line" />
            )}
            {!busy && <HapticTap />}
          </button>
        );
      })}
    </div>
  );
}
