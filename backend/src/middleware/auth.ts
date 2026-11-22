import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { ZodFinishedUserSession } from "../types/auth.js";
import { clearAuthCookies, readSession } from "../utils/authUtils.js";

// populates req.session when valid auth cookies are present, but never
// rejects the request; used on routes that serve both logged-in and
// logged-out users
export const attachSession = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const read = readSession(req);
    if (read.ok) {
      const parsedSession = ZodFinishedUserSession.safeParse(read.payload);
      if (parsedSession.success) {
        req.session = parsedSession.data;
      }
    }
  } catch {
    // expired or malformed sessions are treated as logged out
  }
  return next();
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const read = readSession(req);
    if (!read.ok) {
      return res.status(401).json({
        message:
          read.error === "user session expired"
            ? "unauthorized"
            : "user session malformed",
        error: read.error,
      });
    }

    const parsedSession = ZodFinishedUserSession.safeParse(read.payload);
    if (!parsedSession.success) {
      return res.status(401).json({
        message: "unauthorized",
        error: "user session malformed",
      });
    }
    req.session = parsedSession.data;
    return next();
  } catch (error) {
    // jwt.verify throws JsonWebTokenError (and its TokenExpiredError
    // subclass) for expired or otherwise invalid sessions
    if (error instanceof jwt.JsonWebTokenError) {
      clearAuthCookies(res);
      return res.status(401).json({
        message: "unauthorized",
        error: "invalid user session",
      });
    }
    return res.status(500).json(JSON.stringify(error));
  }
};
