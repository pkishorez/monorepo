/*
 * What the files Plugin shows, by a file's extension alone: its kind, and
 * the MIME type it is sent with, which the browser is told not to second
 * guess. Anything else is Unsupported. Markdown and HTML can hold secrets
 * in plain text, and are shown by choice; another plain-text kind, such as
 * `.txt` or `.json`, widens that, so it is weighed the same way or comes
 * with a list of refused folders (ADR 0009).
 */

/** Every kind of file the Plugin shows. */
export const FILE_KINDS = [
  'image',
  'video',
  'audio',
  'pdf',
  'html',
  'markdown',
] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** A kind of file, and the MIME type it is sent with. */
export interface FileType {
  readonly kind: FileKind;
  readonly mime: string;
}

const image = (mime: string): FileType => ({ kind: 'image', mime });
const video = (mime: string): FileType => ({ kind: 'video', mime });
const audio = (mime: string): FileType => ({ kind: 'audio', mime });
const html: FileType = { kind: 'html', mime: 'text/html; charset=utf-8' };
const markdown: FileType = {
  kind: 'markdown',
  mime: 'text/markdown; charset=utf-8',
};

/** Each extension the Plugin shows, lowercase without its dot, and its type. */
export const FILE_TYPES: Readonly<Record<string, FileType>> = Object.freeze({
  png: image('image/png'),
  jpg: image('image/jpeg'),
  jpeg: image('image/jpeg'),
  gif: image('image/gif'),
  webp: image('image/webp'),
  avif: image('image/avif'),
  svg: image('image/svg+xml'),
  mp4: video('video/mp4'),
  webm: video('video/webm'),
  mov: video('video/quicktime'),
  mp3: audio('audio/mpeg'),
  wav: audio('audio/wav'),
  m4a: audio('audio/mp4'),
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  html,
  htm: html,
  md: markdown,
  markdown,
});

/** Every extension the Plugin shows, lowercase without its dot: `png`, `jpg`, …, `md`, `markdown`. */
export const FILE_EXTENSIONS: ReadonlyArray<string> = Object.freeze(
  Object.keys(FILE_TYPES),
);

/**
 * The extension of a file's name or path, lowercase without its dot: what
 * follows the last `.` of its last segment; empty when there is none, as
 * for `Makefile` or `.env`.
 */
export const extensionOf = (name: string): string => {
  const base = name.slice(name.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
};

/** The type of a file by its name or path; null when the Plugin does not show it. */
export const fileTypeOf = (name: string): FileType | null => {
  const extension = extensionOf(name);
  return Object.hasOwn(FILE_TYPES, extension) ? FILE_TYPES[extension]! : null;
};
