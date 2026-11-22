import type { Request, Response } from "express";
import { timetableRepository } from "../../repositories/index.js";
import sqids from "../../utils/sqids.js";
import { fetchAuthorOrError, newTimetableValues } from "./helpers.js";

export const createTimetable = async (req: Request, res: Response) => {
  const author = await fetchAuthorOrError(req, res);
  if (!author) {
    return;
  }

  const createdTimetable = await timetableRepository.insert(
    newTimetableValues(author),
  );

  return res.status(201).json({
    message: "Timetable created successfully",
    id: sqids.encode([createdTimetable.identifiers[0].id]),
  });
};
