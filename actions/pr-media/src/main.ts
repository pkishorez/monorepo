import { flag, input, run, setOutputs } from './action.ts';
import { prMedia } from './pr-media.ts';

run(async () => {
  const markdown = await prMedia({
    markdown: input('markdown'),
    files: input('files')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    id: input('id') || process.env.GITHUB_JOB || 'pr-media',
    create: flag('create'),
    token: input('token'),
  });
  setOutputs({ markdown });
});
