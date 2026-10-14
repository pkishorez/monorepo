import { View } from '../../../../react/index.ts';
import { GalleryActor } from './app.tsx';
import './gallery.css';

export default View.make(GalleryActor, () => (
  <p className="gallery">the gallery, loaded lazily</p>
));
