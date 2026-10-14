import { View } from '../../index.ts';
import { Ticker } from './ticker.ts';

/** A lazy View's module: the View made with `View.make`, as its default export. */
export default View.make(Ticker, (self) => (
  <output data-ticker>{self.model.count}</output>
));
