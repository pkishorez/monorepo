// Tools draw a Change set with these shared markers and one comparison menu.
export {
  ChangeBadge,
  ChangesMenu,
  changeSurfaceClass,
  defaultGitOptions,
  uncommittedBaseRef,
} from './git-changes';
export type { GitOptions } from './git-changes';
// Tools map changed files onto whatever owns them: Modules, Layers, Packages.
export { changedPathsUnder, rollUpChanges } from './git-changes';
