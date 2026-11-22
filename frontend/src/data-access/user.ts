import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AxiosError } from "axios";
import type {
  announcementWithIDType,
  timetableType,
  userWithTimetablesType,
} from "lib";
import type z from "zod";
import { useToast } from "@/components/ui/use-toast";
import chronoAPI from "./axios";
import { toastHandler } from "./errors";

type userAuthStatusType = {
  message: string;
  redirect?: string;
  error?: string;
};

const fetchUserAuthStatus = async (): Promise<userAuthStatusType> => {
  const response = await chronoAPI.get("/api/auth/check");
  return response.data;
};

export const authStatusQueryOptions = queryOptions({
  queryKey: ["authStatusCheck"],
  queryFn: () => fetchUserAuthStatus(),
});

type Timetable = z.infer<typeof timetableType>;
const filterTimetables = (timetables: Timetable[]) => {
  const publicTimetables: Timetable[] = [];
  const privateTimetables: Timetable[] = [];
  const draftTimetables: Timetable[] = [];
  const archivedTimetables: Timetable[] = [];

  for (const timetable of timetables) {
    if (timetable.archived) {
      archivedTimetables.push(timetable);
    } else if (timetable.draft) {
      draftTimetables.push(timetable);
    } else if (timetable.private) {
      privateTimetables.push(timetable);
    } else {
      publicTimetables.push(timetable);
    }
  }

  return {
    publicTimetables,
    privateTimetables,
    draftTimetables,
    archivedTimetables,
  };
};

const fetchUserDetails = async (): Promise<
  z.infer<typeof userWithTimetablesType>
> => {
  const response =
    await chronoAPI.get<z.infer<typeof userWithTimetablesType>>("/api/user");
  return response.data;
};

export const userQueryOptions = queryOptions({
  queryKey: ["user"],
  queryFn: () => fetchUserDetails(),
  // a 401 just means the visitor is logged out, so retrying is pointless
  retry: (failureCount, error) => {
    if (error instanceof AxiosError && error.response?.status === 401) {
      return false;
    }
    return failureCount < 3;
  },
  select: (data) => {
    return { ...data, ...filterTimetables(data.timetables) };
  },
});

export const useUser = () => useQuery(userQueryOptions);

export const useCreateUser = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { degrees: (string | null)[] }) => {
      return chronoAPI.post("/api/auth/submit", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user"],
      });
    },
    onError: (error) => toastHandler(error, toast),
  });
};

export const useEditUser = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { degrees: (string | null)[] }) => {
      return chronoAPI.post("/api/user/edit", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user"],
      });
    },
    onError: (error) => toastHandler(error, toast),
  });
};

const fetchAnnouncements = async (): Promise<
  z.infer<typeof announcementWithIDType>[]
> => {
  const response = await chronoAPI.get<
    z.infer<typeof announcementWithIDType>[]
  >("/api/user/announcements");
  return response.data;
};

export const useAnnouncements = () =>
  useQuery({
    queryKey: ["announcements"],
    queryFn: fetchAnnouncements,
  });
