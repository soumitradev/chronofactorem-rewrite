import {
  namedEmailType,
  namedIntegerType,
  namedNonEmptyStringType,
  namedUUIDType,
} from "lib";
import { z } from "zod";

export const ZodUnfinishedUserSession = z.object({
  name: namedNonEmptyStringType("name"),
  email: namedEmailType(),
  maxAge: namedIntegerType("maxAge"),
  fingerprintHash: namedNonEmptyStringType("fingerprintHash"),
});

export type UnfinishedUserSession = z.infer<typeof ZodUnfinishedUserSession>;

export const ZodFinishedUserSession = z.object({
  name: namedNonEmptyStringType("name"),
  email: namedEmailType(),
  id: namedUUIDType("user id"),
  fingerprintHash: namedNonEmptyStringType("fingerprintHash"),
});
export type FinishedUserSession = z.infer<typeof ZodFinishedUserSession>;
