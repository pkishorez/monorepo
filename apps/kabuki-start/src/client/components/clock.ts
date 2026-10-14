/** A time of day as the server and the browser both write it, in UTC, to the millisecond. */
export const clock = (at: number) =>
  `${new Date(at).toISOString().slice(11, 23)} UTC`;
