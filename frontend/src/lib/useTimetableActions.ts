import { useIsMutating } from "@tanstack/react-query";
import { useTimetableState } from "@/context";
import {
  editTimetableKey,
  useCopyTimetable,
  useEditTimetable,
} from "@/data-access/timetables";
import { router } from "../router";
import { preloadEditorOnIntent, preloadOnIntent } from "./preloadOnIntent";

export function useTimetableActions(): {
  copy(): void;
  edit(): void;
  publish(): void;
  isEditing: boolean;
  intent: Record<
    "copy" | "edit" | "publish",
    Partial<ReturnType<typeof preloadOnIntent>>
  >;
} {
  const {
    state: { timetable },
    setIsCopyingTimetable,
  } = useTimetableState();
  const { mutateAsync: editTimetable } = useEditTimetable();
  const isEditing = useIsMutating({ mutationKey: editTimetableKey }) > 0;
  const { mutateAsync: copyTimetable } = useCopyTimetable();

  const edit = () => {
    if (timetable === undefined) return;
    editTimetable({
      id: timetable.id,
      body: {
        isDraft: true,
        isPrivate: true,
        name: timetable?.name ?? "",
      },
    })
      .then(() =>
        router.navigate({
          to: "/edit/$timetableId",
          params: { timetableId: timetable.id },
        }),
      )
      .catch(() => {
        // useEditTimetable already toasts the error
      });
  };

  const copy = () => {
    if (timetable === undefined) return;
    setIsCopyingTimetable(true);
    setTimeout(() => {
      // react query drops per-call mutate callbacks once the caller unmounts
      // (it may be a closing menu), so navigate from the promise
      copyTimetable(timetable.id)
        .then((res) =>
          router.navigate({
            to: "/edit/$timetableId",
            params: { timetableId: res.data.id },
          }),
        )
        .catch(() => {
          // useCopyTimetable already toasts the error
        });
      setTimeout(() => {
        setIsCopyingTimetable(false);
      }, 1000);
    }, 1000);
  };

  const publish = () => {
    if (timetable === undefined) return;
    router.navigate({
      to: "/finalize/$timetableId",
      params: { timetableId: timetable.id },
    });
  };

  const intent = {
    copy: preloadEditorOnIntent(),
    edit: timetable
      ? preloadOnIntent({
          to: "/edit/$timetableId",
          params: { timetableId: timetable.id },
        })
      : {},
    publish: timetable
      ? preloadOnIntent({
          to: "/finalize/$timetableId",
          params: { timetableId: timetable.id },
        })
      : {},
  };

  return { copy, edit, publish, isEditing, intent };
}
