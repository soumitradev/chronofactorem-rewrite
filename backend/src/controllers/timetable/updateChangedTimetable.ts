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
  // Use a transaction because we will run many dependent mutations
  await AppDataSource.transaction(async (manager) => {
    // Update the course's exam timings, also make sure that the course is not archived
    const course: Course = req.body.course;
    await manager
      .createQueryBuilder()
      .update(Course)
      .set({
        midsemStartTime: course?.midsemStartTime,
        midsemEndTime: course?.midsemEndTime,
        compreStartTime: course?.compreStartTime,
        compreEndTime: course?.compreEndTime,
      })
      .where("id = :id", { id: course?.id })
      .andWhere("archived = :archived", { archived: false })
      .execute();

    // Fetch the total types of sections of that course (required later to update warnings)
    const requiredSectionTypes: sectionTypeList = await getCourseSectionTypes(
      manager,
      course.id,
    );

    // Fetch the timetables that are affected, archived timetables cannot be affected
    const timetables: Timetable[] = await manager
      .createQueryBuilder(Timetable, "timetable")
      .leftJoinAndSelect("timetable.sections", "section")
      .where("section.courseId = :id", { id: course?.id })
      .andWhere("timetable.archived = :archived", { archived: false })
      .getMany();

    for (const timetable of timetables) {
      // For each timetable, check if the exam times have changed
      if (checkForExamTimingsChange(timetable, course)) {
        // If they have, remove the course's exams from the timings
        timetable.examTimes = removeCourseExamTimes(
          timetable.examTimes,
          course.code,
        );

        // Convert exam dates to actual dates from strings, since the
        // checkForExamHoursClash() function compares them with dates

        // This is needed because the course exam dates are not from DB,
        // but are from the JSON body of the request.
        // A similar procedure is used during ingestion as well.
        if (course.compreStartTime !== null && course.compreEndTime !== null) {
          course.compreStartTime = new Date(course.compreStartTime);
          course.compreEndTime = new Date(course.compreEndTime);
        }
        if (course.midsemStartTime !== null && course.midsemEndTime !== null) {
          course.midsemStartTime = new Date(course.midsemStartTime);
          course.midsemEndTime = new Date(course.midsemEndTime);
        }

        // Check if the new timings clash with any other timings of other courses
        if (checkForExamHoursClash(timetable, course).clash) {
          // If they do, then remove all sections of the course with updated timings
          for (const sec of timetable.sections) {
            await manager
              .createQueryBuilder()
              .relation(Timetable, "sections")
              .of(timetable)
              .remove(sec);
            removeSectionFromTimetable(timetable, sec);
          }
          // Since the timetable has been changed, make it a draft
          timetable.draft = true;
          timetable.private = true;
        } else {
          // If there is no clash, simply add the new timings to the timetable
          const newExamTimes = timetable.examTimes;
          addExamTimings(newExamTimes, course);
          timetable.examTimes = newExamTimes;
        }
      }
      for (const section of timetable.sections) {
        // For each section of the course previously in the timetable, find its corresponding replacement
        const newSection = course.sections.find((el) => el.id === section.id);

        if (newSection !== undefined) {
          // Start off by removing the existing section, both in DB and the timings column of the timetable
          removeSectionFromTimetable(timetable, section);
          await manager
            .createQueryBuilder()
            .relation(Timetable, "sections")
            .of(timetable)
            .remove(section);

          if (checkForClassHoursClash(timetable, newSection).clash) {
            // If the updated section will cause a clash, then keep the section removed
            // Also make the timetable a draft, and update its warnings since that
            // section is now gone
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
            // If there is no clash, add the new section timings to the timetable
            const newTimes = formatSectionTimings(course.code, newSection);
            // Add the section back to the timetable
            await manager
              .createQueryBuilder()
              .relation(Timetable, "sections")
              .of(timetable)
              .add(section);

            // Update the timings and the sections in the timetable object
            timetable.timings = [...timetable.timings, ...newTimes];
            timetable.sections = [...timetable.sections, newSection];
          }
        }
      }

      // After all that, if the timetable now has 0 sections of that course,
      // remove its exam timings as well, removing it fully from the timetable
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

    // Remove sections from the timetable before saving in db

    // Since we are fetching only this course's sections in the
    // timetable query (due to the left join), none of the other sections
    // end up in timetable.sections. Saving this to db causes all the other
    // sections of other courses to be wiped. This is why, using some typescript
    // magic, we redefine the timetable type, and then set sections = undefined.
    // Since sections = undefined, TypeORM sees that the field isn't present,
    // and doesn't make any additional changes to timetable sections.

    // If we do want to remove the sections, those db calls have already been
    // made above. This db call is only here to update timetable timings and examTimes
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

    // Regardless of whether or not a section was present in a timetable,
    // update the section's timings
    for (const section of course.sections) {
      await manager
        .createQueryBuilder()
        .update(Section, { roomTime: section.roomTime })
        .where("section.id = :id", { id: section?.id })
        .execute();
    }
  });

  return res.json({ message: "Timetable successfully updated" });
};
