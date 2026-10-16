import { View } from '@kestack/kabuki/react';
import { ListView } from './list/index.ts';
import { ProjectView } from './project/index.ts';
import { ProjectsLive } from './projects.ts';

export const ProjectsView = View.make(ProjectsLive, (self) => (
  <div {...self.root}>
    {self.children.list && <ListView instance={self.children.list} />}
    {self.children.Project && <ProjectView instance={self.children.Project} />}
  </div>
));
