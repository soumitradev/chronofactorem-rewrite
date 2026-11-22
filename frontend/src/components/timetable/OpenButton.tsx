import type { TimetableCell } from "@/utils/timetableGrid";

export function OpenButton({
  cell,
  onOpen,
  onRemove,
  onClick,
  className = "",
  ...props
}: React.ComponentProps<"button"> & {
  cell: TimetableCell;
  onOpen?: (
    cell: TimetableCell,
    event: React.MouseEvent | React.KeyboardEvent,
  ) => void;
  onRemove?: (cell: TimetableCell) => void;
}) {
  return (
    <button
      type="button"
      {...props}
      // DeskGrid's tooltip trigger passes its own onClick, so call it too
      onClick={(event) => {
        onOpen?.(cell, event);
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onRemove?.(cell);
        }
      }}
      aria-description="Press Delete to remove"
      className={`cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-60 ${className}`}
    />
  );
}
