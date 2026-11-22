import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { env } from "./config/server.js";
import { logger } from "./middleware/logging.js";
import authRouter from "./routers/authRouter.js";
import courseRouter from "./routers/courseRouter.js";
import timetableRouter from "./routers/timetableRouter.js";
import userRouter from "./routers/userRouter.js";
import { httpLogger } from "./utils/logger.js";

// create express app
const app = express();

// logging
app.use(httpLogger);
app.use(logger);

// to parse cookies
app.use(cookieParser());
const frontendUrl = new URL(env.FRONTEND_URL);
app.use(
  cors({
    credentials: true,
    origin: [
      env.FRONTEND_URL,
      `${frontendUrl.protocol}//www.${frontendUrl.host}`,
    ],
  }),
);
app.use(express.json());

// register express routers from defined application routers
app.use("/user", userRouter);
app.use("/course", courseRouter);
app.use("/auth", authRouter);
app.use("/timetable", timetableRouter);

// setup express app here
// ...

// Disable Express header for security
app.disable("x-powered-by");

// express 5 forwards errors thrown by async handlers here
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log.error(err);
  const status =
    err instanceof Object && "status" in err && typeof err.status === "number"
      ? err.status
      : 500;
  res.status(status).json({ message: "Internal Server Error" });
});

export default app;
