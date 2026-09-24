import type { GitHub } from '../github.ts';

export function linkFiles(
  markdown: string,
  urls: ReadonlyMap<string, string>,
): string {
  const longestFirst = [...urls].sort(([a], [b]) => b.length - a.length);
  return longestFirst.reduce(
    (text, [file, url]) => text.replaceAll(file, url),
    markdown,
  );
}

export async function upsertComment(
  github: GitHub,
  pr: number,
  id: string,
  markdown: string,
  create: boolean,
): Promise<boolean> {
  const marker = `<!-- pr-media:${id} -->`;
  const body = `${marker}\n${markdown}`;
  const comment = await findComment(github, pr, marker);
  if (comment !== undefined) {
    await github('PATCH', `/issues/comments/${comment.id}`, { body });
    return true;
  }
  if (!create) return false;
  await github('POST', `/issues/${pr}/comments`, { body });
  return true;
}

async function findComment(github: GitHub, pr: number, marker: string) {
  for (let page = 1; ; page++) {
    const comments: { id: number; body?: string }[] = await github(
      'GET',
      `/issues/${pr}/comments?per_page=100&page=${page}`,
    );
    const found = comments.find((comment) => comment.body?.includes(marker));
    if (found !== undefined || comments.length < 100) return found;
  }
}
