import { AppDataSource, initializeDataSource } from "./db.js";
import { ingestJSON } from "./ingestJSON.js";
import timetableJSON from "./timetable.json" with { type: "json" };

initializeDataSource()
  .then(async () => {
    console.log("connected to db!");
    await ingestJSON(timetableJSON, process.argv[2] === "--overwrite");
    await AppDataSource.destroy();
  })
  .catch(async (error) => {
    console.log(error);
    process.exitCode = 1;
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });
