import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';

import { headers, parse, type GitHub } from '../github.ts';

const uploads = 'https://uploads.github.com/user-attachments/assets';

const contentTypes: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

export function contentType(file: string): string {
  const type = contentTypes[extname(file).toLowerCase()];
  if (type === undefined) {
    throw new Error(
      `Cannot attach ${file}; use one of ${Object.keys(contentTypes).join(', ')}.`,
    );
  }
  return type;
}

export async function uploadFiles(
  github: GitHub,
  token: string,
  files: readonly string[],
): Promise<Map<string, string>> {
  const { id } = await github('GET', '');
  const urls = new Map<string, string>();
  for (const file of files) {
    const query = new URLSearchParams({
      name: basename(file),
      content_type: contentType(file),
      repository_id: String(id),
    });
    const response = await fetch(`${uploads}?${query}`, {
      method: 'POST',
      headers: {
        ...headers(token),
        'content-type': 'application/octet-stream',
      },
      body: readFileSync(file),
    });
    const asset = await parse(response, `Uploading ${file}`);
    urls.set(file, asset.url);
  }
  return urls;
}
