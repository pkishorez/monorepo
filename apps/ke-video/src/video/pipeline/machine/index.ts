/*
 * What a run asks of this computer: the programs it starts (yt-dlp, ffmpeg,
 * ffprobe) and how their output is read, the files it writes whole or not
 * at all, and the two models it talks to, Claude and the speech model,
 * each behind a small service a test can replace.
 */
export {
  exists,
  folder,
  move,
  readBytes,
  readJson,
  readText,
  remove,
  write,
  writeJson,
} from './disk.ts';
export {
  encoder,
  encoderArgs,
  probe,
  progressTime,
  selectFilter,
  silenceReader,
  type Encoder,
  type Probe,
} from './ffmpeg.ts';
export {
  claude,
  Claude,
  Ears,
  ears,
  type Heard,
  type Listener,
} from './models.ts';
export { capture, Failed, lines, pipe, type Ended } from './process.ts';
export {
  downloadArgs,
  downloaded,
  downloadLine,
  downloadProgress,
  infoArgs,
  readInfo,
  youtubeFailure,
  type Info,
} from './youtube.ts';
