import { AnimatePresence, motion } from 'motion/react';
import { View } from '@kestack/kabuki/react';
import { Project } from './project/index.ts';
import { ProjectsActor, pages } from './projects.ts';

const EASE = [0.32, 0.72, 0, 1] as const;

export const ProjectsView = View.make(ProjectsActor, (self) => {
  const open = self.children.open[0];
  return (
    <div {...self.root}>
      {open && <Project.view key={open.id} instance={open} />}
      <pages.View of={self}>
        {(page) => (
          <>
            {page?.tag === 'List' && page.element}
            <AnimatePresence>
              {page?.tag === 'Share' && (
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
                    {page.element}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </pages.View>
    </div>
  );
});
