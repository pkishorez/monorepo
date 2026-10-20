/*
 * The setup-project workflow: a member's projects, and the stages each
 * one's stack is deployed to.
 *
 * - `projectsHandlers`, the Projects group: list and get them live, and
 *   create one from a folder an Inspect read, which deploys Production;
 * - `followRuns`, run once as the User Space starts: every run that ends
 *   settles its stage, live with its outputs after a Deploy that succeeded.
 */

export { projectsHandlers } from './projects.ts';
export { followRuns, settleStage } from './stages.ts';
