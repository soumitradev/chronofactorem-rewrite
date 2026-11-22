import type { Request, Response } from "express";
import { namedUUIDType } from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { userRepository } from "../../repositories/index.js";
import { clearAuthCookies } from "../../utils/authUtils.js";
import sqids from "../../utils/sqids.js";

const dataSchema = z.object({
  params: z.object({
    id: namedUUIDType("user").optional(),
  }),
});

export const getUserDetailsValidator = validate(dataSchema);

export const getUserDetails = async (req: Request, res: Response) => {
  const id = req.params.id ?? req.session?.id;
  const user = await userRepository
    .createQueryBuilder("user")
    // the join's parameter must not be named :id — query builder params
    // are global, and the where clause below would overwrite this binding
    // and silently disable the private/draft filter
    .leftJoin(
      "user.timetables",
      "timetable",
      "(user.id <> :sessionId and timetable.private = :private and timetable.draft = :draft) or (user.id = :sessionId)",
      {
        sessionId: req.session?.id,
        draft: false,
        private: false,
      },
    )
    .select([
      "user",
      "timetable.id",
      "timetable.name",
      "timetable.degrees",
      "timetable.private",
      "timetable.draft",
      "timetable.archived",
      "timetable.year",
      "timetable.acadYear",
      "timetable.semester",
      "timetable.timings",
      "timetable.createdAt",
      "timetable.lastUpdated",
    ])
    .where("user.id = :id", { id })
    .orderBy("timetable.id", "ASC")
    .getOne();

  if (!user) {
    // DB reset can cause user not to exist so we invalidate login
    if (req.params.id === undefined) {
      clearAuthCookies(res);
      return res.status(401).json({
        message: "unauthorized",
        error: "user session expired",
      });
    }
    return res.status(404).json({ message: "User not found" });
  }

  return res.json({
    ...user,
    timetables: user.timetables.map((t) => {
      return { ...t, id: sqids.encode([t.id]) };
    }),
  });
};
