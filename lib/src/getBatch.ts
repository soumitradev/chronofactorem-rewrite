// batch is set to 0000 if it's a non-student email, like hpc@hyderabad.bits-pilani.ac.in
// or undefined
export const getBatchFromEmail = (email: undefined | string) =>
  email?.match(/^f\d{8}@hyderabad\.bits-pilani\.ac\.in$/)
    ? email.slice(1, 5)
    : "0000";
