import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { PROJECTS, router } from '../../../routes/index.ts';
import { Card, Case, Page } from '../../../parts/index.ts';
import { ListLive } from './list.ts';

export const ListView = View.make(ListLive, ({ model, props, send, root }) => {
  const q = (props.q ?? '').toLowerCase();
  const found = PROJECTS.filter((project) =>
    project.name.toLowerCase().includes(q),
  );
  return (
    <div {...root}>
      <Page title="Projects">
        <input
          value={model.draft}
          onChange={(event) => send({ _tag: 'Typed', q: event.target.value })}
          placeholder="Search projects"
          className="h-9 max-w-sm rounded-lg border border-border bg-background px-3 text-base outline-offset-1 focus-visible:outline-2 focus-visible:outline-ring sm:text-[13px]"
        />
        <Card>
          {found.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              No project matches “{props.q}”.
            </p>
          ) : (
            <ul className="flex flex-col">
              {found.map((project) => (
                <li key={project.id}>
                  <Router.Link
                    to={router.Projects.Project({ id: project.id })}
                    className="flex h-9 items-center justify-between rounded-md px-2 text-[13px] hover:bg-muted"
                  >
                    {project.name}
                    <span className="text-xs text-muted-foreground">
                      /projects/{project.id}
                    </span>
                  </Router.Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Case title="State in the query">
          Each keystroke replaces ?q= in the same entry, so the history does not
          fill with keystrokes. The list keeps its Instance: a new query is new
          Props, not a new page.
        </Case>
      </Page>
    </div>
  );
});
