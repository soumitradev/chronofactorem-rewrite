import type { NextFunction, Request, Response } from "express";
import { default as onFinished } from "on-finished";

export const logger = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // log request method and URL (along with the default pino-http `req` object)
  req.log.info(`${req.method} ${req.url}`);

  // monkey-patch res.json to make response body available for logging
  const originalSend = res.json;
  res.json = (body) => {
    res.body = body;
    res.json = originalSend;
    return res.json(body);
  };

  onFinished(res, (err, res) => {
    // the raw req and res objects carry cookies in places redact can't
    // reach, so only log their serialized forms
    res.log.debug({ res, requestBody: req.body, responseBody: res.body });
    if (err || res.statusCode >= 500) {
      res.log.error({ err }, `${res.statusCode}`);
    } else {
      res.log.info(
        `${res.statusCode} ${res.body?.message ?? res.statusMessage}`,
      );
    }
  });
  next();
};
