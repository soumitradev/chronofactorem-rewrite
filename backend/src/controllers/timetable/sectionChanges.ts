import type { Request, Response } from "express";
import type { sectionTypeList } from "lib";
import { type Course, type Section, Timetable } from "../../entity/entities.js";
import {
  sectionRepository,
  timetableRepository,
} from "../../repositories/index.js";
import {
  addExamTimings,
  checkForClassHoursClash,
  checkForExamHoursClash,
  formatSectionTimings,
  removeCourseExamTimes,
  removeSectionFromTimetable,
  updateSectionWarnings,
} from "../../utils/timetableDomain.js";
import type { TimetableContext } from "./helpers.js";

type SectionChange = {
  course: Course;
  section: Section;
  sectionTypes: sectionTypeList;
};

export const loadSectionWithCourse = async (
  res: Response,
  sectionId: string,
  notFoundMessage: string,
) => {
  const section = await sectionRepository.findOne({
    where: { id: sectionId },
    relations: { course: true },
  });
  if (!section) {
    res.status(404).json({ message: notFoundMessage });
    return null;
  }
  return section;
};

// Sends a 500 and returns null when the warnings say the section was never added
export const applyRemoveSection = (
  req: Request,
  res: Response,
  { author, timetable }: TimetableContext,
  { course, section, sectionTypes }: SectionChange,
) => {
  const sameCourseSections = timetable.sections.filter(
    (currentSection) => currentSection.courseId === section.courseId,
  );
  const isLastCourseSection = sameCourseSections.length === 1;
  if (isLastCourseSection) {
    timetable.examTimes = removeCourseExamTimes(
      timetable.examTimes,
      course.code,
    );
  }

  removeSectionFromTimetable(timetable, section);

  try {
    timetable.warnings = updateSectionWarnings(
      course.code,
      section,
      sectionTypes,
      false,
      timetable.warnings,
    );
  } catch {
    req.log.error(
      `user with id ${author.id} tried to remove section ${section.type}${section.number} of course ${course.code} but it isn't part of their timetable according to warnings`,
    );
    res.status(500).json({
      message:
        "Timetable and warnings state inconsistent, please contact us if you see this",
    });
    return null;
  }
  return { writeExamTimes: isLastCourseSection };
};

// Sends a 400 and returns null when the section clashes with the timetable
export const applyAddSection = (
  res: Response,
  timetable: Timetable,
  { course, section, sectionTypes }: SectionChange,
) => {
  const classHourClashes = checkForClassHoursClash(timetable, section);
  if (classHourClashes.clash) {
    res.status(400).json({
      message: `section clashes with ${classHourClashes.course}`,
    });
    return null;
  }

  const examHourClashes = checkForExamHoursClash(timetable, course);
  if (examHourClashes.clash && !examHourClashes.sameCourse) {
    res.status(400).json({
      message: `course's exam clashes with ${examHourClashes.course}'s ${examHourClashes.exam}`,
    });
    return null;
  }

  const hasSectionOfSameType = timetable.sections.some(
    (currentSection) =>
      currentSection.courseId === section.courseId &&
      currentSection.type === section.type,
  );
  if (hasSectionOfSameType) {
    res.status(400).json({
      message: `can't have multiple sections of type ${section.type}`,
    });
    return null;
  }

  timetable.warnings = updateSectionWarnings(
    course.code,
    section,
    sectionTypes,
    true,
    timetable.warnings,
  );
  timetable.timings = [
    ...timetable.timings,
    ...formatSectionTimings(course.code, section),
  ];
  if (!examHourClashes.sameCourse) {
    addExamTimings(timetable.examTimes, course);
  }
  return { writeExamTimes: !examHourClashes.sameCourse };
};

export const persistTimetableSectionDelta = (
  timetable: Timetable,
  {
    removed = [],
    added = [],
    writeExamTimes,
  }: { removed?: Section[]; added?: Section[]; writeExamTimes: boolean },
) =>
  timetableRepository.manager.transaction(async (manager) => {
    const timetableSections = () =>
      manager
        .createQueryBuilder()
        .relation(Timetable, "sections")
        .of(timetable);
    if (removed.length > 0) {
      await timetableSections().remove(removed);
    }
    if (added.length > 0) {
      await timetableSections().add(added);
    }
    // add and swap leave examTimes alone when the course's exams were already stored
    await manager.update(Timetable, timetable.id, {
      timings: timetable.timings,
      warnings: timetable.warnings,
      ...(writeExamTimes && { examTimes: timetable.examTimes }),
    });
  });
