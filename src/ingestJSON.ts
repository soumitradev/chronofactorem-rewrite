import { Course } from "./entity/Course";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { Section } from "./entity/Section";
import { Timetable } from "./entity/Timetable";
import { QueryRunner } from "typeorm";

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
interface SectionsJSON {
  [key: string]: SectionJSON;
}
interface CourseJSON {
  units: number;
  course_name: string;
  sections: SectionsJSON;
  exams_iso: ExamJSON[];
}
interface CoursesJSON {
  [key: string]: CourseJSON;
}
interface MetadataJSON {
  acadYear: number;
  semester: number;
}

interface TimetableJSON {
  courses: CoursesJSON;
  metadata: MetadataJSON;
}

export const ingestJSON = async (
  timetableJSON: TimetableJSON,
  queryRunner: QueryRunner
) => {
  try {
    await queryRunner.startTransaction();

    const starthrTime = process.hrtime();
    const startTime = starthrTime[0] * 1000 + starthrTime[1] / 1000000;

    const year = timetableJSON.metadata.acadYear;
    const semester = timetableJSON.metadata.semester;
    const forceOverwrite = process.argv[2] && process.argv[2] === "--overwrite";
    let archivedCoursesUpdateCount = 0;
    let archivedTimetablesUpdateCount = 0;

    const latestCourse = await queryRunner.manager
      .createQueryBuilder(Course, "course")
      .orderBy("course.acad_year", "DESC")
      .orderBy("course.semester", "DESC")
      .getOne();

    if (latestCourse !== null) {
      if (latestCourse.acadYear > year) {
        console.error(
          `error: timetable.json is outdated; latest course academic year is ${latestCourse.acadYear} while the timetable is of academic year ${year}`
        );
        throw Error(
          `error: timetable.json is outdated; latest course academic year is ${latestCourse.acadYear} while the timetable is of academic year ${year}`
        );
      } else if (latestCourse.acadYear == year) {
        if (latestCourse.semester > semester) {
          console.error(
            `error: timetable.json is outdated; latest course academic year is ${latestCourse.acadYear} and semester is ${latestCourse.semester} while the timetable is of academic year ${year} and semester ${semester}`
          );
          throw Error(
            `error: timetable.json is outdated; latest course academic year is ${latestCourse.acadYear} and semester is ${latestCourse.semester} while the timetable is of academic year ${year} and semester ${semester}`
          );
        } else if (latestCourse.semester == semester) {
          if (!forceOverwrite) {
            console.log(
              `error: timetable.json is of same semester; latest course academic year is ${latestCourse.acadYear} and semester is ${latestCourse.semester} while the timetable is of academic year ${year} and semester ${semester}`
            );
            console.log(
              `since the --overwrite flag has not been passed, the courses for this semester will not be overwritten`
            );
            console.log(
              `if you wish to overwrite the courses for this semester, set this value to true`
            );
            console.log(
              `WARNING: overwriting will wipe all courses, sections, and timetables for that combination of academic year and semester`
            );
            return;
          }
        }
      }

      if (
        latestCourse.acadYear == year &&
        latestCourse.semester == semester &&
        forceOverwrite
      ) {
        // console.log(
        //   `WARNING: overwriting will wipe all courses, sections, and timetables for that combination of academic year and semester`
        // );
        // console.log(
        //   `deleting courses from academic year ${latestCourse.acadYear} and semester ${latestCourse.semester}...`
        // );
        // const deletedCourseResult = await queryRunner.manager
        //   .createQueryBuilder()
        //   .delete()
        //   .from(Course)
        //   .where("acad_year = :year", { year: latestCourse.acadYear })
        //   .andWhere("semester = :semester", {
        //     semester: latestCourse.semester,
        //   })
        //   .execute();
        // console.log(
        //   `deleted ${deletedCourseResult.affected} courses from academic year ${latestCourse.acadYear} and semester ${latestCourse.semester}!`
        // );
        // console.log(
        //   `deleting timetables from academic year ${latestCourse.acadYear} and semester ${latestCourse.semester}...`
        // );
        // const deletedTimetableResult = await queryRunner.manager
        //   .createQueryBuilder()
        //   .delete()
        //   .from(Timetable)
        //   .where("acad_year = :year", { year: latestCourse.acadYear })
        //   .andWhere("semester = :semester", {
        //     semester: latestCourse.semester,
        //   })
        //   .execute();
        // console.log(
        //   `deleted ${deletedTimetableResult.affected} timetables from academic year ${latestCourse.acadYear} and semester ${latestCourse.semester}!`
        // );
        const courses = timetableJSON.courses as CoursesJSON;

        console.log("constructing courses...");
        const courseValues = await Promise.all(
          Object.keys(courses).map(async (courseCode) => {
            const midsemTimes = courses[courseCode].exams_iso[0].midsem;
            const compreTimes = courses[courseCode].exams_iso[0].compre;
            const existingCourseID = await queryRunner.manager
              .createQueryBuilder()
              .select()
              .from(Course, "course")
              .where("course.code = :code", { code: courseCode })
              .execute();
            if (existingCourseID[0] !== undefined) {
              return {
                id: existingCourseID[0].id,
                code: courseCode,
                name: courses[courseCode].course_name,
                acadYear: year,
                semester: semester,
                archived: false,
                midsemStartTime: midsemTimes
                  ? new Date(midsemTimes.split("|")[0])
                  : null,
                midsemEndTime: midsemTimes
                  ? new Date(midsemTimes.split("|")[1])
                  : null,
                compreStartTime: compreTimes
                  ? new Date(compreTimes.split("|")[0])
                  : null,
                compreEndTime: compreTimes
                  ? new Date(compreTimes.split("|")[1])
                  : null,
              } as QueryDeepPartialEntity<Course>;
            } else {
              const courseInsertResult = await queryRunner.manager
                .createQueryBuilder()
                .insert()
                .into(Course)
                .values({
                  code: courseCode,
                  name: courses[courseCode].course_name,
                  acadYear: year,
                  semester: semester,
                  archived: false,
                  midsemStartTime: midsemTimes
                    ? new Date(midsemTimes.split("|")[0])
                    : null,
                  midsemEndTime: midsemTimes
                    ? new Date(midsemTimes.split("|")[1])
                    : null,
                  compreStartTime: compreTimes
                    ? new Date(compreTimes.split("|")[0])
                    : null,
                  compreEndTime: compreTimes
                    ? new Date(compreTimes.split("|")[1])
                    : null,
                } as QueryDeepPartialEntity<Course>)
                .execute();
              console.log("INSERTED " + courseCode);
              return {
                id: courseInsertResult.identifiers[0].id,
                code: courseCode,
                name: courses[courseCode].course_name,
                acadYear: year,
                semester: semester,
                archived: false,
                midsemStartTime: midsemTimes
                  ? new Date(midsemTimes.split("|")[0])
                  : null,
                midsemEndTime: midsemTimes
                  ? new Date(midsemTimes.split("|")[1])
                  : null,
                compreStartTime: compreTimes
                  ? new Date(compreTimes.split("|")[0])
                  : null,
                compreEndTime: compreTimes
                  ? new Date(compreTimes.split("|")[1])
                  : null,
              } as QueryDeepPartialEntity<Course>;
            }
          })
        );

        console.log("updating courses...");
        const courseInsertResult = await queryRunner.manager.query(
          `UPDATE public.course AS c SET
            code = u.code,
            name = u.name,
            acad_year = u.acad_year,
            semester = u.semester,
            archived = u.archived,
            midsem_start_time = u.midsem_start_time,
            midsem_end_time = u.midsem_end_time,
            compre_start_time = u.compre_start_time,
            compre_end_time = u.compre_end_time
          FROM (VALUES
            ${courseValues
              .map((c) => {
                const escapedName = (c.name as string)
                  .replace(/\n/g, " ")
                  .replace(/'/g, "''");
                return `('${c.id}', '${c.code}', '${escapedName}', ${
                  c.acadYear
                }, ${c.semester}, ${c.archived}, ${
                  c.midsemStartTime === null
                    ? "NULL"
                    : `to_timestamp(${(
                        c.midsemStartTime as Date
                      ).getTime()} / 1000.0)`
                },${
                  c.midsemEndTime === null
                    ? "NULL"
                    : `to_timestamp(${(
                        c.midsemEndTime as Date
                      ).getTime()} / 1000.0)`
                },${
                  c.compreStartTime === null
                    ? "NULL"
                    : `to_timestamp(${(
                        c.compreStartTime as Date
                      ).getTime()} / 1000.0)`
                },${
                  c.compreEndTime === null
                    ? "NULL"
                    : `to_timestamp(${(
                        c.compreEndTime as Date
                      ).getTime()} / 1000.0)`
                })`;
              })
              .join(", ")}
          ) AS u(id, code, name, acad_year, semester, archived, midsem_start_time, midsem_end_time, compre_start_time, compre_end_time)
          WHERE u.id = c.id::text;`
        );
        console.log(courseInsertResult[1] + " courses updated!");

        // console.log("constructing sections...");
        // // grab the IDs of courses because we will use them for relations
        // const courseIDs = courseInsertResult.identifiers.map(
        //   (idObj) => idObj.id as string
        // );
        // for (let i = 0; i < courseValues.length; i++) {
        //   // for each course, loop over the sections, and add the room-timings to an array
        //   Object.keys(courses[courseValues[i].code as string].sections).forEach(
        //     (courseSectionCode) => {
        //       const roomTimes = [];
        //       const scheduleObjs =
        //         courses[courseValues[i].code as string].sections[
        //           courseSectionCode
        //         ].schedule;
        //       for (let j = 0; j < scheduleObjs.length; j++) {
        //         for (let k = 0; k < scheduleObjs[j].days.length; k++) {
        //           for (let l = 0; l < scheduleObjs[j].hours.length; l++) {
        //             roomTimes.push(
        //               `${courseValues[i].code}:${scheduleObjs[j].room}:${scheduleObjs[j].days[k]}:${scheduleObjs[j].hours[l]}`
        //             );
        //           }
        //         }
        //       }
        //       // push the section to an array, so we can insert all sections at once
        //       sectionValues.push({
        //         courseId: courseIDs[i],
        //         instructors:
        //           courses[courseValues[i].code as string].sections[
        //             courseSectionCode
        //           ].instructor,
        //         type: courseSectionCode.slice(0, 1),
        //         number: parseInt(courseSectionCode.slice(1)),
        //         roomTime: roomTimes,
        //       } as QueryDeepPartialEntity<Section>);
        //     }
        //   );
        // }

        // console.log("inserting sections...");
        // const sectionInsertResult = await queryRunner.manager
        //   .createQueryBuilder()
        //   .insert()
        //   .into(Section)
        //   .values(sectionValues)
        //   .execute();
        // console.log("sections inserted!");

        // await queryRunner.commitTransaction();
        // // show summary of the transaction
        // console.log("================= SUMMARY =================");
        // console.log(`courses archived: ${archivedCoursesUpdateCount}`);
        // console.log(`timetables archived: ${archivedTimetablesUpdateCount}`);
        // console.log(
        //   `courses inserted: ${courseInsertResult.identifiers.length}`
        // );
        // console.log(
        //   `sections inserted: ${sectionInsertResult.identifiers.length}`
        // );
        // const endhrTime = process.hrtime();
        // const endTime = endhrTime[0] * 1000 + endhrTime[1] / 1000000;
        // console.log(
        //   `Ingestion took ${Math.round((endTime - startTime) * 1000) / 1000}ms`
        // );
      } else {
        console.log("marking all old courses as archived...");
        const archivedCoursesUpdateResult = await queryRunner.manager
          .createQueryBuilder()
          .update(Course)
          .set({ archived: true })
          .where("acad_year = :year", { year: latestCourse.acadYear })
          .andWhere("semester = :semester", {
            semester: latestCourse.semester,
          })
          .execute();
        archivedCoursesUpdateCount = archivedCoursesUpdateResult.affected ?? 0;
        console.log("marked old courses as archived!");

        console.log("marking all old timetables as archived...");
        const archivedTimetablesUpdateResult = await queryRunner.manager
          .createQueryBuilder()
          .update(Timetable)
          .set({ archived: true })
          .where("acad_year = :year", { year: latestCourse.acadYear })
          .andWhere("semester = :semester", {
            semester: latestCourse.semester,
          })
          .execute();
        archivedTimetablesUpdateCount =
          archivedTimetablesUpdateResult.affected ?? 0;
        console.log("marked old timetables as archived!");

        console.log("checking if all existing courses are archived...");
        const allCoursesCountResult = await queryRunner.manager
          .createQueryBuilder()
          .select()
          .from(Course, "course")
          .getCount();
        const archivedCoursesCountResult = await queryRunner.manager
          .createQueryBuilder()
          .select()
          .from(Course, "course")
          .where("archived = :archived", { archived: true })
          .getCount();
        console.log(
          `${archivedCoursesCountResult}/${allCoursesCountResult} courses are archived`
        );
        if (archivedCoursesCountResult != allCoursesCountResult) {
          console.error(
            `error: not all courses in db are archived; db state inconsistent`
          );
          throw Error(
            `error: not all courses in db are archived; db state inconsistent`
          );
        }
        console.log("finished checking courses!");

        console.log("checking if all existing timetables are archived...");
        const allTimetablesCountResult = await queryRunner.manager
          .createQueryBuilder()
          .select()
          .from(Timetable, "timetable")
          .getCount();
        const archivedTimetablesCountResult = await queryRunner.manager
          .createQueryBuilder()
          .select()
          .from(Timetable, "timetable")
          .where("archived = :archived", { archived: true })
          .getCount();
        console.log(
          `${archivedTimetablesCountResult}/${allTimetablesCountResult} timetables are archived`
        );
        if (archivedTimetablesCountResult != allTimetablesCountResult) {
          console.error(
            `error: not all timetables in db are archived; db state inconsistent`
          );
          throw Error(
            `error: not all timetables in db are archived; db state inconsistent`
          );
        }
        console.log("finished checking timetables!");
      }
    }
    if (
      latestCourse &&
      latestCourse.acadYear == year &&
      latestCourse.semester == semester &&
      forceOverwrite
    ) {
      return;
    }

    const courses = timetableJSON.courses as CoursesJSON;

    const sectionValues = [] as QueryDeepPartialEntity<Section>[];

    console.log("constructing courses...");
    const courseValues = Object.keys(courses).map((courseCode) => {
      const midsemTimes = courses[courseCode].exams_iso[0].midsem;
      const compreTimes = courses[courseCode].exams_iso[0].compre;
      return {
        code: courseCode,
        name: courses[courseCode].course_name,
        acadYear: year,
        semester: semester,
        archived: false,
        midsemStartTime: midsemTimes
          ? new Date(midsemTimes.split("|")[0])
          : null,
        midsemEndTime: midsemTimes ? new Date(midsemTimes.split("|")[1]) : null,
        compreStartTime: compreTimes
          ? new Date(compreTimes.split("|")[0])
          : null,
        compreEndTime: compreTimes ? new Date(compreTimes.split("|")[1]) : null,
      } as QueryDeepPartialEntity<Course>;
    });

    console.log("inserting courses...");
    const courseInsertResult = await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into(Course)
      .values(courseValues)
      .execute();
    console.log("courses inserted!");

    console.log("constructing sections...");
    // grab the IDs of courses because we will use them for relations
    const courseIDs = courseInsertResult.identifiers.map(
      (idObj) => idObj.id as string
    );
    for (let i = 0; i < courseValues.length; i++) {
      // for each course, loop over the sections, and add the room-timings to an array
      Object.keys(courses[courseValues[i].code as string].sections).forEach(
        (courseSectionCode) => {
          const roomTimes = [];
          const scheduleObjs =
            courses[courseValues[i].code as string].sections[courseSectionCode]
              .schedule;
          for (let j = 0; j < scheduleObjs.length; j++) {
            for (let k = 0; k < scheduleObjs[j].days.length; k++) {
              for (let l = 0; l < scheduleObjs[j].hours.length; l++) {
                roomTimes.push(
                  `${courseValues[i].code}:${scheduleObjs[j].room}:${scheduleObjs[j].days[k]}:${scheduleObjs[j].hours[l]}`
                );
              }
            }
          }
          // push the section to an array, so we can insert all sections at once
          sectionValues.push({
            courseId: courseIDs[i],
            instructors:
              courses[courseValues[i].code as string].sections[
                courseSectionCode
              ].instructor,
            type: courseSectionCode.slice(0, 1),
            number: parseInt(courseSectionCode.slice(1)),
            roomTime: roomTimes,
          } as QueryDeepPartialEntity<Section>);
        }
      );
    }

    console.log("inserting sections...");
    const sectionInsertResult = await queryRunner.manager
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
    console.log(`courses inserted: ${courseInsertResult.identifiers.length}`);
    console.log(`sections inserted: ${sectionInsertResult.identifiers.length}`);
    const endhrTime = process.hrtime();
    const endTime = endhrTime[0] * 1000 + endhrTime[1] / 1000000;
    console.log(
      `Ingestion took ${Math.round((endTime - startTime) * 1000) / 1000}ms`
    );
  } catch (err) {
    // since we have errors let's rollback changes we made
    await queryRunner.rollbackTransaction();
    console.log(`error! err: ${err}`);
  }
};
