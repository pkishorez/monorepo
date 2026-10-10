import { createRoot } from 'react-dom/client';
import '@kstackz/web-platform/theme/global.css';
import '@kstackz/web-platform/theme/font-inter.css';
import { Playground } from './playground.tsx';

createRoot(document.getElementById('root')!).render(<Playground />);
