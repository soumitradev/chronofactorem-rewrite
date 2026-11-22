import type { Request, Response } from "express";
import { namedUUIDType, type sectionTypeList, timetableIDType } from "lib";
import type { EntityManager } from "typeorm";
import { z } from "zod";
import { Section, type Timetable, type User } from "../../entity/entities.js";
import {
  timetableRepository,
  userRepository,
} from "../../repositories/index.js";
import timetableJSON from "../../timetable.json" with { type: "json" };
import sqids, { validSqid } from "../../utils/sqids.js";

export const timetableIdParamsValidator = z.object({ id: timetableIDType });

export const sectionIdValidator = namedUUIDType("section");

export const fetchAuthorOrError = async (
  req: Request,
  res: Response,
): Promise<User | null> => {
  // findOneBy throws on an undefined id, so check the session to send a 401 instead
  const author =
    req.session && (await userRepository.findOneBy({ id: req.session.id }));
  if (!author) {
    res.status(401).json({ message: "unregistered user" });
    return null;
  }
  return author;
};

export const decodeTimetableSqidOr404 = (
  req: Request,
  res: Response,
): number | null => {
  const decoded = sqids.decode(req.params.id as string);
  if (!validSqid(decoded)) {
    res.status(404).json({ message: "Timetable does not exist" });
    return null;
  }
  return decoded[0];
};

export const findTimetableById = (id: number, withSections: boolean) =>
  timetableRepository.findOne({
    where: { id },
    relations: { sections: withSections },
  });

export type TimetableContext = { author: User; timetable: Timetable };

type TimetableContextOptions = {
  withSections?: boolean;
  draftOnly?: boolean;
  anyAuthor?: boolean;
  notFoundMessage?: string;
};

// Sends the matching error response and returns null when the id, session
// user, timetable, ownership or draft state check fails
export const loadTimetableContext = async (
  req: Request,
  res: Response,
  options: TimetableContextOptions = {},
): Promise<TimetableContext | null> => {
  const id = decodeTimetableSqidOr404(req, res);
  if (id === null) {
    return null;
  }

  const author = await fetchAuthorOrError(req, res);
  if (!author) {
    return null;
  }

  const timetable = await findTimetableById(id, options.withSections ?? false);
  if (!timetable) {
    res
      .status(404)
      .json({ message: options.notFoundMessage ?? "timetable not found" });
    return null;
  }
  if (!options.anyAuthor && timetable.authorId !== author.id) {
    res.status(403).json({ message: "user does not own timetable" });
    return null;
  }
  if (options.draftOnly) {
    if (!timetable.draft) {
      res.status(418).json({ message: "timetable is not a draft" });
      return null;
    }
    if (timetable.archived) {
      res.status(418).json({ message: "timetable is archived" });
      return null;
    }
  }
  return { author, timetable };
};

export const newTimetableValues = (author: User, source?: Timetable) => {
  const { acadYear, semester } = timetableJSON.metadata;
  return {
    authorId: author.id,
    name: "Untitled Timetable",
    degrees: author.degrees,
    private: true,
    draft: true,
    archived: false,
    acadYear,
    semester,
    // batch 0 means the author's email gave no batch; year 0 is a sentinel so
    // the frontend skips year-based labels and defaults for this timetable
    year: author.batch === 0 ? 0 : acadYear - author.batch + 1,
    timings: source?.timings ?? [],
    examTimes: source?.examTimes ?? [],
    warnings: source?.warnings ?? [],
    createdAt: new Date(),
    lastUpdated: new Date(),
  };
};

export const getCourseSectionTypes = async (
  manager: EntityManager,
  courseId: string,
): Promise<sectionTypeList> => {
  const sectionTypeHolders = await manager
    .createQueryBuilder(Section, "section")
    .select("section.type")
    .where("section.courseId = :courseId", { courseId })
    .distinctOn(["section.type"])
    .getMany();
  return sectionTypeHolders.map((section) => section.type);
};
