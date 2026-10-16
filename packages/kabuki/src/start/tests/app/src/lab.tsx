import { View } from '../../../../react/index.ts';
import { LabLive } from './routes.ts';

export default View.make(LabLive, () => <p>the lab, loaded lazily</p>);
