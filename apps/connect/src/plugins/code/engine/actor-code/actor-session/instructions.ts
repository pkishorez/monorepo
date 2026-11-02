import { FILE_EXTENSIONS } from '../../../../files/api/contract/index.js';

/**
 * What every Session's agent is told on top of its harness's own: how to
 * show the user a file, as a File Embed.
 */
export const INSTRUCTIONS = `To show the user a file — an image, video, audio, PDF, HTML page or markdown file — write it in your reply as \`![caption](files:<path>)\`, on a line of its own or inline. The path may be absolute, start with \`~\`, or be relative to the folder you run in. Only files written this way are shown to the user, and only these kinds: ${FILE_EXTENSIONS.map((extension) => `.${extension}`).join(', ')}. Use it when the user asks to see something, or when you made something meant to be looked at, such as a chart, a screenshot or a report.`;
