import type { Request, Response } from "express";
import { timetableIDType } from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { decodeTimetableSqidOr404, findTimetableById } from "./helpers.js";

const dataSchema = z.object({
  params: z.object({
    id: timetableIDType,
  }),
});

export const getTimetableByIdValidator = validate(dataSchema);

export const getTimetableById = async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const dbID = decodeTimetableSqidOr404(req, res);
  if (dbID === null) {
    return;
  }

  const timetable = await findTimetableById(dbID, true);

  if (!timetable) {
    return res.status(404).json({ message: "Timetable does not exist" });
  }

  // drafts only have a valid edit link, so for anyone but the author a
  // draft behaves like it does not exist
  if (timetable.draft && req.session?.id !== timetable.authorId) {
    return res.status(404).json({ message: "Timetable does not exist" });
  }

  return res.json({ ...timetable, id: id });
};
