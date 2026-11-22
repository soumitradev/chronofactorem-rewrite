import type { Request, Response } from "express";
import type { sectionTypeList } from "lib";
import type { EntityManager } from "typeorm";
import { Section, type Timetable, type User } from "../../entity/entities.js";
import {
  timetableRepository,
  userRepository,
} from "../../repositories/index.js";
import sqids, { validSqid } from "../../utils/sqids.js";

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
): Promise<{ author: User; timetable: Timetable } | null> => {
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
