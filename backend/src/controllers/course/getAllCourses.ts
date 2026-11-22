import type { Request, Response } from "express";
import { z } from "zod";
import type { Course } from "../../entity/entities.js";
import { validate } from "../../middleware/zodValidateRequest.js";
import { courseRepository } from "../../repositories/index.js";

const querySchema = z
  .object({
    archived: z.stringbool().optional(),
    acadYear: z.coerce.number().int().optional(),
    semester: z.coerce.number().int().optional(),
  })
  .refine(
    (query) => {
      const hasAcadYear = query.acadYear !== undefined;
      const hasSemester = query.semester !== undefined;
      // one param without the other is meaningless
      return hasAcadYear === hasSemester;
    },
    { message: "acadYear and semester must be passed together" },
  );

export const getAllCoursesValidator = validate(
  z.object({ query: querySchema }),
);

export const getAllCourses = async (req: Request, res: Response) => {
  const logger = req.log;
  // the validator only checks the query, parse it again for the typed values
  const { archived = false, acadYear, semester } = querySchema.parse(req.query);

  try {
    let courses: Course[];

    if (acadYear !== undefined && semester !== undefined) {
      // semester-scoped fetches return the courses of that semester regardless
      // of their archived status, so that archived timetables can be viewed
      courses = await courseRepository
        .createQueryBuilder("course")
        .where("course.acadYear = :acadYear", { acadYear })
        .andWhere("course.semester = :semester", { semester })
        .getMany();
    } else if (archived) {
      courses = await courseRepository.createQueryBuilder("course").getMany();
    } else {
      courses = await courseRepository
        .createQueryBuilder("course")
        .where("course.archived = :archived", { archived: archived })
        .getMany();
    }

    if (courses.length === 0) {
      return res.status(404).json({ message: "Courses do not exist" });
    }

    // Don't cache the endpoint on client, Nginx will handle it via ETag
    return res.header("Cache-Control", "no-cache").json(courses);
  } catch (error) {
    logger.error(error, "An error occurred while fetching courses:");
    return res.status(500).json({ message: "Internal server error" });
  }
};
