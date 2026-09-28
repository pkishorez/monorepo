import { createRoot } from 'react-dom/client';
import '@kstackz/ui-toolkit/styles/global.css';
import '@kstackz/ui-toolkit/styles/font-inter.css';
import { Playground } from './playground.tsx';

createRoot(document.getElementById('root')!).render(<Playground />);
