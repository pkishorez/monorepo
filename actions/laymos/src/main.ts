import {
  choice,
  flag,
  input,
  run,
  setOutputs,
} from '../../pr-media/src/action.ts';
import { pullRequest } from '../../pr-media/src/github.ts';
import {
  checkOptions,
  prMedia,
  type MediaOptions,
} from '../../pr-media/src/pr-media.ts';
import { buildComment, placeholder } from './comment.ts';
import { draw } from './draw.ts';

run(async () => {
  process.chdir(input('working-directory') || '.');
  const media: MediaOptions = {
    markdown: '',
    files: [],
    id: input('id'),
    create: true,
    token: input('token'),
  };
  checkOptions(media);
  // Posting first puts the comment near the top of the conversation.
  if (pullRequest().action === 'opened') {
    await prMedia({ ...media, markdown: placeholder });
  }

  const drawing = draw({
    base: input('base'),
    theme: choice('theme', ['both', 'dark', 'light']),
    onlyChanged: flag('only-changed'),
    includeUnchanged: flag('include-unchanged'),
    devtoolsVersion: input('devtools-version'),
    devtoolsBin: input('devtools-bin'),
    browser: input('browser'),
  });
  const comment = buildComment(drawing.entries, drawing.base);
  setOutputs({ markdown: await prMedia({ ...media, ...comment }) });
  if (drawing.failed) {
    throw new Error('devtools snapshot failed; see the log above.');
  }
});
