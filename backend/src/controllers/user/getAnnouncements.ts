import type { Request, Response } from "express";
import { announcementRepository } from "../../repositories/index.js";

export const getAllAnnouncements = async (_req: Request, res: Response) => {
  const announcements = await announcementRepository.find({
    order: { createdAt: "DESC" },
  });

  return res.status(200).json(announcements);
};
