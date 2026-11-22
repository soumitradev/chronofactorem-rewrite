import type { Request, Response } from "express";
import { namedUUIDType, timetableIDType } from "lib";
import { z } from "zod";
import { Timetable } from "../../entity/entities.js";
import { validate } from "../../middleware/zodValidateRequest.js";
import {
  courseRepository,
  sectionRepository,
  timetableRepository,
} from "../../repositories/index.js";
import {
  addExamTimings,
  checkForClassHoursClash,
  checkForExamHoursClash,
  formatSectionTimings,
  updateSectionWarnings,
} from "../../utils/timetableDomain.js";
import { getCourseSectionTypes, loadTimetableContext } from "./helpers.js";

const dataSchema = z.object({
  body: z.object({
    sectionId: namedUUIDType("section"),
  }),
  params: z.object({
    id: timetableIDType,
  }),
});

export const addSectionValidator = validate(dataSchema);

export const addSection = async (req: Request, res: Response) => {
  const sectionId = req.body.sectionId;

  const context = await loadTimetableContext(req, res, {
    withSections: true,
    draftOnly: true,
  });
  if (!context) {
    return;
  }
  const { timetable } = context;

  const section = await sectionRepository.findOneBy({ id: sectionId });

  if (!section) {
    return res.status(404).json({ message: "section not found" });
  }

  const courseId = section.courseId;

  const course = await courseRepository.findOneBy({ id: courseId });

  if (!course) {
    return res.status(404).json({ message: "course not found" });
  }

  if (course.archived) {
    return res.status(418).json({ message: "course is archived" });
  }

  const classHourClashes = checkForClassHoursClash(timetable, section);
  if (classHourClashes.clash) {
    return res.status(400).json({
      message: `section clashes with ${classHourClashes.course}`,
    });
  }

  const examHourClashes = checkForExamHoursClash(timetable, course);
  if (examHourClashes.clash && !examHourClashes.sameCourse) {
    return res.status(400).json({
      message: `course's exam clashes with ${examHourClashes.course}'s ${examHourClashes.exam}`,
    });
  }

  const sectionTypes = await getCourseSectionTypes(
    sectionRepository.manager,
    courseId,
  );

  // the timetable's sections were already loaded with it above, so this
  // check happens in memory, same as in removeSection and swapSections
  const sameCourseSectionsCount = timetable.sections.filter(
    (currentSection) => {
      return (
        currentSection.courseId === courseId &&
        currentSection.type === section?.type
      );
    },
  ).length;

  if (sameCourseSectionsCount > 0) {
    return res.status(400).json({
      message: `can't have multiple sections of type ${section.type}`,
    });
  }

  timetable.warnings = updateSectionWarnings(
    course.code,
    section,
    sectionTypes,
    true,
    timetable.warnings,
  );

  const newTimes = formatSectionTimings(course.code, section);

  const newExamTimes = timetable.examTimes;
  addExamTimings(newExamTimes, course);

  await timetableRepository.manager.transaction(
    async (transactionalEntityManager) => {
      // shoudn't be needed, but kept them here as it was erroring out
      if (!course) {
        return res.status(404).json({ message: "course not found" });
      }
      if (!timetable) {
        return res.status(404).json({ message: "timetable not found" });
      }

      await transactionalEntityManager
        .createQueryBuilder()
        .relation(Timetable, "sections")
        .of(timetable)
        .add(section);

      await transactionalEntityManager
        .createQueryBuilder()
        .update(Timetable)
        .set({
          timings: [...timetable.timings, ...newTimes],
          warnings: timetable.warnings,
        })
        .where("timetable.id = :id", { id: timetable.id })
        .execute();

      if (!examHourClashes.sameCourse) {
        await transactionalEntityManager
          .createQueryBuilder()
          .update(Timetable)
          .set({
            examTimes: newExamTimes,
          })
          .where("timetable.id = :id", { id: timetable.id })
          .execute();
      }
    },
  );
  return res.json({ message: "section added" });
};
