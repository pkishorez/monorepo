import { AnimatePresence, motion } from 'motion/react';
import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { PROJECTS, router } from '../../../routes/index.ts';
import { Case, Page, Running, chip } from '../../../parts/index.ts';
import { ShareView } from './share/index.ts';
import { ProjectLive } from './project.ts';

const EASE = [0.32, 0.72, 0, 1] as const;

export const ProjectView = View.make(ProjectLive, (self) => {
  const { id } = self.props.params;
  const project = PROJECTS.find((each) => each.id === id);
  if (!project)
    return (
      <div {...self.root}>
        <Page
          title={`No project ${id}`}
          about="The URL is a real place; the data behind it is what is missing. That is the page's to say, not the router's."
        >
          <Router.Link className={chip} to={router.Projects()}>
            All projects
          </Router.Link>
        </Page>
      </div>
    );
  const share = self.children.Share;
  return (
    <div {...self.root}>
      <Page
        title={project.name}
        about={`Project ${id}. The tab's title is its name, which the router work out from the URL.`}
      >
        <Running name="presence" count={self.model.seen} />
        <div className="flex flex-wrap gap-2">
          <Router.Link
            className={chip}
            to={router.Projects.Project.Share({ id })}
          >
            Share…
          </Router.Link>
          {id > 1 && (
            <Router.Link
              className={chip}
              to={router.Projects.Project({ id: id - 1 })}
            >
              ← Project {id - 1}
            </Router.Link>
          )}
          <Router.Link
            className={chip}
            to={router.Projects.Project({ id: id + 1 })}
          >
            Project {id + 1} →
          </Router.Link>
          <Router.Link className={chip} to={router.Projects()}>
            All projects
          </Router.Link>
        </div>
        <Case title="A new param is a fresh page">
          Go to the next project: this page's Actor stops and a new one starts,
          so presence counts from zero. Project {PROJECTS.length + 1} has no
          data: a real place, with nothing behind it.
        </Case>
      </Page>
      <AnimatePresence>
        {share && (
          <motion.div
            key="share"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute inset-0 z-20 grid place-items-center bg-background/50 p-6 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 4 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="flex w-full justify-center"
            >
              <ShareView instance={share} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
