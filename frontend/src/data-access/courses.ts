import { queryOptions, useQuery } from "@tanstack/react-query";
import type { courseType, courseWithSectionsType } from "lib";
import type z from "zod";
import chronoAPI from "./axios";

type CourseFilters = {
  acadYear: number;
  semester: number;
};

export const courseQueryOptions = (filters?: CourseFilters) =>
  queryOptions({
    queryKey: ["courses", filters ?? null],
    queryFn: async () => {
      const response = await chronoAPI.get<z.infer<typeof courseType>[]>(
        "/api/course",
        {
          params: filters,
          headers: { "Cache-Control": "max-age=0" },
        },
      );
      return response.data;
    },
  });

export const useCourse = (currentCourseID: string | null) =>
  useQuery({
    queryKey: ["course", currentCourseID],
    queryFn: async () => {
      const response = await chronoAPI.get<
        z.infer<typeof courseWithSectionsType>
      >(`/api/course/${currentCourseID}`);
      return response.data;
    },
    enabled: currentCourseID !== null,
  });
