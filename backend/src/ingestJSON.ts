import type { sectionTypeEnum } from "lib";
import { type QueryRunner, Raw } from "typeorm";
import { Course, Section, Timetable } from "./entity/entities.js";

interface ExamJSON {
  midsem: string | null;
  compre: string | null;
}
interface ScheduleJSON {
  room: string;
  days: string[];
  hours: number[];
}
interface SectionJSON {
  instructor: string[];
  schedule: ScheduleJSON[];
}
interface CourseJSON {
  units: number;
  course_name: string;
  sections: Record<string, SectionJSON>;
  exams_iso: ExamJSON[];
}
interface TimetableJSON {
  courses: Record<string, CourseJSON>;
  metadata: {
    acadYear: number;
    semester: number;
  };
}

export const ingestJSON = async (
  timetableJSON: TimetableJSON,
  queryRunner: QueryRunner,
) => {
  try {
    await queryRunner.startTransaction();

    console.time("ingestion took");

    const year = timetableJSON.metadata.acadYear;
    const semester = timetableJSON.metadata.semester;
    const forceOverwrite = process.argv[2] === "--overwrite";
    let archivedCoursesUpdateCount = 0;
    let archivedTimetablesUpdateCount = 0;
    let archivedTimetablesDeleteCount = 0;

    const manager = queryRunner.manager;
    const latestCourse = await manager
      .createQueryBuilder(Course, "course")
      .orderBy("course.acad_year", "DESC")
      .addOrderBy("course.semester", "DESC")
      .getOne();

    if (latestCourse !== null) {
      const latestSemester = {
        acadYear: latestCourse.acadYear,
        semester: latestCourse.semester,
      };

      // Do some basic year and semester checking
      if (latestCourse.acadYear > year) {
        console.error(
          `error: timetable.json is outdated; latest course academic year is ${latestCourse.acadYear} while the timetable is of academic year ${year}`,
        );
        throw Error(
          `error: timetable.json is outdated; latest course academic year is ${latestCourse.acadYear} while the timetable is of academic year ${year}`,
        );
      }
      if (latestCourse.acadYear === year) {
        if (latestCourse.semester > semester) {
          console.error(
            `error: timetable.json is outdated; latest course academic year is ${latestCourse.acadYear} and semester is ${latestCourse.semester} while the timetable is of academic year ${year} and semester ${semester}`,
          );
          throw Error(
            `error: timetable.json is outdated; latest course academic year is ${latestCourse.acadYear} and semester is ${latestCourse.semester} while the timetable is of academic year ${year} and semester ${semester}`,
          );
        }
        if (latestCourse.semester === semester) {
          // If forceOverwrite is not set, then show error
          if (!forceOverwrite) {
            console.log(
              `error: timetable.json is of same semester; latest course academic year is ${latestCourse.acadYear} and semester is ${latestCourse.semester} while the timetable is of academic year ${year} and semester ${semester}`,
            );
            console.log(
              "since the --overwrite flag has not been passed, the courses for this semester will not be overwritten",
            );
            console.log(
              "if you wish to overwrite the courses for this semester, set this value to true",
            );
            console.log(
              "WARNING: overwriting will wipe all courses, sections, and timetables for that combination of academic year and semester",
            );
            return;
          }

          // Else, delete old timetables and courses
          console.log(
            "WARNING: overwriting will wipe all courses, sections, and timetables for that combination of academic year and semester",
          );

          console.log(
            "You have 30 seconds to rethink what you're about to do...",
          );
          await new Promise((resolve) => {
            setTimeout(resolve, 30000);
          });

          console.log(
            `deleting timetables from academic year ${latestCourse.acadYear} and semester ${latestCourse.semester}...`,
          );
          const deletedTimetableResult = await manager.delete(
            Timetable,
            latestSemester,
          );
          console.log(
            `deleted ${deletedTimetableResult.affected} timetables from academic year ${latestCourse.acadYear} and semester ${latestCourse.semester}!`,
          );

          console.log(
            `deleting courses from academic year ${latestCourse.acadYear} and semester ${latestCourse.semester}...`,
          );
          const deletedCourseResult = await manager.delete(
            Course,
            latestSemester,
          );
          console.log(
            `deleted ${deletedCourseResult.affected} courses from academic year ${latestCourse.acadYear} and semester ${latestCourse.semester}!`,
          );
        }
      }

      // Overwriting and checking validity of ingestion is done, so now run normal ingestion
      console.log("marking all old courses as archived...");
      const archivedCoursesUpdateResult = await manager.update(
        Course,
        latestSemester,
        { archived: true },
      );
      archivedCoursesUpdateCount = archivedCoursesUpdateResult.affected ?? 0;
      console.log("marked old courses as archived!");

      console.log("marking all old non-draft timetables as archived...");
      const archivedTimetablesUpdateResult = await manager.update(
        Timetable,
        { ...latestSemester, draft: false },
        { archived: true },
      );
      archivedTimetablesUpdateCount =
        archivedTimetablesUpdateResult.affected ?? 0;
      console.log("marked old non-draft timetables as archived!");

      console.log("archiving all old draft timetables with no warnings...");
      const archiveDraftTimetablesUpdateResult = await manager.update(
        Timetable,
        {
          ...latestSemester,
          draft: true,
          warnings: Raw((warnings) => `CARDINALITY(${warnings}) = 0`),
        },
        { archived: true, draft: false, private: false },
      );
      const archivedDraftTimetablesUpdateCount =
        archiveDraftTimetablesUpdateResult.affected ?? 0;
      console.log(
        `archived ${archivedDraftTimetablesUpdateCount} old draft timetables with no warnings!`,
      );

      console.log("deleting all old draft timetables with warnings...");
      const archiveDeletedTimetablesUpdateResult = await manager.delete(
        Timetable,
        {
          ...latestSemester,
          draft: true,
          warnings: Raw((warnings) => `CARDINALITY(${warnings}) > 0`),
        },
      );
      archivedTimetablesDeleteCount =
        archiveDeletedTimetablesUpdateResult.affected ?? 0;
      console.log(
        `deleted ${archivedTimetablesDeleteCount} old draft timetables with warnings!`,
      );

      console.log("checking if all existing courses are archived...");
      if (await manager.existsBy(Course, { archived: false })) {
        console.error(
          "error: not all courses in db are archived; db state inconsistent",
        );
        throw Error(
          "error: not all courses in db are archived; db state inconsistent",
        );
      }
      console.log("finished checking courses!");

      console.log("checking if all existing timetables are archived...");
      if (await manager.existsBy(Timetable, { archived: false })) {
        console.error(
          "error: not all timetables in db are archived; db state inconsistent",
        );
        throw Error(
          "error: not all timetables in db are archived; db state inconsistent",
        );
      }
      console.log("finished checking timetables!");
    }

    const courses = timetableJSON.courses;

    console.log("constructing courses...");
    const courseValues = Object.entries(courses).map(([code, course]) => {
      const midsemTimes = course.exams_iso[0].midsem;
      const compreTimes = course.exams_iso[0].compre;
      return {
        code,
        name: course.course_name,
        acadYear: year,
        semester: semester,
        archived: false,
        midsemStartTime: midsemTimes
          ? new Date(midsemTimes.split("|")[0])
          : undefined,
        midsemEndTime: midsemTimes
          ? new Date(midsemTimes.split("|")[1])
          : undefined,
        compreStartTime: compreTimes
          ? new Date(compreTimes.split("|")[0])
          : undefined,
        compreEndTime: compreTimes
          ? new Date(compreTimes.split("|")[1])
          : undefined,
      };
    });

    console.log("inserting courses...");
    const courseInsertResult = await manager
      .createQueryBuilder()
      .insert()
      .into(Course)
      .values(courseValues)
      .execute();
    console.log("courses inserted!");

    console.log("constructing sections...");
    const sectionValues = courseValues.flatMap(({ code }, i) =>
      Object.entries(courses[code].sections).map(([sectionCode, section]) => ({
        // insert returns ids in the same order as courseValues
        courseId: courseInsertResult.identifiers[i].id,
        instructors: section.instructor,
        type: sectionCode.slice(0, 1) as sectionTypeEnum,
        number: Number.parseInt(sectionCode.slice(1), 10),
        roomTime: section.schedule.flatMap(({ room, days, hours }) =>
          days.flatMap((day) =>
            hours.map((hour) => `${code}:${room}:${day}:${hour}`),
          ),
        ),
      })),
    );

    console.log("inserting sections...");
    const sectionInsertResult = await manager
      .createQueryBuilder()
      .insert()
      .into(Section)
      .values(sectionValues)
      .execute();
    console.log("sections inserted!");

    await queryRunner.commitTransaction();
    // show summary of the transaction
    console.log("================= SUMMARY =================");
    console.log(`courses archived: ${archivedCoursesUpdateCount}`);
    console.log(`timetables archived: ${archivedTimetablesUpdateCount}`);
    console.log(
      `timetables deleted while archiving: ${archivedTimetablesDeleteCount}`,
    );
    console.log(`courses inserted: ${courseInsertResult.identifiers.length}`);
    console.log(`sections inserted: ${sectionInsertResult.identifiers.length}`);
    console.timeEnd("ingestion took");
  } catch (err) {
    // since we have errors let's rollback changes we made
    await queryRunner.rollbackTransaction();
    console.log(`error! err: ${err}`);
  }
};
