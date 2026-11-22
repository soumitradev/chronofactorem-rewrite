import type { Request, Response } from "express";
import { timetableIDType } from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { timetableRepository } from "../../repositories/index.js";
import {
  decodeTimetableSqidOr404,
  fetchAuthorOrError,
  fetchTimetableOrError,
} from "./helpers.js";

const dataSchema = z.object({
  params: z.object({
    id: timetableIDType,
  }),
});

export const deleteTimeTableValidator = validate(dataSchema);

export const deleteTimetable = async (req: Request, res: Response) => {
  const author = await fetchAuthorOrError(req, res);
  if (!author) {
    return;
  }

  const dbID = decodeTimetableSqidOr404(req, res);
  if (dbID === null) {
    return;
  }

  const timetable = await fetchTimetableOrError(res, dbID, {
    authorId: author.id,
  });
  if (!timetable) {
    return;
  }

  await timetableRepository
    .createQueryBuilder("timetable")
    .delete()
    .where("timetable.id = :id", { id: timetable.id })
    .execute();
  return res.json({ message: "timetable deleted" });
};
