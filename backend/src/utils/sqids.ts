import Sqids from "sqids";
import { env } from "../config/server.js";

const sqids = new Sqids({
  minLength: 4,
  alphabet: env.SQIDS_ALPHABET,
});

// timetable ids are Postgres integer primary keys
const maxTimetableId = 2147483647;

export const validSqid = (id: number[]) =>
  id.length === 1 && id[0] >= 0 && id[0] <= maxTimetableId;

export default sqids;
