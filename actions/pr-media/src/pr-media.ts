import { existsSync } from 'node:fs';

import { gitHub, pullRequest } from './github.ts';
import { linkFiles, upsertComment } from './steps/comment.ts';
import { contentType, uploadFiles } from './steps/upload.ts';

export interface MediaOptions {
  readonly markdown: string;
  readonly files: readonly string[];
  readonly id: string;
  readonly create: boolean;
  readonly token: string;
}

export function checkOptions(options: MediaOptions) {
  if (options.token === '') {
    throw new Error(
      'token is required: a personal access token with write access to this repository.',
    );
  }
  if (!/^[A-Za-z0-9._-]+$/.test(options.id)) {
    throw new Error(
      `id may hold only letters, digits, '.', '_' and '-'; got '${options.id}'.`,
    );
  }
  for (const file of options.files) {
    if (!existsSync(file)) throw new Error(`File not found: ${file}`);
    contentType(file);
  }
}

export async function prMedia(options: MediaOptions): Promise<string> {
  checkOptions(options);
  const pr = pullRequest();
  const github = gitHub(options.token);

  const urls = await uploadFiles(github, options.token, options.files);
  const markdown = linkFiles(options.markdown, urls);
  const written = await upsertComment(
    github,
    pr.number,
    options.id,
    markdown,
    options.create,
  );
  console.log(
    written
      ? `Updated the ${options.id} comment.`
      : `No ${options.id} comment yet; left it out.`,
  );
  return markdown;
}
