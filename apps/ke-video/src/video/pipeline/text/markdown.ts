import type { Line, Summary } from '../../library/index.ts';
import { clock } from './format.ts';

/** A transcript as Markdown: a title, a note on its times, then each line with its time. */
export const transcriptMarkdown = (
  title: string,
  note: string,
  lines: ReadonlyArray<Line>,
): string =>
  [
    `# ${title}`,
    '',
    note,
    '',
    ...lines.map((line) => `**${clock(line.start)}** ${line.text}\n`),
  ].join('\n');

/** A summary as Markdown: the overview, the key points and the chapters, at times of the short video. */
export const summaryMarkdown = (title: string, summary: Summary): string =>
  [
    `# ${title}`,
    '',
    summary.overview,
    '',
    '## Key points',
    '',
    ...summary.points.map((point) => `- **${clock(point.at)}** ${point.text}`),
    '',
    '## Chapters',
    '',
    ...summary.chapters.map(
      (chapter) => `- **${clock(chapter.at)}** ${chapter.title}`,
    ),
    '',
  ].join('\n');
