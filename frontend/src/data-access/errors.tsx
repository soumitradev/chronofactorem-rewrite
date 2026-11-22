import { AxiosError, type AxiosResponse } from "axios";
import ReportIssueToastAction from "@/components/ReportIssueToastAction";
import { toast } from "@/components/ui/use-toast";
import { router } from "@/router";

const errorTitleMap: Partial<Record<number, string>> = {
  400: "Error",
  403: "Error",
  404: "Error",
  500: "Server Error",
};

export const HTTPError = <T extends object, K>(
  response: AxiosResponse<T, K>,
  status: number,
) => {
  return {
    title: errorTitleMap[status] ?? "Request failed",
    description:
      "message" in response.data && typeof response.data.message === "string"
        ? response.data.message
        : `API returned ${response.status}`,
    variant: "destructive" as const,
    action: <ReportIssueToastAction />,
  };
};

export const UnknownError = () => {
  return {
    title: "Unknown Error",
    description: "An unknown error occurred.",
    variant: "destructive" as const,
    action: <ReportIssueToastAction />,
  };
};

export const handleLoginRedirect = (error: unknown) => {
  if (
    error instanceof AxiosError &&
    error.response &&
    error.response.status === 401
  ) {
    router.navigate({
      to: "/login",
    });
  }
};

export const toastHandler = (error: Error) => {
  if (error instanceof AxiosError && error.response) {
    switch (error.response.status) {
      case 401:
        handleLoginRedirect(error);
        return;
      default:
        toast(HTTPError(error.response, error.response.status));
        return;
    }
  }
  console.error(error);
  toast(UnknownError());
};
