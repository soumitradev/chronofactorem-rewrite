type Slotted = { courseId: string; type: string; roomTime: string[] };

// a section's day and hour, without the course code and room
const slot = (roomTime: string) => roomTime.split(":").slice(2).join(":");

// the timetable's sections that `section` would clash with. Picking another
// section of the same course and type swaps it, so those don't clash
export function clashingSections<T extends Slotted>(
  section: Slotted,
  chosen: T[],
): T[] {
  return chosen.filter(
    (item) =>
      !(item.courseId === section.courseId && item.type === section.type) &&
      item.roomTime.some((existing) =>
        section.roomTime.some((incoming) => slot(existing) === slot(incoming)),
      ),
  );
}
