import type { Request, Response } from "express";
import {
  type degreeList,
  isAValidDegreeCombination,
  namedDegreeZodList,
  unknownDegree,
} from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { userRepository } from "../../repositories/index.js";

const dataSchema = z.object({
  body: z.object({
    degrees: namedDegreeZodList("user")
      .min(1, {
        error: "user degrees must be a non-empty array of valid degree strings",
      })
      .max(2, {
        error: "user degrees may not contain more than two elements",
      })
      // the sentinel degree is assigned at signup, never picked here
      .refine((degrees) => !degrees.includes(unknownDegree), {
        error: "user degrees must be a non-empty array of valid degree strings",
      }),
  }),
});

export const editUserValidator = validate(dataSchema);

export const editUser = async (req: Request, res: Response) => {
  const degrees: degreeList = req.body.degrees;

  if (degrees.length === 2 && !isAValidDegreeCombination(degrees)) {
    return res.status(400).json({
      message: "Dualites may only have one BE degree and one MSc degree",
    });
  }

  const { affected } = await userRepository.update(
    { id: req.session?.id },
    { degrees },
  );
  if (affected === 0) {
    throw new Error(`no user ${req.session?.id} to update`);
  }

  return res.json({ message: "User details updated successfully" });
};
