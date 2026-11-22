import type { Request, Response } from "express";
import { namedUUIDType, timetableIDType } from "lib";
import { z } from "zod";
import type { Section } from "../../entity/entities.js";
import { validate } from "../../middleware/zodValidateRequest.js";
import {
  courseRepository,
  sectionRepository,
  timetableRepository,
} from "../../repositories/index.js";
import { removeSection as removeSectionFromTimetable } from "../../utils/updateSection.js";
import { updateSectionWarnings } from "../../utils/updateWarnings.js";
import {
  decodeTimetableSqidOr404,
  fetchAuthorOrError,
  fetchTimetableOrError,
  getCourseSectionTypes,
} from "./helpers.js";

const dataSchema = z.object({
  body: z.object({
    sectionId: namedUUIDType("section"),
  }),
  params: z.object({
    id: timetableIDType,
  }),
});

export const removeSectionValidator = validate(dataSchema);

export const removeSection = async (req: Request, res: Response) => {
  const logger = req.log;
  const dbID = decodeTimetableSqidOr404(req, res);
  if (dbID === null) {
    return;
  }
  const sectionId = req.body.sectionId;

  const author = await fetchAuthorOrError(req, res);
  if (!author) {
    return;
  }

  const timetable = await fetchTimetableOrError(res, dbID, {
    authorId: author.id,
    joinSections: true,
    mustBeDraft: true,
  });
  if (!timetable) {
    return;
  }

  const section = await sectionRepository
    .createQueryBuilder("section")
    .where("section.id = :sectionId", { sectionId })
    .getOne();

  if (section === null) {
    return res.status(404).json({ message: "Section not found" });
  }

  let timetableHasSection = false;

  for (const timetableSection of timetable.sections) {
    if (timetableSection.id === section.id) {
      timetableHasSection = true;
      break;
    }
  }

  if (!timetableHasSection) {
    return res.status(404).json({
      message: "Section not part of given timetable",
    });
  }

  const courseId = section.courseId;

  const course = await courseRepository
    .createQueryBuilder("course")
    .where("course.id = :id", { id: courseId })
    .getOne();

  if (!course) {
    return res.status(404).json({ message: "course not found" });
  }

  if (course.archived) {
    return res.status(418).json({ message: "course is archived" });
  }

  const sameCourseSections: Section[] = timetable.sections.filter(
    (currentSection) => {
      return currentSection.courseId === section?.courseId;
    },
  );

  // remove course's exam timings if no other sections of this course in TT
  if (sameCourseSections.length === 1) {
    timetable.examTimes = timetable.examTimes.filter((examTime) => {
      return examTime.split("|")[0] !== course?.code;
    });
  }

  const sectionTypes = await getCourseSectionTypes(
    sectionRepository.manager,
    courseId,
  );

  removeSectionFromTimetable(timetable, section);

  try {
    timetable.warnings = updateSectionWarnings(
      course.code,
      section,
      sectionTypes,
      false,
      timetable.warnings,
    );
  } catch (_err: any) {
    logger.error(
      `user with id ${author.id} tried to remove section ${section.type}${section.number} of course ${course.code} but it isn't part of their timetable according to warnings`,
    );

    return res.status(500).json({
      message:
        "Timetable and warnings state inconsistent, please contact us if you see this",
    });
  }

  await timetableRepository.save(timetable);

  return res.json({ message: "section removed" });
};
