import { getClashingExamTimes, type sectionTypeList } from "lib";
import type { Course, Section, Timetable } from "../entity/entities.js";

const roomTimeSlot = (roomTime: string) => {
  const [, , day, hour] = roomTime.split(":");
  return `${day}${hour}`;
};

export const formatSectionTimings = (courseCode: string, section: Section) =>
  section.roomTime.map((roomTime) => `${courseCode}:${roomTimeSlot(roomTime)}`);

export const removeCourseExamTimes = (
  examTimes: string[],
  courseCode: string,
) => examTimes.filter((examTime) => examTime.split("|")[0] !== courseCode);

export const checkForExamTimingsChange = (
  timetable: Timetable,
  course: Course,
) => {
  const findExamTimes = (exam: "MIDSEM" | "COMPRE") =>
    timetable.examTimes
      .find((examTime) => {
        const [courseCode, examType] = examTime.split("|");
        return courseCode === course.code && examType === exam;
      })
      ?.split("|");

  const midsemTimes = findExamTimes("MIDSEM");
  const compreTimes = findExamTimes("COMPRE");

  return (
    midsemTimes?.[2] !== `${course.midsemStartTime}` ||
    midsemTimes?.[3] !== `${course.midsemEndTime}` ||
    compreTimes?.[2] !== `${course.compreStartTime}` ||
    compreTimes?.[3] !== `${course.compreEndTime}`
  );
};

export const checkForClassHoursClash = (
  timetable: Timetable,
  newSection: Section,
) => {
  const courseCodeBySlot = new Map<string, string>();
  for (const time of timetable.timings) {
    const [courseCode, slot] = time.split(":");
    courseCodeBySlot.set(slot, courseCode);
  }

  for (const roomTime of newSection.roomTime) {
    const clashCourse = courseCodeBySlot.get(roomTimeSlot(roomTime));
    if (clashCourse !== undefined) {
      return { clash: true, course: clashCourse };
    }
  }

  return { clash: false, course: null };
};

export const checkForExamHoursClash = (
  timetable: Timetable,
  newCourse: Course,
) => {
  if (
    timetable.examTimes.some((time) => time.split("|")[0] === newCourse.code)
  ) {
    return { clash: false, exam: "", course: "", sameCourse: true };
  }
  for (const exam of ["midsem", "compre"] as const) {
    const course = {
      ...newCourse,
      midsemStartTime: exam === "midsem" ? newCourse.midsemStartTime : null,
      midsemEndTime: exam === "midsem" ? newCourse.midsemEndTime : null,
      compreStartTime: exam === "compre" ? newCourse.compreStartTime : null,
      compreEndTime: exam === "compre" ? newCourse.compreEndTime : null,
    };
    const clashes = getClashingExamTimes(course, timetable.examTimes);
    if (clashes)
      return {
        clash: true,
        exam,
        course: clashes[0].split("|")[0],
        sameCourse: false,
      };
  }
  return { clash: false, exam: "", course: "", sameCourse: false };
};

export const removeSectionFromTimetable = (
  timetable: Timetable,
  section: Section,
) => {
  const slots = section.roomTime.map(roomTimeSlot);
  timetable.timings = timetable.timings.filter(
    (time) => !slots.includes(time.split(":")[1]),
  );
  timetable.sections = timetable.sections.filter(
    (currentSection) => currentSection.id !== section.id,
  );
};

export const addExamTimings = (examTimes: string[], course: Course) => {
  if (course.midsemStartTime !== null && course.midsemEndTime !== null) {
    examTimes.push(
      `${course.code}|MIDSEM|${course.midsemStartTime.toISOString()}|${course.midsemEndTime.toISOString()}`,
    );
  }
  if (course.compreStartTime !== null && course.compreEndTime !== null) {
    examTimes.push(
      `${course.code}|COMPRE|${course.compreStartTime.toISOString()}|${course.compreEndTime.toISOString()}`,
    );
  }
};

// a warning lists the section types a course is still missing, e.g. "CS F211:LP"
export const updateSectionWarnings = (
  courseCode: string,
  section: Section,
  requiredSectionTypes: sectionTypeList,
  isAdded: boolean,
  warnings: string[],
) => {
  const missingTypesByCourse = new Map<string, Set<string>>();
  for (const warning of warnings) {
    const [warningCourseCode, missingTypes] = warning.split(":");
    missingTypesByCourse.set(
      warningCourseCode,
      new Set(missingTypes.split("")),
    );
  }

  const sectionType = section.type;
  const missingTypes = missingTypesByCourse.get(courseCode);

  if (isAdded) {
    if (!missingTypes) {
      const stillMissing = requiredSectionTypes.filter(
        (requiredType) => requiredType !== sectionType,
      );
      if (stillMissing.length !== 0) {
        missingTypesByCourse.set(courseCode, new Set(stillMissing));
      }
    } else if (missingTypes.delete(sectionType) && missingTypes.size === 0) {
      missingTypesByCourse.delete(courseCode);
    }
  } else if (!missingTypes) {
    if (requiredSectionTypes.length > 1) {
      missingTypesByCourse.set(courseCode, new Set([sectionType]));
    }
  } else {
    if (missingTypes.has(sectionType)) {
      throw Error(
        "Removing a course that should not be there according to warnings",
      );
    }
    if (requiredSectionTypes.includes(sectionType)) {
      missingTypes.add(sectionType);
      if (missingTypes.size === requiredSectionTypes.length) {
        missingTypesByCourse.delete(courseCode);
      }
    }
  }

  return [...missingTypesByCourse].map(
    ([warningCourseCode, types]) =>
      `${warningCourseCode}:${[...types].join("")}`,
  );
};
