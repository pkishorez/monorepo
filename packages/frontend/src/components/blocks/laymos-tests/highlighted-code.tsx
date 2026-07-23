import { useEffect, useState } from 'react';

import type { LaymosTestCodeLanguage } from './types';

export function HighlightedCode({
  code,
  language,
}: {
  readonly code: string;
  readonly language: LaymosTestCodeLanguage;
}) {
  const [highlighted, setHighlighted] = useState<{
    readonly code: string;
    readonly language: LaymosTestCodeLanguage;
    readonly html: string;
  }>();
  const html =
    highlighted?.code === code && highlighted.language === language
      ? highlighted.html
      : undefined;

  useEffect(() => {
    let active = true;
    void import('shiki')
      .then(({ codeToHtml }) =>
        codeToHtml(code, {
          lang: language,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false,
        }),
      )
      .then((value) => {
        if (active) setHighlighted({ code, language, html: value });
      })
      .catch(() => {
        if (active) setHighlighted(undefined);
      });
    return () => {
      active = false;
    };
  }, [code, language]);

  if (html === undefined) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4">
        <code>{code}</code>
      </pre>
    );
  }
  return (
    <div
      className="[&_.shiki]:overflow-x-auto [&_.shiki]:whitespace-pre-wrap [&_.shiki]:break-words [&_.shiki]:bg-transparent! [&_.shiki]:font-mono [&_.shiki]:text-[11px] [&_.shiki_code]:text-[11px] [&_.shiki_code]:leading-4 dark:[&_.shiki_span]:text-[var(--shiki-dark)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
