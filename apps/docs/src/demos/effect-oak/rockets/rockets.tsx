import type { ReactNode } from 'react';
import { Shell } from '../shell/index.js';
import { CHAPTERS } from './chapters.js';
import type { Chapter } from './chapters.js';
import { Look } from './look/index.js';
import type { LookName } from './look/index.js';
import { Picker } from './picker.js';

/** What the page shows, as the URL says it: `?chapter=1..7&look=…&chrome=0`. */
export type RocketsSearch = {
  readonly chapter: Chapter;
  readonly look: LookName;
  /** `0` leaves only the app and its devtools, for recording. */
  readonly chrome?: 0;
};

/*
 * Rockets, one chapter at a time: the chapter's app in its Look, beside its
 * devtools. Changing the Look redraws the same running app; changing the
 * chapter shows another app, with its own Log.
 */
export const Rockets = ({
  search: { chapter, look, chrome },
  menu,
  onChange,
}: {
  readonly search: RocketsSearch;
  readonly menu: ReactNode;
  readonly onChange: (next: Partial<RocketsSearch>) => void;
}) => (
  <div
    data-theme={look === 'exotic' ? 'dark' : undefined}
    className={look === 'exotic' ? 'dark contents' : 'contents'}
  >
    <Look name={look}>
      <Shell
        key={chapter}
        app={CHAPTERS[chapter - 1].App}
        menu={
          chrome !== 0 && (
            <>
              {menu}
              <Picker
                chapter={chapter}
                look={look}
                onChapter={(next) => onChange({ chapter: next })}
                onLook={(next) => onChange({ look: next })}
              />
            </>
          )
        }
      />
    </Look>
  </div>
);
