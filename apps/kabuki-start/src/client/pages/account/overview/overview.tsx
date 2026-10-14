import { PageFrame } from '../../../components/index.ts';

/** The account's overview: no Input of its own, drawn from the account's. */
export const Overview = () => (
  <PageFrame
    place="Account.Overview"
    title="Overview"
    intro="A place with no Input under a dynamic one: drawn for this request, from the account's Input alone."
  />
);
