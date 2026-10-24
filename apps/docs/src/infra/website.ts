import { Site } from '@kestack/web-platform/app/alchemy';

/*
 * The site, as the Web Platform deploys a Kabuki Start app, at
 * `docs.kishore.app`. Its resource keeps the id `Worker` it was first
 * deployed with, since a new id would replace the Worker.
 */
export const Website = Site({
  id: 'Worker',
  host: 'docs',
  zone: 'kishore.app',
});
