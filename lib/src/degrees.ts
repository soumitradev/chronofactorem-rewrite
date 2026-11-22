import { z } from "zod";
import { addNameToString } from "./zodFieldTypes.js";

// !!! IMPORTANT: THIS IS THE SOURCE OF TRUTH FOR DEGREES
export const approvedBEDegreeList = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A7",
  "A8",
  "AA",
  "AD",
  "AJ",
] as const;

export const approvedMScDegreeList = [
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B7",
] as const;

export const approvedBPharmDegreeList = ["A5"] as const;

export const approvedDegreeList = [
  ...approvedBEDegreeList,
  ...approvedMScDegreeList,
  ...approvedBPharmDegreeList,
] as const;

// sentinel degree for users whose email gives no batch (hd students and
// other non-f addresses); they skip degree selection entirely on signup
export const unknownDegree = "XX";

export const namedDegreeZodEnum = (name?: string) =>
  z.enum([...approvedDegreeList, unknownDegree], {
    error: (issue) =>
      issue.input === undefined
        ? addNameToString("degree is required", name)
        : addNameToString("degree is not valid", name),
  });
export const degreeZodEnum = namedDegreeZodEnum();

export const namedDegreeZodList = (name?: string) =>
  namedDegreeZodEnum(name).array();
export const degreeZodList = namedDegreeZodList();

export type degreeEnum = z.infer<typeof degreeZodEnum>;
export type degreeList = z.infer<typeof degreeZodList>;

export const isAValidBEDegree = (
  degree: string,
): degree is (typeof approvedBEDegreeList)[number] => {
  return approvedBEDegreeList.includes(
    degree as (typeof approvedBEDegreeList)[number],
  );
};
export const isAValidMScDegree = (
  degree: string,
): degree is (typeof approvedMScDegreeList)[number] => {
  return approvedMScDegreeList.includes(
    degree as (typeof approvedMScDegreeList)[number],
  );
};

export const isAValidDegreeCombination = (degrees: string[]): boolean => {
  return (
    degrees.length === 2 &&
    (degrees[0] < degrees[1]
      ? isAValidBEDegree(degrees[0]) && isAValidMScDegree(degrees[1])
      : isAValidBEDegree(degrees[1]) && isAValidMScDegree(degrees[0]))
  );
};
