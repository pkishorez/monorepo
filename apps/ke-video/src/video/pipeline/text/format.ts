const two = (n: number) => String(n).padStart(2, '0');

const parts = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return {
    hours: Math.floor(whole / 3600),
    minutes: Math.floor((whole % 3600) / 60),
    seconds: whole % 60,
  };
};

/** A moment as HH:MM:SS: `00:12:01`. */
export const stamp = (time: number): string => {
  const { hours, minutes, seconds } = parts(time);
  return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
};

/** A moment as H:MM:SS: `0:12:01`. */
export const clock = (time: number): string => {
  const { hours, minutes, seconds } = parts(time);
  return `${hours}:${two(minutes)}:${two(seconds)}`;
};

/** A video's length: `3:12:40`, or `4:05` under an hour. */
export const length = (time: number): string => {
  const { hours, minutes, seconds } = parts(time);
  return hours > 0
    ? `${hours}:${two(minutes)}:${two(seconds)}`
    : `${minutes}:${two(seconds)}`;
};

/** How long something took or how much was removed: `12s`, `3m 05s`, `1h 02m`. */
export const took = (time: number): string => {
  const { hours, minutes, seconds } = parts(time);
  if (hours > 0) return `${hours}h ${two(minutes)}m`;
  if (minutes > 0) return `${minutes}m ${two(seconds)}s`;
  return `${seconds}s`;
};

/** A count with thousands marked: `31,402`. */
export const count = (n: number): string => n.toLocaleString('en-US');

/** A file size: `2.1 GB`, `480 MB`. */
export const size = (bytes: number): string =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

/** `text` cut to about `most` characters at a word, ending in … when cut. */
export const shorten = (text: string, most = 100): string => {
  if (text.length <= most) return text;
  const cut = text.slice(0, most);
  const space = cut.lastIndexOf(' ');
  return `${(space > most / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};
