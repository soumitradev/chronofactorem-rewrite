import type { Request, Response } from "express";
import { namedUUIDType, timetableIDType } from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import {
  courseRepository,
  sectionRepository,
} from "../../repositories/index.js";
import { getCourseSectionTypes, loadTimetableContext } from "./helpers.js";
import {
  applyRemoveSection,
  persistTimetableSectionDelta,
} from "./sectionChanges.js";

const dataSchema = z.object({
  body: z.object({
    courseId: namedUUIDType("course"),
  }),
  params: z.object({
    id: timetableIDType,
  }),
});

export const removeCourseValidator = validate(dataSchema);

export const removeCourse = async (req: Request, res: Response) => {
  const courseId = req.body.courseId;

  const context = await loadTimetableContext(req, res, {
    withSections: true,
    draftOnly: true,
  });
  if (!context) {
    return;
  }
  const { timetable } = context;

  const course = await courseRepository.findOneBy({ id: courseId });
  if (!course) {
    return res.status(404).json({ message: "course not found" });
  }
  if (course.archived) {
    return res.status(418).json({ message: "course is archived" });
  }

  const courseSections = timetable.sections.filter(
    (section) => section.courseId === courseId,
  );
  if (courseSections.length === 0) {
    return res.status(404).json({
      message: "Course not part of given timetable",
    });
  }

  const sectionTypes = await getCourseSectionTypes(
    sectionRepository.manager,
    courseId,
  );
  for (const section of courseSections) {
    if (
      !applyRemoveSection(req, res, context, { course, section, sectionTypes })
    ) {
      return;
    }
  }

  await persistTimetableSectionDelta(timetable, {
    removed: courseSections,
    writeExamTimes: true,
  });
  return res.json({
    message: "course removed",
    sectionIds: courseSections.map((section) => section.id),
  });
};
