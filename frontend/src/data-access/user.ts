import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import type { announcementWithIDType, userWithTimetablesType } from "lib";
import type z from "zod";
import chronoAPI, { useApiMutation } from "./axios";

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
});

export const useUser = () => useQuery(userQueryOptions);

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useApiMutation({
    // both pages navigate away on success
    unlockOnSuccess: false,
    mutationFn: (body: { degrees: (string | null)[] }) => {
      return chronoAPI.post("/api/auth/submit", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user"],
      });
    },
  });
};

export const useEditUser = () => {
  const queryClient = useQueryClient();
  return useApiMutation({
    // both pages navigate away on success
    unlockOnSuccess: false,
    mutationFn: (body: { degrees: (string | null)[] }) => {
      return chronoAPI.post("/api/user/edit", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user"],
      });
    },
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
