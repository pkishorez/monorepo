import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

const contentTypes: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

/**
 * Serves one Evidence file of one Proof run:
 * `/story-evidence?project=<abs project path>&proof=<Proof id>&file=<relative file>`.
 * Anything that resolves outside `<project>/.laymos/stories/<Proof id>/` is refused.
 */
export const StoryEvidenceLive = HttpRouter.add(
  'GET',
  '/story-evidence',
  HttpServerRequest.HttpServerRequest.use((request) =>
    Effect.gen(function* () {
      const query = new URL(request.url, 'http://devtools').searchParams;
      const file = yield* Effect.promise(() =>
        evidenceFile(
          query.get('project'),
          query.get('proof'),
          query.get('file'),
        ),
      );
      if (file === null) return HttpServerResponse.empty({ status: 404 });
      return yield* HttpServerResponse.file(file, {
        headers: { 'cache-control': 'no-cache' },
        contentType:
          contentTypes[path.extname(file)] ?? 'application/octet-stream',
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(HttpServerResponse.empty({ status: 404 })),
      ),
    ),
  ),
);

async function evidenceFile(
  project: string | null,
  proof: string | null,
  file: string | null,
): Promise<string | null> {
  if (project === null || proof === null || file === null) return null;
  if (!path.isAbsolute(project)) return null;
  const stories = path.resolve(project, '.laymos', 'stories');
  const folder = path.resolve(stories, proof);
  const target = path.resolve(folder, file);
  if (!within(stories, folder) || !within(folder, target)) return null;
  // A symlink inside the folder must not lead out of it either.
  const [realFolder, realTarget] = await Promise.all([
    realpath(folder),
    realpath(target),
  ]).catch(() => [null, null] as const);
  if (realFolder === null || realTarget === null) return null;
  return within(realFolder, realTarget) ? realTarget : null;
}

function within(parent: string, child: string): boolean {
  return child.startsWith(`${parent}${path.sep}`);
}
