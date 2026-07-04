import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
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
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        type: 'icon',
        text: 'kishore.app',
        url: 'https://kishore.app/',
        external: true,
        icon: (
          <img
            src="/favicon.svg"
            alt="kishore.app"
            width={16}
            height={16}
            className="size-4 rounded"
          />
        ),
      },
    ],
  };
}
