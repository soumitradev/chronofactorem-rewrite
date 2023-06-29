import { Timetable } from "../entity/Timetable";
import { Section } from "../entity/Section";
import { Course } from "../entity/Course";

export const checkForClassHoursClash = (
  currentTimetable: Timetable,
  newSection: Section
) => {
  console.log(
    "===================================checking for clashes==================================="
  );
  const times = currentTimetable.timings;
  const newRoomTimes = newSection.roomTime;
  console.log(times);
  console.log(newRoomTimes);

  const timesMap = new Map<string, { courseCode: string }>();

  times.forEach((time) => {
    const [course, slot] = time.split(":");
    timesMap.set(slot, { courseCode: course });
  });

  console.log(timesMap);

  const newTimes = newRoomTimes.map((roomTime) => {
    const [_, day, hour] = roomTime.split(":");
    return day + hour;
  });

  console.log(newTimes);

  for (const newTime of newTimes) {
    if (timesMap.has(newTime)) {
      const clashCheck = timesMap.get(newTime);
      console.log(clashCheck);
      if (clashCheck !== undefined) {
        const clashCourse = clashCheck.courseCode;
        return {
          clash: true,
          course: clashCourse,
        };
      }
    }
  }

  return {
    clash: false,
    course: null,
  };
};

export const checkForExamHoursClash = (
  currentTimetable: Timetable,
  newCourse: Course
) => {
  const examTimes = currentTimetable.examTimes;
  // key: start time, value: { courseCode, end time }
  const examTimesMap = new Map<Date, { courseCode: string; end: Date }>();

  examTimes.forEach((examTime) => {
    const [course, startAndEnd] = examTime.split(":");
    const [start, end] = startAndEnd.split("|");
    examTimesMap.set(new Date(start), {
      courseCode: course,
      end: new Date(end),
    });
  });

  const newMidsemStartTime = newCourse.midsemStartTime;
  const newMidsemEndTime = newCourse.midsemEndTime;

  examTimesMap.forEach((value, key) => {
    const { courseCode, end } = value;
    const start = key;
    if (
      (newMidsemStartTime <= start && newMidsemEndTime >= start) ||
      (newMidsemStartTime <= end && newMidsemEndTime >= end) ||
      (newMidsemStartTime >= start && newMidsemEndTime <= end)
    ) {
      return {
        clash: true,
        exam: "midsem",
        course: courseCode,
      };
    }
  });

  const newCompreStartTime = newCourse.compreStartTime;
  const newCompreEndTime = newCourse.compreEndTime;

  examTimesMap.forEach((value, key) => {
    const { courseCode, end } = value;
    const start = key;
    if (
      (newCompreStartTime <= start && newCompreEndTime >= start) ||
      (newCompreStartTime <= end && newCompreEndTime >= end) ||
      (newCompreStartTime >= start && newCompreEndTime <= end)
    ) {
      return {
        clash: true,
        exam: "compre",
        course: courseCode,
      };
    }
  });

  return {
    clash: false,
    exam: "",
    course: "",
  };
};
