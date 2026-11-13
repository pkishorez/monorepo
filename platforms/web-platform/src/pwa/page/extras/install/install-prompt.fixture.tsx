import { useEffect } from 'react';
import { InstallPrompt } from './install-prompt.js';

/** The Install Prompt as Chromium offers it: the browser's event, faked. */
export default function InstallPromptFixture() {
  useEffect(() => {
    localStorage.clear();
    const offer = Object.assign(new Event('beforeinstallprompt'), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });
    const timer = setTimeout(() => window.dispatchEvent(offer), 300);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="p-6">
      <p>The page under the Install Prompt.</p>
      <InstallPrompt title="Install Code" />
    </div>
  );
}
