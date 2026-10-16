import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { BASE, router } from '../../routes/index.ts';
import { Button, Case, Page, Running, chip } from '../../parts/index.ts';
import { DashboardLive } from './dashboard.ts';

export const DashboardView = View.make(
  DashboardLive,
  ({ model, send, root }) => (
    <div {...root}>
      <Page
        title="Dashboard"
        about="Every card below is one routing case. Watch the address bar above, the history beside it, and the devtools' Timeline: each move is one Message to the Router."
      >
        <Running name="live" count={model.ticks} />
        <div className="grid gap-3 @2xl:grid-cols-2">
          <Case
            title="Pages inside pages"
            tries={
              <Router.Link
                className={chip}
                to={router.Settings.Billing.Invoices()}
              >
                Settings › Billing › Invoices
              </Router.Link>
            }
          >
            Three levels deep. Each level is a page that draws the page under
            it; moving between siblings keeps their parent, and its Worker,
            running.
          </Case>
          <Case
            title="A dialog with its own URL"
            tries={
              <Router.Link
                className={chip}
                to={router.Projects.Project.Share({ id: 2 })}
              >
                Share Harbor
              </Router.Link>
            }
          >
            A page under the project, so it opens over it, and the project keeps
            running. Close it and Back does not bring it back.
          </Case>
          <Case
            title="State in the query"
            tries={
              <Router.Link className={chip} to={router.Projects({ q: 'har' })}>
                Projects matching “har”
              </Router.Link>
            }
          >
            The search is in the URL as ?q=. Typing replaces the entry, so Back
            skips keystrokes.
          </Case>
          <Case
            title="Moving from an Update"
            tries={
              <Button onClick={() => send({ _tag: 'SurpriseClicked' })}>
                Open a project
              </Button>
            }
          >
            The click is a Message to this page; its Update returns Router.push
            as a Command, which is one Message to the Router.
          </Case>
          <Case
            title="Old addresses and wrong ones"
            tries={
              <>
                <a className={chip} href={`${BASE}/account`}>
                  /account
                </a>
                <a className={chip} href={`${BASE}/projects/01/`}>
                  /projects/01/
                </a>
                <a className={chip} href={`${BASE}/projects/abc`}>
                  /projects/abc
                </a>
                <a className={chip} href={`${BASE}/nowhere`}>
                  /nowhere
                </a>
              </>
            }
          >
            /account is replaced by /settings, and /projects/01/ by /projects/1:
            the address always shows the one way a place is written. The last
            two name no place.
          </Case>
          <Case
            title="Leaving the app"
            tries={
              <>
                <a className={chip} href="/">
                  The docs home
                </a>
                <a
                  className={chip}
                  href="https://effect.website"
                  target="_blank"
                  rel="noreferrer"
                >
                  Another site
                </a>
              </>
            }
          >
            A link outside the app's base. On TanStack it is handed back to
            TanStack, with no reload; in memory, the browser goes there. A new
            tab, a Cmd-click or another site is always the browser's.
          </Case>
        </div>
      </Page>
    </div>
  ),
);
