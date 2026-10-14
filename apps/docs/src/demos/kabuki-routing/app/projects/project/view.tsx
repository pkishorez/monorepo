import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { PROJECTS, Routes } from '../../../routes/index.ts';
import { Case, Page, Running, chip } from '../../../parts/index.ts';
import { ProjectActor } from './project.ts';

export const ProjectView = View.make(ProjectActor, ({ model, root }) => {
  const { id } = model;
  const project = PROJECTS.find((each) => each.id === id);
  if (!project)
    return (
      <div {...root}>
        <Page
          title={`No project ${id}`}
          about="The URL is a real place; the data behind it is what is missing. That is the page's to say, not the router's."
        >
          <Router.Link className={chip} to={Routes.Projects.List()}>
            All projects
          </Router.Link>
        </Page>
      </div>
    );
  return (
    <div {...root}>
      <Page
        title={project.name}
        about={`Project ${id}. The tab's title is its name, which the Routes work out from the URL.`}
      >
        <Running name="presence" count={model.seen} />
        <div className="flex flex-wrap gap-2">
          <Router.Link className={chip} to={Routes.Projects.Share({ id })}>
            Share…
          </Router.Link>
          {id > 1 && (
            <Router.Link
              className={chip}
              to={Routes.Projects.Project({ id: id - 1 })}
            >
              ← Project {id - 1}
            </Router.Link>
          )}
          <Router.Link
            className={chip}
            to={Routes.Projects.Project({ id: id + 1 })}
          >
            Project {id + 1} →
          </Router.Link>
          <Router.Link className={chip} to={Routes.Projects.List()}>
            All projects
          </Router.Link>
        </div>
        <Case title="A new param is a fresh page">
          Go to the next project: this page's Actor stops and a new one starts,
          so presence counts from zero. Project {PROJECTS.length + 1} has no
          data: a real place, with nothing behind it.
        </Case>
      </Page>
    </div>
  );
});
