import { Request, Response } from "express";
import { courseRepository } from "../../repositories/courseRepository";

export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const courses = await courseRepository
      .createQueryBuilder("course")
      .getMany();

    if (courses.length === 0) {
      return res.status(404).json({ message: "Courses do not not exist" });
    }

    return res.header("Cache-Control", "max-age=3600").json(courses);
  } catch (error) {
    console.error("An error occurred while fetching courses:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
