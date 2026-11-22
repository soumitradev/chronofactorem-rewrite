import type { Request, Response } from "express";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { timetableRepository } from "../../repositories/index.js";
import { loadTimetableContext, timetableIdParamsValidator } from "./helpers.js";

export const deleteTimetableValidator = validate(
  z.object({
    params: timetableIdParamsValidator,
  }),
);

export const deleteTimetable = async (req: Request, res: Response) => {
  const context = await loadTimetableContext(req, res);
  if (!context) {
    return;
  }

  await timetableRepository.delete(context.timetable.id);
  return res.json({ message: "timetable deleted" });
};
