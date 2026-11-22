import type { courseType, timetableWithSectionsType } from "lib";
import { unknownDegree } from "lib";
import type z from "zod";
import type { CDCType } from "@/context/types";
import CDCList from "@/data/CDCs.json";

export const filterCoursesInTimetable = (
  courses: z.infer<typeof courseType>[],
  timetable: z.infer<typeof timetableWithSectionsType>,
) => {
  const timetableCourses = new Set(timetable.sections.map((x) => x.courseId));
  return courses.filter((x) => timetableCourses.has(x.id));
};

export type TimetableSectionType = {
  id: string;
  name: string;
  roomTime: string[];
  courseId: string;
  type: string;
  number: number;
  instructors: string[];
};

export const getFilledTimetableSections = (
  courses: z.infer<typeof courseType>[],
  timetable: z.infer<typeof timetableWithSectionsType>,
) => {
  const courseMap = new Map(courses.map((x) => [x.id, x] as const));
  // drop sections whose course isn't loaded yet; hasUnknownCourses refetches them
  return timetable.sections.flatMap((x) => {
    const course = courseMap.get(x.courseId);
    if (!course) return [];
    return [{ ...x, name: course.name, courseId: course.code }];
  });
};

export const hasUnknownCourses = (
  courses: z.infer<typeof courseType>[],
  timetable: z.infer<typeof timetableWithSectionsType>,
) => {
  const ids = new Set(courses.map((x) => x.id));
  return timetable.sections.some((x) => !ids.has(x.courseId));
};

type CdcTimetable = Pick<
  z.infer<typeof timetableWithSectionsType>,
  "degrees" | "year" | "semester"
>;

export const cdcListFor = (timetable: CdcTimetable): string[] | undefined => {
  // CDCs.json keys are the degrees sorted then reversed ("B1A1"); reverse duals like "A3B4" and 2+2 codes may not match
  const degree = (
    timetable.degrees.length === 1
      ? timetable.degrees[0]
      : [...timetable.degrees].sort().reverse().join("")
  ) as keyof typeof CDCList;
  const cdcListKey =
    `${timetable.year}-${timetable.semester}` as keyof (typeof CDCList)[typeof degree];

  return degree in CDCList && cdcListKey in CDCList[degree]
    ? CDCList[degree][cdcListKey]
    : undefined;
};

export const formatCDCWarningsAndOptions = (
  courses: z.infer<typeof courseType>[],
  timetable: z.infer<typeof timetableWithSectionsType>,
) => {
  const coursesList = [];

  const cdcs = cdcListFor(timetable);
  if (cdcs === undefined) return [];

  for (let i = 0; i < cdcs.length; i++) {
    // "ECON/MGTS F211/F211" means either course counts
    if (cdcs[i].includes("/")) {
      const [depts, codes] = cdcs[i].split(" ").map((part) => part.split("/"));
      const options = depts.map((dept, j) => `${dept} ${codes[j]}`);
      const matchedCourses = courses.filter((e) => options.includes(e.code));
      if (matchedCourses.length === 0) {
        coursesList.push({
          id: null,
          type: "warning" as const,
          warning: `One CDC of ${options.join(", ")} not found`,
        });
      } else {
        // a partly found set still offers the options that exist
        coursesList.push({
          id: null,
          type: "optional" as const,
          options: matchedCourses,
        });
        for (const code of options) {
          if (!matchedCourses.some((e) => e.code === code)) {
            coursesList.push({
              id: null,
              type: "warning" as const,
              warning: `CDC ${code} not found`,
            });
          }
        }
      }
    } else {
      const matchedCourses = courses.filter((e) => e.code === cdcs[i]);
      if (matchedCourses.length === 1) {
        coursesList.push(matchedCourses[0]);
      } else {
        coursesList.push({
          id: null,
          type: "warning" as const,
          warning: `CDC ${cdcs[i]} not found`,
        });
      }
    }
  }

  return coursesList;
};

type Course = z.infer<typeof courseType>;

type RemainingEntry =
  | { kind: "course"; course: Course }
  | { kind: "set"; key: string; options: Course[] };

// a set leaves as soon as any of its options is added; not-found warnings never show
export const getRemainingCdcs = (
  cdcs: CDCType[],
  added: Course[],
): RemainingEntry[] => {
  const addedIds = new Set(added.map((c) => c.id));
  const remaining: RemainingEntry[] = [];
  for (const cdc of cdcs) {
    if (cdc.id !== null) {
      if (!addedIds.has(cdc.id))
        remaining.push({ kind: "course", course: cdc });
    } else if (cdc.type === "optional") {
      if (!cdc.options.some((o) => addedIds.has(o.id))) {
        remaining.push({
          kind: "set",
          key: cdc.options.map((o) => o.id).join("|"),
          options: cdc.options,
        });
      }
    }
  }
  return remaining;
};

export const getMissingCdcs = (
  cdcs: CDCType[],
  added: Course[],
): { courseId: string | null; code: string; name: string }[] =>
  getRemainingCdcs(cdcs, added).map((entry) => {
    const single =
      entry.kind === "course"
        ? entry.course
        : entry.options.length === 1
          ? entry.options[0]
          : null;
    return single
      ? { courseId: single.id, code: single.code, name: single.name }
      : {
          courseId: null,
          code: (entry as Extract<RemainingEntry, { kind: "set" }>).options
            .map((c) => c.code)
            .join(" (or) "),
          name: "",
        };
  });

export const timetableMeta = (t: {
  year: number;
  semester: number;
  acadYear: number;
  degrees: string[];
}): string[] => {
  const parts: string[] = [];
  if (t.year !== 0) parts.push(`${t.year}-${t.semester}`);
  parts.push(`${t.acadYear}–${String(t.acadYear + 1).slice(2)}`);
  if (!t.degrees.includes(unknownDegree)) parts.push(t.degrees.join(""));
  return parts;
};

export const cdcIssueUrl = (
  t: CdcTimetable & { acadYear: number },
  notFound: string[],
): string => {
  const sem = `${t.year}-${t.semester}`;
  const body = [
    notFound.length > 0
      ? "Chrono could not find some of my CDCs in the list of courses."
      : "Chrono does not list any CDCs for my degree and semester.",
    "",
    `- Degree: ${t.degrees.join(", ")}`,
    `- Year and semester: ${sem}`,
    `- Timetable: ${t.acadYear}–${String(t.acadYear + 1).slice(2)}, semester ${t.semester}`,
    ...(notFound.length > 0 ? ["", ...notFound.map((w) => `- ${w}`)] : []),
  ].join("\n");
  const params = new URLSearchParams({
    title: `CDCs not found for ${t.degrees.join("")} ${sem}`,
    body,
  });
  return `https://github.com/crux-bphc/chronofactorem-rewrite/issues/new?${params}`;
};
