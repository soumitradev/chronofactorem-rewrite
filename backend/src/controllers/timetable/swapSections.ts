import type { Request, Response } from "express";
import { namedUUIDType } from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { sectionRepository } from "../../repositories/index.js";
import {
  getCourseSectionTypes,
  loadTimetableContext,
  sectionIdValidator,
  timetableIdParamsValidator,
} from "./helpers.js";
import {
  applyAddSection,
  applyRemoveSection,
  loadSectionWithCourse,
  persistTimetableSectionDelta,
} from "./sectionChanges.js";

export const swapSectionsValidator = validate(
  z.object({
    body: z.object({
      sectionId: sectionIdValidator,
      newSectionId: namedUUIDType("new section"),
    }),
    params: timetableIdParamsValidator,
  }),
);

export const swapSections = async (req: Request, res: Response) => {
  const context = await loadTimetableContext(req, res, {
    withSections: true,
    draftOnly: true,
  });
  if (!context) {
    return;
  }
  const { timetable } = context;

  const section = await loadSectionWithCourse(
    res,
    req.body.sectionId,
    "Section not found",
  );
  if (!section) {
    return;
  }
  if (!timetable.sections.some(({ id }) => id === section.id)) {
    return res.status(404).json({
      message: "Section not part of given timetable",
    });
  }

  const newSection = await loadSectionWithCourse(
    res,
    req.body.newSectionId,
    "New section not found",
  );
  if (!newSection) {
    return;
  }

  const course = section.course;
  const newCourse = newSection.course;
  if (course.archived || newCourse.archived) {
    return res.status(418).json({ message: "course is archived" });
  }

  const sectionTypes = await getCourseSectionTypes(
    sectionRepository.manager,
    course.id,
  );
  const newSectionTypes = await getCourseSectionTypes(
    sectionRepository.manager,
    newCourse.id,
  );

  // apply the swap in memory first so the clash checks see the timetable
  // without the old section
  if (
    !applyRemoveSection(req, res, context, { course, section, sectionTypes })
  ) {
    return;
  }
  const added = applyAddSection(res, timetable, {
    course: newCourse,
    section: newSection,
    sectionTypes: newSectionTypes,
  });
  if (!added) {
    return;
  }

  await persistTimetableSectionDelta(timetable, {
    removed: [section],
    added: [newSection],
    writeExamTimes: added.writeExamTimes,
  });
  return res.json({ message: "section swapped" });
};
