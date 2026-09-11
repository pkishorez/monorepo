import { Stream } from 'effect';
import * as destruction from '../../../services/stage-destruction/stage-destruction/index.ts';

export const preview = (target: Parameters<typeof destruction.preview>[0]) =>
  destruction
    .preview(target)
    .pipe(Stream.withSpan('StageDeletionPreview.preview'));
