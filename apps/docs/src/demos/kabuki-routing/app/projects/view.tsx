import { Route } from '@kestack/kabuki/routing';
import { List } from './list/index.ts';
import { ProjectView } from './project/index.ts';
import { Projects } from './projects.ts';

export const ProjectsView = Route.view(Projects, (self) => (
  <div {...self.root}>
    {self.children.list && <List.view instance={self.children.list} />}
    {self.children.Project && <ProjectView instance={self.children.Project} />}
  </div>
));
