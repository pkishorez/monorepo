import { Stream } from 'effect';
import type { SingleItemStrategy } from '../index.js';
import { toEntity } from '../../../domain/collection-item/index.js';
import { noStrategyState } from '../../state/index.js';
import {
  openSingleItemSource,
  singleItemSources,
  type SingleItemSourceBuilder,
} from '../source/index.js';

export type SingleItemSourceConfig<TItem, R = never> = {
  source: SingleItemSourceBuilder<TItem, R>;
};

export const singleItemSourceStrategy = <TItem extends object, R = never>(
  config: SingleItemSourceConfig<TItem, R>,
): SingleItemStrategy<TItem, null, R> => {
  const source = config.source(singleItemSources);
  return {
    name: source._tag === 'SingleItemPoll' ? 'poll' : source._tag.toLowerCase(),
    state: noStrategyState(),
    run: (ctx) =>
      openSingleItemSource(source).pipe(
        Stream.runForEach((entity) =>
          ctx.applyToSyncReplica([toEntity(entity)]),
        ),
      ),
  };
};
