import {
  isAValidDegreeCombination,
  namedDegreeZodList,
  unknownDegree,
} from "lib";

// the degrees a user picks for themselves, on signup or when editing
export const userDegreesSchema = namedDegreeZodList("user")
  .min(1, {
    error: "user degrees must be a non-empty array of valid degree strings",
  })
  .max(2, {
    error: "user degrees may not contain more than two elements",
  })
  // the sentinel degree is assigned at signup, never picked here
  .refine((degrees) => !degrees.includes(unknownDegree), {
    error: "user degrees must be a non-empty array of valid degree strings",
  })
  .refine(
    (degrees) => degrees.length !== 2 || isAValidDegreeCombination(degrees),
    { error: "Dualites may only have one BE degree and one MSc degree" },
  );
