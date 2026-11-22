import type { Request, Response } from "express";
import { namedUUIDType } from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { courseRepository } from "../../repositories/index.js";

const dataSchema = z.object({
  params: z.object({
    id: namedUUIDType("course"),
  }),
});

export const getCourseByIdValidator = validate(dataSchema);

export const getCourseById = async (req: Request, res: Response) => {
  const course = await courseRepository.findOne({
    where: { id: req.params.id as string },
    relations: { sections: true },
  });

  if (!course) {
    return res.status(404).json({ message: "Course does not exist" });
  }

  return res.json(course);
};
