import { View } from '../../../../react/index.ts';
import { Gallery } from './routes.ts';
import './gallery.css';

export default View.make(Gallery.actor, () => (
  <p className="gallery">the gallery, loaded lazily</p>
));
