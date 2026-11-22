import { FinishedUserSession } from "../auth.js";

declare global {
  namespace Express {
    export interface Request {
      session?: FinishedUserSession;
    }

    export interface Response {
      body?: {
        message?: string;
      };
    }
  }
}
