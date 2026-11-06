import { View } from '@kestack/kabuki/react';
import { Pages } from '../../../shared/index.ts';
import { Landing } from './landing/index.ts';

/** dune's place on the site: one landing page, full screen and dark. */
export const DuneView = View.make(Pages.DuneLive, () => <Landing />);
