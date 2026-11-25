/*
 * The pipeline: the eight steps that turn a YouTube link into a short video,
 * its transcripts and its summary, one step per call. info, download, audio
 * and transcribe bring the video in and hear it (source.ts); clean-up asks
 * Claude what to cut and plans what stays (clean-up.ts); render,
 * transcripts and summary make what the Video ends with (output.ts). The
 * arithmetic lives in edit/, the words in text/, and what runs on this
 * computer in machine/.
 */
export { StepFailed, type Job } from './job.ts';
export {
  requirements,
  run,
  services,
  type PipelineServices,
  type Requirement,
} from './run.ts';
