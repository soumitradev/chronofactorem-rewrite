import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { timetableWithSectionsType } from "lib";
import type z from "zod";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { HapticTap, haptic } from "@/lib/haptics";
import chronoAPI from "./axios";
import { toastHandler } from "./errors";

const fetchTimetable = async (timetableId: string) => {
  const response = await chronoAPI.get<
    z.infer<typeof timetableWithSectionsType>
  >(`/api/timetable/${timetableId}`);
  return response.data;
};

export const timetableQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["timetable", id],
    queryFn: () => fetchTimetable(id),
  });

export const useTimetable = (id: string) => useQuery(timetableQueryOptions(id));

export const useCreateTimetable = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
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
    onError: (e) => toastHandler(e, toast),
  });
};

export const useCopyTimetable = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return chronoAPI.post<{ message: string; id: string }>(
        `/api/timetable/${id}/copy`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: (error) => toastHandler(error, toast),
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

// Shared so every caller sees one edit in flight, wherever it was started.
export const editTimetableKey = ["editTimetable"];

export const useEditTimetable = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: editTimetableKey,
    mutationFn: (data: EditTimetableParams) => {
      return chronoAPI.post(`/api/timetable/${data.id}/edit`, data.body);
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      // Make sure we actually refetch data here!
      await queryClient.invalidateQueries(
        { queryKey: ["timetable", variables.id], refetchType: "all" },
        { throwOnError: true },
      );
    },
    onError: (e) => toastHandler(e, toast),
  });
};

export const useDeleteTimetable = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      return chronoAPI.post(`/api/timetable/${id}/delete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user"],
      });
    },
    onError: (e) => toastHandler(e, toast),
  });
};

type SectionAction = "add" | "remove";

export const useAddRemoveTimetableSection = (
  timetableId: string | undefined,
) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["sections", timetableId],
    scope: { id: `sections:${timetableId}` },
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
    onSuccess: () => {
      // home lists timetables by last edit
      queryClient.invalidateQueries({ queryKey: ["user"] });
      return queryClient.invalidateQueries({
        queryKey: ["timetable", timetableId],
      });
    },
    onError: (error) => {
      haptic("error");
      toastHandler(error, toast);
    },
  });
};

export const useSwapTimetableSections = (timetableId: string | undefined) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["sections", timetableId],
    scope: { id: `sections:${timetableId}` },
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
    onSuccess: () => {
      // home lists timetables by last edit
      queryClient.invalidateQueries({ queryKey: ["user"] });
      return queryClient.invalidateQueries({
        queryKey: ["timetable", timetableId],
      });
    },
    onError: (error) => {
      haptic("error");
      toastHandler(error, toast);
    },
  });
};

// shares the section mutations' key and scope, so it queues behind them
export const useRemoveTimetableCourse = (timetableId: string | undefined) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["user"] });
    return queryClient.invalidateQueries({
      queryKey: ["timetable", timetableId],
    });
  };

  const { mutate: restore } = useMutation({
    mutationKey: ["sections", timetableId],
    scope: { id: `sections:${timetableId}` },
    mutationFn: async (sectionIds: string[]) => {
      for (const sectionId of sectionIds) {
        await chronoAPI.post(`/api/timetable/${timetableId}/add`, {
          sectionId,
        });
      }
    },
    // refetch on failure too: earlier sections may already be back
    onSettled: invalidate,
    onError: (error) => {
      haptic("error");
      toastHandler(error, toast);
    },
  });

  return useMutation({
    mutationKey: ["sections", timetableId],
    scope: { id: `sections:${timetableId}` },
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
    onError: (error) => {
      haptic("error");
      toastHandler(error, toast);
    },
  });
};
