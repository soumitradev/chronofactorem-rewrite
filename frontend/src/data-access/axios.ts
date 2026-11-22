import {
  type MutateOptions,
  type UseMutationOptions,
  useMutation,
} from "@tanstack/react-query";
import axios from "axios";
import { useRef } from "react";
import { toastHandler } from "./errors";

const chronoAPI = axios.create({
  headers: {
    "Content-Type": "application/json",
  },
});

export default chronoAPI;

type Lock = { inFlight: number };

const sharedLocks = new Map<string, Lock>();

// one lock per timetable, so section changes, swaps and removals never overlap
export const sectionLock = (timetableId: string | undefined) =>
  `sections:${timetableId}`;

// isPending lags a render behind a double tap, so `mutateOnce` checks a sync lock
// and skips while a call sharing it is in flight. `unlockOnSuccess: false` keeps
// it held after success, for pages that navigate away
export function useApiMutation<TData, TVariables = void, TContext = unknown>({
  lock: lockKey,
  unlockOnSuccess = true,
  ...options
}: UseMutationOptions<TData, Error, TVariables, TContext> & {
  lock?: string;
  unlockOnSuccess?: boolean;
}) {
  const ownLock = useRef<Lock>({ inFlight: 0 }).current;
  let lock = ownLock;
  if (lockKey !== undefined) {
    lock = sharedLocks.get(lockKey) ?? { inFlight: 0 };
    sharedLocks.set(lockKey, lock);
  }
  const release = () => {
    lock.inFlight = Math.max(0, lock.inFlight - 1);
  };

  const mutation = useMutation({
    ...options,
    onSuccess: (...args) => {
      if (unlockOnSuccess) release();
      return options.onSuccess?.(...args);
    },
    onError: (...args) => {
      release();
      options.onError?.(...args);
      toastHandler(args[0]);
    },
  });

  const mutate = (
    variables: TVariables,
    callbacks?: MutateOptions<TData, Error, TVariables, TContext>,
  ) => {
    lock.inFlight++;
    mutation.mutate(variables, callbacks);
  };
  const mutateAsync = (
    variables: TVariables,
    callbacks?: MutateOptions<TData, Error, TVariables, TContext>,
  ) => {
    lock.inFlight++;
    return mutation.mutateAsync(variables, callbacks);
  };
  const isLocked = () => lock.inFlight > 0;
  const mutateOnce = (
    variables: TVariables,
    callbacks?: MutateOptions<TData, Error, TVariables, TContext>,
  ) => {
    if (isLocked()) return;
    mutate(variables, callbacks);
  };

  return { ...mutation, mutate, mutateAsync, mutateOnce, isLocked };
}
