import type { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Route,
  redirect,
  rootRouteWithContext,
} from "@tanstack/react-router";
import { AxiosError } from "axios";
import { useEffect } from "react";
import * as z from "zod/mini";
import { CruxMark } from "@/components/CruxMark";
import { HomeSkeleton } from "@/components/HomeSkeleton";
import NotFound from "@/components/NotFound";
import { TimetablePageSkeleton } from "@/components/timetable/TimetablePageSkeleton";
import { useToast } from "@/components/ui/use-toast";
import { handleLoginRedirect } from "@/data-access/errors/handlers";
import toastHandler from "@/data-access/errors/toastHandler";
import { authStatusQueryOptions } from "@/data-access/hooks/useAuthStatus";
import { courseQueryOptions } from "@/data-access/hooks/useCourses";
import { timetableQueryOptions } from "@/data-access/hooks/useTimetable";
import { userQueryOptions } from "@/data-access/hooks/useUser";
import { rootSearchSchema, timetableSearchSchema } from "@/lib/timetableSearch";
import RootComponent from "./RootComponent";

export const rootRoute = rootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootComponent,
  validateSearch: rootSearchSchema,
});

const ToastError = ({ error }: { error: Error }) => {
  const { toast } = useToast();
  toastHandler(error, toast);
};

const loginRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "login",
  loader: ({ context: { queryClient } }) =>
    queryClient
      .ensureQueryData(authStatusQueryOptions)
      .then((data) => {
        if (data) throw redirect({ to: data.redirect });
      })
      .catch((error) => {
        // a 401 means the user should be on the login page
        if (error instanceof AxiosError && error.response?.status === 401)
          return;
        throw error;
      }),
  errorComponent: ToastError,
}).lazy(() => import("./pages/Login").then((d) => d.Route));

// Users land here after every login, so registered users (the ones /api/user
// knows) are sent home. Unregistered ones get a 401 and fill in their degrees
const getDegreesRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "getDegrees",
  // same bounds as collegeYearType in lib, which uses full zod
  validateSearch: z.object({ year: z.int().check(z.minimum(1), z.maximum(6)) }),
  loader: async ({ context: { queryClient } }) => {
    try {
      await queryClient.ensureQueryData(userQueryOptions);
    } catch (error) {
      // without a valid Google OAuth session there is nothing to register
      if (
        error instanceof AxiosError &&
        error.response?.status === 401 &&
        error.response.data.error === "user session expired"
      )
        throw redirect({ to: "/login" });
      return;
    }
    throw redirect({ to: "/" });
  },
  errorComponent: ToastError,
}).lazy(() => import("./pages/GetDegrees").then((d) => d.Route));

const aboutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: "about",
}).lazy(() => import("./pages/About").then((d) => d.Route));

const authenticatedRoute = new Route({
  id: "authenticated",
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ context: { queryClient } }) => {
    try {
      await queryClient.ensureQueryData(authStatusQueryOptions);
    } catch (e) {
      if (e instanceof AxiosError && e.response) {
        if (
          e.response.status === 200 &&
          e.response.data.message === "user needs to get degrees"
        ) {
          throw redirect({
            to: e.response.data.redirect,
          });
        }
        if (e.response.status === 401 || e.response.status === 500) {
          throw redirect({
            to: "/login",
          });
        }
      } else {
        throw e;
      }
    }
  },
  component: Outlet,
});

const homeRoute = new Route({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  loader: ({ context: { queryClient }, preload }) =>
    queryClient.ensureQueryData(userQueryOptions).catch((error) => {
      if (!preload) handleLoginRedirect(error);
      throw error;
    }),
  pendingComponent: HomeSkeleton,
  errorComponent: ToastError,
}).lazy(() => import("./pages/Home").then((d) => d.Route));

const editUserProfileRoute = new Route({
  getParentRoute: () => authenticatedRoute,
  path: "editProfile",
  loader: async ({ context: { queryClient }, preload }) => {
    try {
      return await queryClient.ensureQueryData(userQueryOptions);
    } catch (error: unknown) {
      if (!preload) handleLoginRedirect(error);
      throw error;
    }
  },
  errorComponent: ToastError,
}).lazy(() => import("./pages/EditUserProfile").then((d) => d.Route));

const timetablePageLoader = async ({
  context: { queryClient },
  params: { timetableId },
}: {
  context: { queryClient: QueryClient };
  params: { timetableId: string };
}) => {
  queryClient.ensureQueryData(userQueryOptions).catch(() => {
    // user is optional on timetable pages: viewing works logged out
  });
  // Courses are per semester, so the timetable loads first. Awaiting both
  // keeps them in the loader, so preloading warms them before navigation
  const timetable = await queryClient.ensureQueryData(
    timetableQueryOptions(timetableId),
  );
  await queryClient.ensureQueryData(
    courseQueryOptions({
      acadYear: timetable.acadYear,
      semester: timetable.semester,
    }),
  );
};

const TimetablePageError = ({ error }: { error: Error }) => {
  const { toast } = useToast();
  const is404 = error instanceof AxiosError && error.response?.status === 404;
  useEffect(() => {
    if (is404) return;
    handleLoginRedirect(error);
    toastHandler(error, toast);
  }, [error, toast, is404]);
  // a notFound() thrown here would skip notFoundComponent for the root error
  // boundary. Drafts 404 for anyone but their author, so this path is common
  if (is404) return <NotFound />;
  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-[320px] flex-1 flex-col items-center justify-center px-4 py-16 text-center"
    >
      <CruxMark />
      <h1 className="text-xl font-semibold">Could not load this timetable</h1>
      <p className="mt-2 text-base leading-relaxed text-ink-muted">
        Try refreshing the page. If this keeps happening, report the issue using
        the notification.
      </p>
    </div>
  );
};

const timetablePageOptions = <P extends "edit" | "view">(page: P) => ({
  path: `${page}/$timetableId` as `${P}/$timetableId`,
  loader: timetablePageLoader,
  validateSearch: timetableSearchSchema,
  pendingComponent: () => <TimetablePageSkeleton page={page} />,
  pendingMs: 200,
  notFoundComponent: NotFound,
  errorComponent: TimetablePageError,
});

const editTimetableRoute = new Route({
  getParentRoute: () => authenticatedRoute,
  ...timetablePageOptions("edit"),
}).lazy(() => import("./pages/EditTimetable").then((d) => d.Route));

const viewTimetableRoute = new Route({
  getParentRoute: () => rootRoute,
  ...timetablePageOptions("view"),
}).lazy(() => import("./pages/ViewTimetable").then((d) => d.Route));

const finalizeTimetableRoute = new Route({
  getParentRoute: () => authenticatedRoute,
  path: "finalize/$timetableId",
  loader: ({ context: { queryClient }, params: { timetableId } }) =>
    queryClient.ensureQueryData(timetableQueryOptions(timetableId)),
  errorComponent: TimetablePageError,
}).lazy(() => import("./pages/FinalizeTimetable").then((d) => d.Route));

export const routeTree = rootRoute.addChildren([
  loginRoute,
  getDegreesRoute,
  aboutRoute,
  viewTimetableRoute,
  authenticatedRoute.addChildren([
    homeRoute,
    editUserProfileRoute,
    editTimetableRoute,
    finalizeTimetableRoute,
  ]),
]);
