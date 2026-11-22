import type { Request, Response } from "express";
import { timetableIDType } from "lib";
import { z } from "zod";
import { Timetable } from "../../entity/entities.js";
import { validate } from "../../middleware/zodValidateRequest.js";
import { timetableRepository } from "../../repositories/index.js";
import sqids from "../../utils/sqids.js";
import { loadTimetableContext, newTimetableValues } from "./helpers.js";

const dataSchema = z.object({
  params: z.object({
    id: timetableIDType,
  }),
});

export const copyTimetableValidator = validate(dataSchema);

export const copyTimetable = async (req: Request, res: Response) => {
  const context = await loadTimetableContext(req, res, {
    withSections: true,
    anyAuthor: true,
    notFoundMessage: "timetable to be copied not found",
  });
  if (!context) {
    return;
  }
  const { author, timetable: copiedTimetable } = context;

  if (copiedTimetable.archived) {
    return res
      .status(400)
      .json({ message: "timetable is archived. cannot copy old timetables" });
  }

  const timetable = await timetableRepository.insert(
    newTimetableValues(author, copiedTimetable),
  );

  for (const section of copiedTimetable.sections) {
    await timetableRepository
      .createQueryBuilder()
      .relation(Timetable, "sections")
      .of(timetable.identifiers[0].id)
      .add(section);
  }

  return res.status(201).json({
    message: "Timetable copied successfully",
    id: sqids.encode([timetable.identifiers[0].id]),
  });
};
