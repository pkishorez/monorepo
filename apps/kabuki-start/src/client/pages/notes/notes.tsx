import { Route } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { Textarea } from '@kestack/web-platform/components/textarea';
import { Pages } from '../../../shared/index.ts';
import { Loaded, PageFrame, Refreshing } from '../../components/index.ts';

/*
 * Notes with a draft. Editing copies the data into the page's Model; Reload
 * is a Command from an Update, the same one a save would end with. The data
 * loads again behind what is shown, and the page, its State and its draft
 * stay.
 */

export const NotesView = Route.view(Pages.Notes, (self) => (
  <Loaded status={self.props.status} label="Loading the notes…">
    {(notes, refreshing) => (
      <PageFrame
        place="Notes"
        data={notes}
        title={`Notes, version ${notes.version}`}
        intro="Start editing, then Reload: the version goes up, and your draft is still here. Nothing about the page was made again."
        aside={<Refreshing on={refreshing} />}
      >
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
        {self._tag === 'Editing' ? (
          <Textarea
            aria-label="Draft"
            className="max-w-2xl"
            rows={4}
            value={self.model.draft}
            onChange={(event) =>
              self.send({ _tag: 'Typed', text: event.target.value })
            }
          />
        ) : (
          <p className="max-w-prose">{notes.text}</p>
        )}
      </PageFrame>
    )}
  </Loaded>
));
