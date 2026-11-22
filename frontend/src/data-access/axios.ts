import { type UseMutationOptions, useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toastHandler } from "./errors";

const chronoAPI = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
});

export default chronoAPI;

// every API mutation toasts its failures
export function useApiMutation<TData, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, Error, TVariables, TContext>,
) {
  return useMutation({
    ...options,
    onError: (...args) => {
      options.onError?.(...args);
      toastHandler(args[0]);
    },
  });
}
