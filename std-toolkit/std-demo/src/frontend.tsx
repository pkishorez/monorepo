import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './frontend/app.tsx';
import { ClientOnly } from './components/client-only.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div>
      <ClientOnly>{() => <App />}</ClientOnly>
    </div>
  </StrictMode>,
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((import.meta as any).hot) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).hot.accept();
}
