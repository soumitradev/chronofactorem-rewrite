import { useIsMutating } from "@tanstack/react-query";
import type { sectionType } from "lib";
import { ChevronLeft, HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type z from "zod";
import { useTimetableState } from "@/context";
import {
  useAddRemoveTimetableSection,
  useRemoveTimetableCourse,
  useSwapTimetableSections,
} from "@/data-access/timetables";
import { formatExam } from "@/lib/formatTime";
import { HapticTap, haptic } from "@/lib/haptics";
import { useSkeletonFadeIn } from "@/lib/skeletonFade";
import { titleCase } from "@/lib/titleCase";
import { useTypeSlide } from "@/lib/typeSlide";
import { useSwipe } from "@/lib/useSwipe";
import { useTimetableNav } from "@/lib/useTimetableNav";
import { cn } from "@/lib/utils";
import { PANEL_VT_CLASS, prefersReducedMotion } from "@/lib/viewTransitions";
import { markClashLanding, useClashLanding } from "./ClashPills";
import { group } from "./listStyles";
import { SectionList } from "./SectionList";
import { Badge } from "./ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Roll } from "./ui/roll";
import { Segmented } from "./ui/segmented";
import { Skeleton } from "./ui/skeleton";

type Section = z.infer<typeof sectionType>;
type SectionKind = "L" | "P" | "T";

const typeNames: Record<SectionKind, string> = {
  L: "Lecture",
  P: "Practical",
  T: "Tutorial",
};

const sectionGroup = cn(group, "mt-2.5 mb-6");

const ADVANCE_DELAY = 350;

const examHelp = {
  midsem:
    "Timetable Division hasn't published the midsem dates for this course. Either there is no midsem exam, or they haven't decided it yet. We recommend checking with your professor.",
  compre:
    "Timetable Division hasn't published the compre dates for this course. Either there is no compre exam, or they haven't decided it yet. We recommend checking with your professor.",
};

function ExamLine({
  label,
  start,
  end,
  help,
}: {
  label: string;
  start: string | null;
  end: string | null;
  help: string;
}) {
  return (
    <span>
      {label} · {formatExam(start, end)}
      {start === null && (
        <Popover>
          <PopoverTrigger
            aria-label="About this date"
            className="relative -my-1 ml-1 inline-grid size-6 cursor-pointer place-items-center rounded-full align-middle text-ink-muted transition-colors duration-(--d-1) after:absolute after:-inset-2.5 after:content-[''] hover:bg-sunk hover:text-ink"
          >
            <HelpCircle size={14} aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent className="p-3 text-sm leading-normal">
            {help}
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

const CourseDetailsMenu = ({
  showHeader = true,
  onSectionHover,
}: {
  showHeader?: boolean;
  onSectionHover?: (sectionId: string | null) => void;
}) => {
  const {
    state: {
      timetable,
      course,
      currentCourseID,
      uniqueSectionTypes,
      currentSectionType,
    },
  } = useTimetableState();
  const { openCourse, closeCourse, setType } = useTimetableNav();
  const { mutateOnce: sectionAction, isLocked } = useAddRemoveTimetableSection(
    timetable?.id,
  );
  const { mutateOnce: swapSections } = useSwapTimetableSections(timetable?.id);
  const { mutateOnce: removeCourse } = useRemoveTimetableCourse(timetable?.id);
  // the three share one lock, so isLocked covers them all
  const busy =
    useIsMutating({ mutationKey: ["sections", timetable?.id] }) > 0 ||
    isLocked();
  // Short delay before moving to next tab
  const advance = useRef<number | undefined>(undefined);
  const cancelAdvance = () => window.clearTimeout(advance.current);
  useEffect(() => cancelAdvance, []);
  const at = useRef("");
  at.current = `${currentCourseID}:${currentSectionType}`;

  const handleSectionClick = (section: Section) => {
    cancelAdvance();
    if (!timetable || isLocked()) return;
    haptic("selection");
    if (timetable.sections.some((item) => item.id === section.id)) {
      sectionAction({ sectionId: section.id, action: "remove" });
      return;
    }
    const other = timetable.sections.find(
      (item) =>
        item.type === section.type && item.courseId === section.courseId,
    );
    if (other) swapSections({ sectionId: other.id, newSectionId: section.id });
    else
      sectionAction(
        { sectionId: section.id, action: "add" },
        {
          onSuccess: () => {
            const next =
              uniqueSectionTypes[uniqueSectionTypes.indexOf(section.type) + 1];
            if (!next) return;
            const from = at.current;
            advance.current = window.setTimeout(() => {
              if (at.current === from) setType(next);
            }, ADVANCE_DELAY);
          },
        },
      );
  };
  const handleRemoveCourse = () => {
    if (!course || isLocked()) return;
    haptic("selection");
    removeCourse(
      { courseId: course.id, code: course.code },
      { onSuccess: () => closeCourse() },
    );
  };

  const fadeIn = useSkeletonFadeIn(course === undefined);

  const landed = useClashLanding(course?.id ?? null, currentSectionType);
  const [pulsedNonce, setPulsedNonce] = useState<number | null>(null);
  const pulse =
    landed !== null && pulsedNonce !== landed && !prefersReducedMotion();

  const slide = useTypeSlide(
    currentCourseID,
    currentSectionType,
    uniqueSectionTypes,
    course !== undefined,
  );
  const swipe = useSwipe(
    currentSectionType ? uniqueSectionTypes.indexOf(currentSectionType) : -1,
    uniqueSectionTypes.length,
    course && currentSectionType
      ? (i) => {
          cancelAdvance();
          setType(uniqueSectionTypes[i]);
        }
      : undefined,
  );

  // Rows already selected when a course opens don't play the tick; rows
  // selected (or reselected) while it is open do.
  const selectedIds = new Set(timetable?.sections.map((s) => s.id));
  const seen = useRef<{ course: string | null; ids: Set<string> }>({
    course: null,
    ids: new Set(),
  });
  if (course && seen.current.course !== course.id)
    seen.current = { course: course.id, ids: selectedIds };
  for (const id of seen.current.ids)
    if (!selectedIds.has(id)) seen.current.ids.delete(id);

  // Clear a hover preview if the picker goes away under the pointer.
  const hovered = useRef(false);
  const hoverRef = useRef(onSectionHover);
  hoverRef.current = onSectionHover;
  useEffect(
    () => () => {
      if (hovered.current) hoverRef.current?.(null);
    },
    [],
  );
  const hover = (id: string | null) => {
    hovered.current = id !== null;
    onSectionHover?.(id);
  };

  // same course: slide to the type, don't push the panel
  const pickClash = (item: { courseId: string; type: SectionKind }) => {
    markClashLanding(item.courseId, item.type);
    if (item.courseId === currentCourseID) {
      cancelAdvance();
      setType(item.type);
    } else {
      openCourse(item.courseId, {
        type: item.type,
        transition: "panel-forward",
      });
    }
  };

  if (timetable === undefined) return;

  const chosen = (type: string) =>
    timetable.sections.find(
      (item) => item.courseId === currentCourseID && item.type === type,
    );

  return (
    <div className={cn("flex h-full min-h-0 flex-col", PANEL_VT_CLASS)}>
      <div className="shrink-0 px-4 pt-1 lg:px-0">
        {showHeader && (
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Back"
              onClick={closeCourse}
              className="-ml-4 grid size-11 shrink-0 cursor-pointer lg:-ml-2 lg:size-9 place-items-center rounded-full text-ink transition-colors duration-(--d-1) hover:bg-sunk"
            >
              <ChevronLeft size={22} aria-hidden="true" />
            </button>
            {course ? (
              <h2
                className={cn(
                  "line-clamp-2 min-w-0 text-[19px] leading-tight font-medium tracking-[-0.02em] text-ink",
                  fadeIn.className,
                )}
              >
                {titleCase(course.name)}
              </h2>
            ) : (
              <Skeleton className="h-5 w-24" />
            )}
          </div>
        )}
        {course && (
          <div
            className={cn(
              "flex flex-col font-mono text-xs leading-normal text-ink-muted",
              // phone sheet: line up with the sheet title after its ‹ button
              showHeader ? "pl-7" : "pl-[38px]",
              fadeIn.className,
            )}
            onAnimationEnd={fadeIn.onAnimationEnd}
          >
            <span>{course.code}</span>
            <ExamLine
              label="Midsem"
              start={course.midsemStartTime}
              end={course.midsemEndTime}
              help={examHelp.midsem}
            />
            <ExamLine
              label="Compre"
              start={course.compreStartTime}
              end={course.compreEndTime}
              help={examHelp.compre}
            />
          </div>
        )}
        {course && currentSectionType && uniqueSectionTypes.length > 0 && (
          <Segmented
            // the 300px desktop panel (below xl) needs tighter tabs to fit full names
            className={cn(
              "mt-3 h-11 lg:h-10 lg:max-xl:[&>button]:gap-1 lg:max-xl:[&>button]:px-1.5 lg:max-xl:[&>button]:text-sm",
              fadeIn.className,
            )}
            aria-label="Section type"
            value={currentSectionType}
            onValueChange={(t) => {
              cancelAdvance();
              setType(t);
            }}
            options={uniqueSectionTypes.map((type) => {
              const pick = chosen(type);
              return {
                value: type,
                "aria-label": `${typeNames[type]}, ${
                  pick ? `${pick.type}${pick.number}` : "none chosen"
                }`,
                label: (
                  <>
                    <span className="truncate">{typeNames[type]}</span>
                    {pick ? (
                      <Badge variant="pill">
                        <Roll value={`${pick.type}${pick.number}`} />
                      </Badge>
                    ) : (
                      <Badge variant="pill-ghost">{type}</Badge>
                    )}
                  </>
                ),
              };
            })}
          />
        )}
      </div>
      <div
        ref={slide.scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onPointerDownCapture={cancelAdvance}
        onKeyDownCapture={cancelAdvance}
        {...swipe}
      >
        {course === undefined ? (
          <div className={sectionGroup}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 p-3">
                <Skeleton className="h-full w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-clip">
            {/* desktop cards have no side margins, so the gap keeps lists apart */}
            <div
              ref={slide.trackRef}
              className="relative flow-root [--slide-gap:0px] lg:[--slide-gap:32px]"
            >
              {slide.panes.map((pane) => {
                const offset = slide.offset(pane);
                return (
                  <div
                    key={pane.type}
                    data-current={offset === 0 || undefined}
                    inert={offset !== 0}
                    aria-hidden={offset !== 0 || undefined}
                    className={cn(offset !== 0 && "absolute inset-x-0 top-0")}
                    style={
                      offset !== 0
                        ? {
                            transform: `translateX(calc(${offset} * (100% + var(--slide-gap))))`,
                          }
                        : undefined
                    }
                  >
                    <SectionList
                      sections={course.sections.filter(
                        (section) => section.type === pane.type,
                      )}
                      chosen={timetable.sections}
                      seenIds={seen.current.ids}
                      pulse={offset === 0 && pulse}
                      busy={busy}
                      className={cn(sectionGroup, fadeIn.className)}
                      onPick={handleSectionClick}
                      onHover={hover}
                      onClashPick={pickClash}
                      onPulsed={() => setPulsedNonce(landed)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {course && timetable.sections.some((s) => s.courseId === course.id) && (
        <button
          type="button"
          aria-busy={busy || undefined}
          onClick={handleRemoveCourse}
          className={cn(
            "relative shrink-0 cursor-pointer text-[15px] font-semibold text-danger transition-colors duration-(--d-1) focus-visible:outline-offset-[-2px]",
            // phone: full-width bar; desktop: outlined button
            "border-t border-line bg-surface pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] hover:bg-danger-bg",
            "lg:mb-1 lg:rounded-xl lg:border lg:py-3",
            busy && "cursor-progress",
          )}
        >
          Remove {course.code} from timetable
          {!busy && <HapticTap />}
        </button>
      )}
    </div>
  );
};

export default CourseDetailsMenu;
