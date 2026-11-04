/*
 * Files become Attachments: their bytes in base64, without a `data:`
 * prefix. An image an agent can see may be up to 5 MB; any other file up
 * to 50 MB. A file over its limit is refused with a sentence saying why.
 */

export interface Attachment {
  readonly name: string;
  readonly mime: string;
  /** Base64, no `data:` prefix. */
  readonly data: string;
  readonly size: number;
}

const MB = 1024 * 1024;

const seenImages = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export function isSeenImage(mime: string): boolean {
  return seenImages.has(mime);
}

export function limitOf(mime: string): number {
  return isSeenImage(mime) ? 5 * MB : 50 * MB;
}

export async function readFiles(files: ReadonlyArray<File>): Promise<{
  readonly read: ReadonlyArray<Attachment>;
  readonly refused: ReadonlyArray<string>;
}> {
  const read: Array<Attachment> = [];
  const refused: Array<string> = [];
  for (const file of files) {
    const mime = file.type === '' ? 'application/octet-stream' : file.type;
    const limit = limitOf(mime);
    if (file.size > limit) {
      const kind = isSeenImage(mime) ? 'Images' : 'Files';
      refused.push(
        `${file.name} is too large. ${kind} can be up to ${formatSize(limit)}.`,
      );
      continue;
    }
    read.push({
      name: file.name,
      mime,
      data: toBase64(new Uint8Array(await file.arrayBuffer())),
      size: file.size,
    });
  }
  return { read, refused };
}

/* In slices, so a large file never spreads into one huge argument list. */
export function toBase64(bytes: Uint8Array): string {
  const slice = 0x8000;
  let binary = '';
  for (let at = 0; at < bytes.length; at += slice)
    binary += String.fromCharCode(...bytes.subarray(at, at + slice));
  return btoa(binary);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${round(bytes / 1024)} KB`;
  return `${round(bytes / MB)} MB`;
}

const round = (value: number) =>
  value >= 10
    ? Math.round(value).toString()
    : (Math.round(value * 10) / 10).toString();
