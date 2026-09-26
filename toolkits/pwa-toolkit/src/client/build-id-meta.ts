import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { BUILD_ID_META_NAME, BuildId } from '../domain/build/index.js';

const decode = Schema.decodeUnknownOption(BuildId);

/** The Build ID `pwaHead()` rendered into the page. */
export const readBuildIdMeta = (): Option.Option<BuildId> =>
  typeof document === 'undefined'
    ? Option.none()
    : decode(
        document
          .querySelector(`meta[name="${BUILD_ID_META_NAME}"]`)
          ?.getAttribute('content'),
      );
