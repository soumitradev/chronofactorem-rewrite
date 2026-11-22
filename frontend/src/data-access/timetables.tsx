import {
  type QueryClient,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { timetableWithSectionsType } from "lib";
import type z from "zod";
import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/components/ui/use-toast";
import { HapticTap, haptic } from "@/lib/haptics";
import chronoAPI, { sectionLock, useApiMutation } from "./axios";

export const timetableQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["timetable", id],
    queryFn: async () => {
      const response = await chronoAPI.get<
        z.infer<typeof timetableWithSectionsType>
      >(`/api/timetable/${id}`);
      return response.data;
    },
  });

export const useTimetable = (id: string) => useQuery(timetableQueryOptions(id));

export const useCreateTimetable = () => {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: () => {
      return chronoAPI.post<{ message: string; id: string }>(
        "/api/timetable/create",
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user"],
      });
    },
  });
};

export const useCopyTimetable = () => {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => {
      return chronoAPI.post<{ message: string; id: string }>(
        `/api/timetable/${id}/copy`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });
};

type EditTimetableParams = {
  id: string;
  body: {
    name: string;
    isPrivate: boolean;
    isDraft: boolean;
  };
};

// shared so every caller sees one edit in flight, wherever it started
export const editTimetableKey = ["editTimetable"];

export const useEditTimetable = ({ unlockOnSuccess = true } = {}) => {
  const queryClient = useQueryClient();
  return useApiMutation({
    unlockOnSuccess,
    mutationKey: editTimetableKey,
    mutationFn: (data: EditTimetableParams) => {
      return chronoAPI.post(`/api/timetable/${data.id}/edit`, data.body);
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      await queryClient.invalidateQueries(
        { queryKey: ["timetable", variables.id], refetchType: "all" },
        { throwOnError: true },
      );
    },
  });
};

export const useDeleteTimetable = () => {
  const queryClient = useQueryClient();
  return useApiMutation({
    mutationFn: (id: string) => {
      return chronoAPI.post(`/api/timetable/${id}/delete`);
    },
    // the dialog closes and the card collapses, so delete is sent only once
    unlockOnSuccess: false,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user"],
      });
    },
  });
};

type SectionAction = "add" | "remove";

const sectionMutationOptions = (timetableId: string | undefined) => ({
  mutationKey: ["sections", timetableId],
  scope: { id: sectionLock(timetableId) },
  lock: sectionLock(timetableId),
});

const invalidateTimetable = (
  queryClient: QueryClient,
  timetableId: string | undefined,
) => {
  // home lists timetables by last edit
  queryClient.invalidateQueries({ queryKey: ["user"] });
  return queryClient.invalidateQueries({
    queryKey: ["timetable", timetableId],
  });
};

export const useAddRemoveTimetableSection = (
  timetableId: string | undefined,
) => {
  const queryClient = useQueryClient();
  return useApiMutation({
    ...sectionMutationOptions(timetableId),
    mutationFn: async ({
      sectionId,
      action,
    }: {
      sectionId: string;
      action: SectionAction;
    }) => {
      if (timetableId === undefined) throw new Error("Timetable is not loaded");
      const result = await chronoAPI.post(
        `/api/timetable/${timetableId}/${action}`,
        { sectionId },
      );

      return result.data;
    },
    onSuccess: () => invalidateTimetable(queryClient, timetableId),
    onError: () => haptic("error"),
  });
};

export const useSwapTimetableSections = (timetableId: string | undefined) => {
  const queryClient = useQueryClient();
  return useApiMutation({
    ...sectionMutationOptions(timetableId),
    mutationFn: async ({
      sectionId,
      newSectionId,
    }: {
      sectionId: string;
      newSectionId: string;
    }) => {
      if (timetableId === undefined) throw new Error("Timetable is not loaded");
      await chronoAPI.post(`/api/timetable/${timetableId}/swap`, {
        sectionId,
        newSectionId,
      });
    },
    onSuccess: () => invalidateTimetable(queryClient, timetableId),
    onError: () => haptic("error"),
  });
};

// shares the section mutations' key and scope, so it queues behind them
export const useRemoveTimetableCourse = (timetableId: string | undefined) => {
  const queryClient = useQueryClient();
  const invalidate = () => invalidateTimetable(queryClient, timetableId);

  const { mutate: restore } = useApiMutation({
    ...sectionMutationOptions(timetableId),
    mutationFn: async (sectionIds: string[]) => {
      for (const sectionId of sectionIds) {
        await chronoAPI.post(`/api/timetable/${timetableId}/add`, {
          sectionId,
        });
      }
    },
    // refetch on failure too: earlier sections may already be back
    onSettled: invalidate,
    onError: () => haptic("error"),
  });

  return useApiMutation({
    ...sectionMutationOptions(timetableId),
    mutationFn: async ({ courseId }: { courseId: string; code: string }) => {
      if (timetableId === undefined) throw new Error("Timetable is not loaded");
      const result = await chronoAPI.post<{ sectionIds: string[] }>(
        `/api/timetable/${timetableId}/removeCourse`,
        { courseId },
      );
      return result.data;
    },
    onSuccess: ({ sectionIds }, { code }) => {
      toast({
        title: `Removed ${code}`,
        action: (
          <ToastAction
            altText={`Undo removing ${code}`}
            className="relative"
            onClick={() => {
              haptic("selection");
              restore(sectionIds);
            }}
          >
            Undo
            <HapticTap />
          </ToastAction>
        ),
      });
      return invalidate();
    },
    onError: () => haptic("error"),
  });
};
