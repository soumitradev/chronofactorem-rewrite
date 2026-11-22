import type { Request, Response } from "express";
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
  applyRemoveSection,
  loadSectionWithCourse,
  persistTimetableSectionDelta,
} from "./sectionChanges.js";

export const removeSectionValidator = validate(
  z.object({
    body: z.object({
      sectionId: sectionIdValidator,
    }),
    params: timetableIdParamsValidator,
  }),
);

export const removeSection = async (req: Request, res: Response) => {
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
  const course = section.course;
  if (course.archived) {
    return res.status(418).json({ message: "course is archived" });
  }

  const sectionTypes = await getCourseSectionTypes(
    sectionRepository.manager,
    course.id,
  );
  if (
    !applyRemoveSection(req, res, context, { course, section, sectionTypes })
  ) {
    return;
  }

  await persistTimetableSectionDelta(timetable, {
    removed: [section],
    writeExamTimes: true,
  });
  return res.json({ message: "section removed" });
};
