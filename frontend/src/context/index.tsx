import { useQuery } from "@tanstack/react-query";
import { notFound, useParams } from "@tanstack/react-router";
import type {
  courseType,
  courseWithSectionsType,
  sectionTypeEnum,
  sectionTypeList,
  timetableWithSectionsType,
  userWithTimetablesType,
} from "lib";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type z from "zod";
import { useTheme } from "@/components/ThemeProvider";
import { courseQueryOptions, useCourse } from "@/data-access/courses";
import { useTimetable } from "@/data-access/timetables";
import { useUser } from "@/data-access/user";
import { courseHues } from "@/lib/courseHues";
import type { TimetableSearch } from "@/lib/timetableSearch";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useTimetableNav } from "@/lib/useTimetableNav";
import {
  filterCoursesInTimetable,
  formatCDCWarningsAndOptions,
  getFilledTimetableSections,
  hasUnknownCourses,
  type TimetableSectionType,
} from "@/utils/timetable";

type SpecialCDCType =
  | {
      id: null;
      type: "optional";
      options: z.infer<typeof courseType>[];
    }
  | {
      id: null;
      type: "warning";
      warning: string;
    };

export type CDCType = z.infer<typeof courseType> | SpecialCDCType;

export type TimetableStateType = {
  isVertical: boolean;
  isCopyingTimetable: boolean;
  screenIsLarge: boolean;
  currentCourseID: string | null;
  currentSectionType: sectionTypeEnum | null;
  currentTab: NonNullable<TimetableSearch["tab"]>;
  searchTerm: string;
  user: z.infer<typeof userWithTimetablesType> | undefined;
  courses: z.infer<typeof courseType>[] | undefined;
  timetable: z.infer<typeof timetableWithSectionsType> | undefined;
  coursesInTimetable: z.infer<typeof courseType>[];
  cdcs: CDCType[];
  course: z.infer<typeof courseWithSectionsType> | undefined;
  isCourseLoading: boolean;
  uniqueSectionTypes: sectionTypeList;
  timetableDetailsSections: TimetableSectionType[];
  courseHues: Map<string, number>;
};

// useOrientation (owned by cleanup/frontend-grid-time) still dispatches this;
// switch it to toggleVertical once both branches land
export enum TimetableActionType {
  ToggleVertical = 0,
}

type TimetableProviderType = {
  state: TimetableStateType;
  toggleVertical: () => void;
  setIsCopyingTimetable: (copying: boolean) => void;
  dispatch: (action: { type: TimetableActionType.ToggleVertical }) => void;
};

const TimetableState = createContext<TimetableProviderType | undefined>(
  undefined,
);

export const useTimetableState = () => {
  const value = useContext(TimetableState);
  if (!value) throw new Error("Timetable state requires a TimetableProvider");
  return value;
};

export const TimetableProvider = ({
  children,
  fallback,
}: {
  children: React.ReactNode;
  // shown while data the route loader didn't wait for (the user) loads
  fallback: React.ReactNode;
}) => {
  const { timetableId } = useParams({
    strict: false,
  });
  if (timetableId === undefined) throw notFound();
  return (
    <TimetableDataProvider
      key={timetableId}
      timetableId={timetableId}
      fallback={fallback}
    >
      {children}
    </TimetableDataProvider>
  );
};

const TimetableDataProvider = ({
  children,
  timetableId,
  fallback,
}: {
  children: React.ReactNode;
  timetableId: string;
  fallback: React.ReactNode;
}) => {
  const { data: user, isLoading: isUserLoading } = useUser();
  const { data: timetable, isLoading: isTimetableLoading } =
    useTimetable(timetableId);
  const {
    data: courses,
    isLoading: isCoursesLoading,
    refetch: refetchCourses,
  } = useQuery({
    ...courseQueryOptions(
      timetable === undefined
        ? undefined
        : { acadYear: timetable.acadYear, semester: timetable.semester },
    ),
    enabled: timetable !== undefined,
  });
  const [isVertical, setIsVertical] = useState(false);
  const [isCopyingTimetable, setIsCopyingTimetable] = useState(false);
  const screenIsLarge = useIsDesktop();
  const { search } = useTimetableNav();
  const { data: course, isLoading: isCourseLoading } = useCourse(
    search.course ?? null,
  );
  const { colorSeed } = useTheme();
  const toggleVertical = useCallback(() => setIsVertical((v) => !v), []);

  const value = useMemo(() => {
    const uniqueSectionTypes = course
      ? [...new Set(course.sections.map((section) => section.type))].sort()
      : [];
    return {
      state: {
        isVertical,
        isCopyingTimetable,
        screenIsLarge,
        user,
        timetable,
        courses,
        course,
        isCourseLoading,
        uniqueSectionTypes,
        currentCourseID: search.course ?? null,
        currentSectionType:
          search.type && uniqueSectionTypes.includes(search.type)
            ? search.type
            : (uniqueSectionTypes[0] ?? null),
        currentTab: search.tab ?? "courses",
        searchTerm: search.q ?? "",
        coursesInTimetable:
          courses && timetable
            ? filterCoursesInTimetable(courses, timetable)
            : [],
        timetableDetailsSections:
          courses && timetable
            ? getFilledTimetableSections(courses, timetable)
            : [],
        courseHues: courseHues(
          (timetable?.timings ?? []).map((entry) => entry.split(":", 1)[0]),
          colorSeed,
        ),
        cdcs:
          courses && timetable
            ? formatCDCWarningsAndOptions(courses, timetable)
            : [],
      },
      toggleVertical,
      setIsCopyingTimetable,
      dispatch: toggleVertical,
    };
  }, [
    isVertical,
    isCopyingTimetable,
    screenIsLarge,
    search,
    user,
    timetable,
    courses,
    course,
    isCourseLoading,
    colorSeed,
    toggleVertical,
  ]);

  // a timetable with unknown courses refetches the course list once
  const refetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!courses || !timetable || refetchedFor.current === timetable.id) return;
    if (!hasUnknownCourses(courses, timetable)) return;
    refetchedFor.current = timetable.id;
    refetchCourses();
  }, [courses, timetable, refetchCourses]);

  if (isUserLoading || isCoursesLoading || isTimetableLoading) {
    return fallback;
  }

  return (
    <TimetableState.Provider value={value}>{children}</TimetableState.Provider>
  );
};
