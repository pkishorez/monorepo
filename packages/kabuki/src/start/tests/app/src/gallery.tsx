import { View } from '../../../../react/index.ts';
import { GalleryLive } from './routes.ts';
import './gallery.css';

export default View.make(GalleryLive, () => (
  <p className="gallery">the gallery, loaded lazily</p>
));
