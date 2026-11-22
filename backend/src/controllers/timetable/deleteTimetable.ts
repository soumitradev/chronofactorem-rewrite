import type { Request, Response } from "express";
import { timetableIDType } from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { timetableRepository } from "../../repositories/index.js";
import { loadTimetableContext } from "./helpers.js";

const dataSchema = z.object({
  params: z.object({
    id: timetableIDType,
  }),
});

export const deleteTimeTableValidator = validate(dataSchema);

export const deleteTimetable = async (req: Request, res: Response) => {
  const context = await loadTimetableContext(req, res);
  if (!context) {
    return;
  }

  await timetableRepository.delete(context.timetable.id);
  return res.json({ message: "timetable deleted" });
};
