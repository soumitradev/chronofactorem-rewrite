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
  applyAddSection,
  loadSectionWithCourse,
  persistTimetableSectionDelta,
} from "./sectionChanges.js";

export const addSectionValidator = validate(
  z.object({
    body: z.object({
      sectionId: sectionIdValidator,
    }),
    params: timetableIdParamsValidator,
  }),
);

export const addSection = async (req: Request, res: Response) => {
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
    "section not found",
  );
  if (!section) {
    return;
  }
  const course = section.course;
  if (course.archived) {
    return res.status(418).json({ message: "course is archived" });
  }

  const sectionTypes = await getCourseSectionTypes(
    sectionRepository.manager,
    course.id,
  );
  const added = applyAddSection(res, timetable, {
    course,
    section,
    sectionTypes,
  });
  if (!added) {
    return;
  }

  await persistTimetableSectionDelta(timetable, {
    added: [section],
    writeExamTimes: added.writeExamTimes,
  });
  return res.json({ message: "section added" });
};
