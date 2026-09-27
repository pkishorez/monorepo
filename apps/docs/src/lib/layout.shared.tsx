import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { createTheme } from 'kui-toolkit/components/blocks/theme';
import { Button } from 'kui-toolkit/components/ui/button';
import { FlaskConical, Moon, Newspaper, Sun } from 'lucide-react';
import { appName } from './shared';

const cookieDomain =
  typeof location === 'undefined'
    ? undefined
    : location.hostname.endsWith('.kishore.app')
      ? 'kishore.app'
      : location.hostname.endsWith('.kishore.computer')
        ? 'kishore.computer'
        : undefined;

export const appTheme = createTheme({ cookieDomain });

export function ThemeToggle() {
  const { theme, toggleTheme } = appTheme.useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={
        theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
      }
      onClick={toggleTheme}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    slots: { themeSwitch: ThemeToggle },
    nav: {
      title: (
        <>
          <img
            src="/favicon.svg"
            alt=""
            width={20}
            height={20}
            className="size-5 rounded"
          />
          {appName}
        </>
      ),
    },
    links: [
      {
        text: 'Blog',
        url: '/blog',
        on: 'nav',
        icon: <Newspaper />,
      },
      {
        text: 'Demos',
        url: '/demos',
        on: 'nav',
        icon: <FlaskConical />,
      },
    ],
  };
}
