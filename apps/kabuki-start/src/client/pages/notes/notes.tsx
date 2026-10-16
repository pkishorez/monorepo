import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import { Textarea } from '@kestack/web-platform/components/textarea';
import { Pages } from '../../../shared/index.ts';
import { Loaded, PlaceFrame } from '../../components/index.ts';

/*
 * Notes with a draft. Editing copies the data into the page's Model; Reload
 * is a Command from an Update, the same one a save would end with. The data
 * loads again behind what is shown, and the page, its State and its draft
 * stay.
 */

export const NotesView = View.make(Pages.NotesLive, (self) => {
  const { status } = self.props;
  return (
    <PlaceFrame
      place="Notes"
      status={status}
      title={
        status._tag === 'Ready'
          ? `Notes, version ${status.data.version}`
          : 'Notes'
      }
      intro="Start editing, then Reload: the version goes up, and your draft is still here. Nothing about the page was made again."
      aside={
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => self.send({ _tag: 'ReloadClicked' })}
          >
            Reload
          </Button>
          {self._tag === 'Reading' ? (
            <Button
              size="sm"
              onClick={() => self.send({ _tag: 'EditClicked' })}
            >
              Edit
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => self.send({ _tag: 'CancelClicked' })}
            >
              Stop editing
            </Button>
          )}
        </div>
      }
    >
      <Loaded status={status} label="Loading the notes… (0.8 s)">
        {(notes) =>
          self._tag === 'Editing' ? (
            <Textarea
              aria-label="Draft"
              className="max-w-2xl text-base sm:text-sm"
              rows={5}
              value={self.model.draft}
              onChange={(event) =>
                self.send({ _tag: 'Typed', text: event.target.value })
              }
            />
          ) : (
            <p className="max-w-prose">{notes.text}</p>
          )
        }
      </Loaded>
    </PlaceFrame>
  );
});
