/*
 * `@kestack/web-platform/pwa/fake`: the New build fake, the builds a
 * deploy puts out as one page's PWA sees them, for a FakeWorld. Its state
 * is whether a newer build is out; its control puts one out. Its Layer
 * gives std-toolkit's `OnOutdated`, in place of `updateToNewest`: asked
 * once per page load, it waits for a newer build, says so on the page and
 * reloads into it.
 */

export { newBuild } from './new-build.ts';
export type { NewBuildState } from './new-build.ts';
