import { View } from '../../../../react/index.ts';
import { Lab } from './routes.ts';

export default View.make(Lab.actor, () => <p>the lab, loaded lazily</p>);
