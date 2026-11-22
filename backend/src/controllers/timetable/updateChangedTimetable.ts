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
      if (checkForExamTimingsChange(timetable, course)) {
        timetable.examTimes = removeCourseExamTimes(
          timetable.examTimes,
          course.code,
        );

        if (checkForExamHoursClash(timetable, course).clash) {
          for (const sec of timetable.sections) {
            await manager
              .createQueryBuilder()
              .relation(Timetable, "sections")
              .of(timetable)
              .remove(sec);
            removeSectionFromTimetable(timetable, sec);
          }
          // a changed timetable has to be checked and published again
          timetable.draft = true;
          timetable.private = true;
        } else {
          const newExamTimes = timetable.examTimes;
          addExamTimings(newExamTimes, course);
          timetable.examTimes = newExamTimes;
        }
      }
      for (const section of timetable.sections) {
        const newSection = course.sections.find((el) => el.id === section.id);

        if (newSection !== undefined) {
          removeSectionFromTimetable(timetable, section);
          await manager
            .createQueryBuilder()
            .relation(Timetable, "sections")
            .of(timetable)
            .remove(section);

          if (checkForClassHoursClash(timetable, newSection).clash) {
            // keep the clashing section out and unpublish the timetable so
            // its author sees the missing section in the warnings
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
            const newTimes = formatSectionTimings(course.code, newSection);
            await manager
              .createQueryBuilder()
              .relation(Timetable, "sections")
              .of(timetable)
              .add(section);

            timetable.timings = [...timetable.timings, ...newTimes];
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
    }

    // the join above only loaded this course's sections, so saving
    // timetable.sections would wipe every other course's sections. With
    // sections undefined, save leaves the join table alone; the section
    // changes were already written above
    type timetableWithoutSections = Omit<Timetable, "sections"> & {
      sections: Section[] | undefined;
    };
    const timetablesWithoutSections: timetableWithoutSections[] = timetables;
    await manager.save(
      timetablesWithoutSections.map((x) => {
        x.sections = undefined;
        return x;
      }),
    );

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
