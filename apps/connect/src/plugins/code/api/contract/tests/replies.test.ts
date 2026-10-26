import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ProjectSchema } from '../../../records/index.js';
import { ProjectValue } from '../projects.js';

/* A reply reads across Connects: an older one's in a new App, a new one's in an older App. */

const v1 = { id: 'p1', path: '/x', name: 'x', createdAt: 1 };

describe('a Project in a reply', () => {
  it("reads an older Connect's, with no version, as its folder present", async () => {
    const project = await Effect.runPromise(
      Schema.decodeUnknownEffect(ProjectValue)(v1),
    );
    expect(project).toEqual({ ...v1, folder: 'present' });
  });

  it('is read by an older App, which knows only the fields it had', async () => {
    const sent = await Effect.runPromise(
      Schema.encodeEffect(ProjectValue)({ ...v1, folder: 'missing' }),
    );
    const older = Schema.Struct({
      id: Schema.String,
      path: Schema.String,
      name: Schema.String,
      createdAt: Schema.Finite,
    });
    expect(
      await Effect.runPromise(Schema.decodeUnknownEffect(older)(sent)),
    ).toEqual(v1);
    expect(
      await Effect.runPromise(
        Schema.decodeUnknownEffect(Schema.Struct(ProjectSchema.fields))(sent),
      ),
    ).toEqual({ ...v1, folder: 'missing' });
  });
});
