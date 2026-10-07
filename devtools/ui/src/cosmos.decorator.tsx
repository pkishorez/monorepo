import { createTheme } from '@kstackz/web-toolkit/theme';
import type { ReactNode } from 'react';
import './cosmos.css';

const themeController = createTheme();

export default function CosmosDecorator({ children }: { children: ReactNode }) {
  themeController.useTheme();
  return (
    <div className="bg-background text-foreground min-h-svh">{children}</div>
  );
}
