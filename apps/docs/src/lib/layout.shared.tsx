import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Newspaper } from 'lucide-react';
import { appName } from './shared';

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
    links: [
      {
        text: 'Blog',
        url: '/blog',
        on: 'nav',
        icon: <Newspaper />,
      },
    ],
  };
}
