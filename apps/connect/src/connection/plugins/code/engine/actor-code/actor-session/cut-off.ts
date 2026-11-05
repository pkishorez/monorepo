import type { BackgroundJob, CutOff } from '@kestack/ai-toolkit/contract';

/*
 * What a stop cut off, told to the agent in plain words: a Turn the server
 * stopping cut short, and the Background Jobs that died with the Agent. A
 * Resumed Turn sends it as its whole prompt; a user's message after the
 * Agent closed carries it before their words.
 */

/** The cut-off jobs, as a Turn keeps them. */
export const cutOffJobs = (
  jobs: ReadonlyArray<BackgroundJob>,
): CutOff['jobs'] => jobs.map(({ kind, title }) => ({ kind, title }));

const listed = (titles: ReadonlyArray<string>) =>
  titles.map((title) => `  - ${title}`).join('\n');

/** What a stop cut off, as lines for the agent; empty for nothing. */
const lines = ({ turn, jobs }: CutOff): ReadonlyArray<string> => {
  const agents = jobs.filter((job) => job.kind === 'agent');
  const shells = jobs.filter((job) => job.kind === 'shell');
  return [
    ...(turn
      ? ['- Your last turn was cut off, possibly in the middle of a tool call.']
      : []),
    ...(agents.length === 0
      ? []
      : [
          `- These background subagents were stopped before they finished:\n${listed(agents.map((job) => job.title))}`,
        ]),
    ...(shells.length === 0
      ? []
      : [
          `- These background commands were stopped:\n${listed(shells.map((job) => job.title))}`,
        ]),
  ];
};

/** The prompt a Resumed Turn sends: what was cut off, and what to do. */
export const resumePrompt = (cutOff: CutOff): string =>
  [
    'Connect restarted and stopped everything this session had running:',
    ...lines(cutOff),
    '',
    'None of it is running now. Check what each one changed before you repeat it, start again the ones still needed, then continue.',
  ].join('\n');

/** The note before a user's words when the Agent closed with jobs running. */
export const cutOffNote = (cutOff: CutOff): string =>
  [
    'Before this message, the agent process restarted and stopped your background work:',
    ...lines(cutOff),
    'None of it is running now; start again what is still needed.',
  ].join('\n');
