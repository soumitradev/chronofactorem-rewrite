import type { Request, Response } from "express";
import {
  courseWithSectionsType,
  namedNonEmptyStringType,
  type sectionTypeList,
} from "lib";
import { z } from "zod";
import { env } from "../../config/server.js";
import { AppDataSource } from "../../db.js";
import { Course, Section, Timetable } from "../../entity/entities.js";
import { validate } from "../../middleware/zodValidateRequest.js";
import {
  addExamTimings,
  checkForClassHoursClash,
  checkForExamHoursClash,
  checkForExamTimingsChange,
  formatSectionTimings,
  removeCourseExamTimes,
  removeSectionFromTimetable,
  updateSectionWarnings,
} from "../../utils/timetableDomain.js";
import { getCourseSectionTypes } from "./helpers.js";

const dataSchema = z.object({
  body: z.object({
    chronoSecret: namedNonEmptyStringType("chronoSecret"),
    course: courseWithSectionsType,
  }),
});

export const updateChangedTimetableValidator = validate(dataSchema);

export const updateChangedTimetable = async (req: Request, res: Response) => {
  if (env.CHRONO_SECRET !== req.body.chronoSecret) {
    return res.status(401).json({ message: "Chrono Secret is incorrect" });
  }
  await AppDataSource.transaction(async (manager) => {
    const course: Course = req.body.course;
    await manager
      .createQueryBuilder()
      .update(Course)
      .set({
        midsemStartTime: course.midsemStartTime,
        midsemEndTime: course.midsemEndTime,
        compreStartTime: course.compreStartTime,
        compreEndTime: course.compreEndTime,
      })
      .where("id = :id", { id: course.id })
      .andWhere("archived = :archived", { archived: false })
      .execute();

    const requiredSectionTypes: sectionTypeList = await getCourseSectionTypes(
      manager,
      course.id,
    );

    const timetables: Timetable[] = await manager
      .createQueryBuilder(Timetable, "timetable")
      .leftJoinAndSelect("timetable.sections", "section")
      .where("section.courseId = :id", { id: course.id })
      .andWhere("timetable.archived = :archived", { archived: false })
      .getMany();

    for (const timetable of timetables) {
      const removedSections: Section[] = [];
      if (checkForExamTimingsChange(timetable, course)) {
        timetable.examTimes = removeCourseExamTimes(
          timetable.examTimes,
          course.code,
        );

        if (checkForExamHoursClash(timetable, course).clash) {
          for (const sec of timetable.sections) {
            removedSections.push(sec);
            removeSectionFromTimetable(timetable, sec);
          }
          timetable.warnings = timetable.warnings.filter(
            (warning) => warning.split(":")[0] !== course.code,
          );
          // a changed timetable has to be checked and published again
          timetable.draft = true;
          timetable.private = true;
        } else {
          addExamTimings(timetable.examTimes, course);
        }
      }
      for (const section of timetable.sections) {
        const newSection = course.sections.find((el) => el.id === section.id);

        if (newSection !== undefined) {
          removeSectionFromTimetable(timetable, section);

          if (checkForClassHoursClash(timetable, newSection).clash) {
            // keep the clashing section out and unpublish the timetable so
            // its author sees the missing section in the warnings
            removedSections.push(section);
            timetable.draft = true;
            timetable.private = true;
            timetable.warnings = updateSectionWarnings(
              course.code,
              section,
              requiredSectionTypes,
              false,
              timetable.warnings,
            );
          } else {
            timetable.timings = [
              ...timetable.timings,
              ...formatSectionTimings(course.code, newSection),
            ];
            timetable.sections = [...timetable.sections, newSection];
          }
        }
      }

      const sameCourseSections: Section[] = timetable.sections.filter(
        (currentSection) => {
          return currentSection.courseId === course.id;
        },
      );
      if (sameCourseSections.length === 0) {
        timetable.examTimes = removeCourseExamTimes(
          timetable.examTimes,
          course.code,
        );
      }

      if (removedSections.length > 0) {
        await manager
          .createQueryBuilder()
          .relation(Timetable, "sections")
          .of(timetable)
          .remove(removedSections);
      }
      // update() not save(): the join only loaded this course's sections
      await manager.update(Timetable, timetable.id, {
        timings: timetable.timings,
        examTimes: timetable.examTimes,
        warnings: timetable.warnings,
        draft: timetable.draft,
        private: timetable.private,
      });
    }

    for (const section of course.sections) {
      await manager
        .createQueryBuilder()
        .update(Section, { roomTime: section.roomTime })
        .where("section.id = :id", { id: section.id })
        .execute();
    }
  });

  return res.json({ message: "Timetable successfully updated" });
};
