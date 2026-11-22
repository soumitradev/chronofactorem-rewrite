import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import ReportIssueToastAction from "@/components/ReportIssueToastAction";
import { TimetableSurface } from "@/components/timetable/TimetableSurface";
import { toast } from "@/components/ui/use-toast";
import { useTimetableState } from "@/context";
import { hueStyle } from "@/lib/courseHues";
import { formatExam } from "@/lib/formatTime";
import { haptic } from "@/lib/haptics";
import { titleCase } from "@/lib/titleCase";
import { timetableMeta } from "@/utils/timetable";
import { useOrientation } from "./useOrientation";

export type ExportStatus = "idle" | "rendering" | "done";

const DONE_MS = 1200;
const NOT_PREPARED =
  "The timetable image could not be prepared. Please try again.";

let styleProperties: string[] | undefined;

// html-to-image copies all ~530 computed properties onto every clone, blocking the main thread
// for half a second; only declared properties can differ from the clone's defaults, so copy those
function declaredStyleProperties(node: HTMLElement): string[] {
  if (styleProperties) return styleProperties;
  const declared = new Set<string>();
  const add = (style: CSSStyleDeclaration) => {
    for (let i = 0; i < style.length; i++) declared.add(style[i]);
  };
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if ("style" in rule && rule.style instanceof CSSStyleDeclaration)
        add(rule.style);
      if ("cssRules" in rule && rule.cssRules instanceof CSSRuleList)
        visit(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules);
    } catch {
      // a cross-origin sheet can't be read; html-to-image skips it too
    }
  }
  for (const el of node.querySelectorAll<HTMLElement>("[style]")) add(el.style);
  styleProperties = Array.from(
    getComputedStyle(document.documentElement),
  ).filter(
    // custom properties are already resolved, and a still image doesn't animate
    (name) => declared.has(name) && !/^(--|animation-|transition-)/.test(name),
  );
  return styleProperties;
}

const ExportList = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <>
    <h3 className="text-[13px] font-medium text-ink-muted">{title}</h3>
    <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
      {children}
    </ul>
  </>
);

const ExportRow = ({
  hue,
  name,
  code,
  children,
}: {
  hue: number | undefined;
  name: string;
  code?: string;
  children: React.ReactNode;
}) => (
  <li className="flex items-center justify-between gap-4 px-4 py-3">
    <div className="flex min-w-0 items-start gap-2.5">
      {hue !== undefined && (
        <span
          aria-hidden="true"
          className="course-tint mt-1.5 size-2.5 shrink-0 rounded-[3px] border border-line bg-ev"
          style={hueStyle(hue)}
        />
      )}
      <div className="min-w-0">
        <div className="truncate text-[15px] leading-snug font-medium text-ink">
          {titleCase(name)}
        </div>
        {code && <div className="font-mono text-xs text-ink-muted">{code}</div>}
      </div>
    </div>
    {children}
  </li>
);

function ExamList({
  title,
  kind,
}: {
  title: string;
  kind: "MIDSEM" | "COMPRE";
}) {
  const {
    state: { timetable, coursesInTimetable, courseHues },
  } = useTimetableState();
  if (timetable === undefined) return null;
  const nameOf = (code: string) =>
    coursesInTimetable.find((c) => c?.code === code)?.name;
  const exams = timetable.examTimes
    .filter((e) => e.includes(`|${kind}|`))
    .map((e) => {
      const parts = e.split("|");
      return { code: parts[0], start: parts[2], end: parts[3] };
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (exams.length === 0) return null;
  return (
    <div>
      <ExportList title={title}>
        {exams.map((exam) => {
          const name = nameOf(exam.code);
          return (
            <ExportRow
              key={exam.code}
              hue={courseHues.get(exam.code)}
              name={name ?? exam.code}
              code={name && exam.code}
            >
              <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-ink">
                {formatExam(exam.start, exam.end)}
              </span>
            </ExportRow>
          );
        })}
      </ExportList>
    </div>
  );
}

// draw the 2880px-wide PNG from its own offscreen desktop-width frame so it never
// depends on the live page's viewport, view, now-line or hover state
export function useTimetableExport(): {
  status: ExportStatus;
  exportPng(): Promise<void>;
  exportElement: React.ReactNode;
} {
  const {
    state: {
      timetable,
      coursesInTimetable,
      timetableDetailsSections,
      courseHues,
    },
  } = useTimetableState();
  const { orientation } = useOrientation();
  const [status, setStatus] = useState<ExportStatus>("idle");
  const busy = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(doneTimer.current), []);

  const exportPng = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    clearTimeout(doneTimer.current);
    setStatus("rendering");
    try {
      // loaded on first export, since most visits never export
      const htmlToImage = import("html-to-image");
      // wait for the offscreen frame to mount and lay out
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await document.fonts.ready;
      const node = frame.current;
      if (!node) throw new Error(NOT_PREPARED);
      // toBlob encodes the PNG off the main thread, unlike toPng's toDataURL
      const { toBlob } = await htmlToImage;
      const blob = await toBlob(node, {
        pixelRatio: 2,
        cacheBust: true,
        style: { position: "static" },
        includeStyleProperties: declaredStyleProperties(node),
      });
      if (!blob) throw new Error(NOT_PREPARED);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = "timetable.png";
      link.href = url;
      link.click();
      haptic("success");
      // Safari and Firefox read the blob after click() returns; revoking on the
      // next tick can cancel the download, so give it time (as FileSaver does)
      setTimeout(() => URL.revokeObjectURL(url), 40_000);
      // the "done" window is feedback only; a new export may start in it
      busy.current = false;
      setStatus("done");
      doneTimer.current = setTimeout(() => {
        setStatus("idle");
      }, DONE_MS);
    } catch (error) {
      busy.current = false;
      setStatus("idle");
      toast({
        title: "Could not export timetable",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
        action: <ReportIssueToastAction />,
      });
    }
  }, []);

  const exportElement =
    status === "rendering" && timetable !== undefined ? (
      <div
        aria-hidden="true"
        ref={frame}
        className="pointer-events-none fixed left-[-10000px] top-0 w-[1440px] bg-bg px-10 pt-9 pb-10 text-ink"
      >
        <h2 className="text-[36px] leading-[1.08] font-normal tracking-[-0.03em]">
          {timetable.name}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-ink-muted">
          {timetableMeta(timetable).map((part, i) => (
            <Fragment key={part}>
              {i > 0 && (
                <span aria-hidden="true" className="text-ink-faint">
                  ·
                </span>
              )}
              <span className={i === 0 ? "font-medium text-ink" : undefined}>
                {part}
              </span>
            </Fragment>
          ))}
        </div>
        <div className={`mt-6 ${orientation === "rows" ? "h-[720px]" : ""}`}>
          <TimetableSurface
            sections={timetableDetailsSections}
            layout="desktop"
            view="week"
            day={0}
            orientation={orientation}
            mode="export"
          />
        </div>
        <div className="mt-7 grid grid-cols-[1fr_1fr] gap-10">
          <div>
            {coursesInTimetable.some((course) => course !== undefined) && (
              <ExportList title="Courses">
                {coursesInTimetable.map((course) => {
                  if (course === undefined) return null;
                  const sections = timetable.sections
                    .filter((s) => s.courseId === course.id)
                    .map((s) => `${s.type}${s.number}`)
                    .sort();
                  return (
                    <ExportRow
                      key={course.id}
                      hue={courseHues.get(course.code)}
                      name={course.name}
                      code={course.code}
                    >
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {sections.map((section) => (
                          <span
                            key={section}
                            className="rounded-md bg-sunk px-2 py-0.5 font-mono text-xs font-medium text-ink-muted"
                          >
                            {section}
                          </span>
                        ))}
                      </div>
                    </ExportRow>
                  );
                })}
              </ExportList>
            )}
          </div>
          <div className="flex flex-col gap-6">
            <ExamList title="Midsems" kind="MIDSEM" />
            <ExamList title="Compres" kind="COMPRE" />
          </div>
        </div>
        <p className="mt-7 font-mono text-xs text-ink-faint">
          Made with ChronoFactorem
        </p>
      </div>
    ) : null;

  return { status, exportPng, exportElement };
}
