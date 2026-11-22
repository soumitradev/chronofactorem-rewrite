import type { Request, Response } from "express";
import type { degreeList } from "lib";
import { z } from "zod";
import { validate } from "../../middleware/zodValidateRequest.js";
import { userRepository } from "../../repositories/index.js";
import { userDegreesSchema } from "../../types/user.js";

const dataSchema = z.object({
  body: z.object({
    degrees: userDegreesSchema,
  }),
});

export const editUserValidator = validate(dataSchema);

export const editUser = async (req: Request, res: Response) => {
  const degrees: degreeList = req.body.degrees;

  const { affected } = await userRepository.update(
    { id: req.session?.id },
    { degrees },
  );
  if (affected === 0) {
    throw new Error(`no user ${req.session?.id} to update`);
  }

  return res.json({ message: "User details updated successfully" });
};
