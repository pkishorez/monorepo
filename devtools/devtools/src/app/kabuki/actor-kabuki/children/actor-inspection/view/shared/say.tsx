import { MarkdownViewer } from '@kestack/web-platform/ui/viewers/markdown-viewer';

export function Say({ children }: { readonly children: string }) {
  return (
    <MarkdownViewer className="prose-sm text-[13px] leading-5 text-pretty text-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-px [&_code]:text-[12px] [&_code]:font-normal [&_code]:before:content-none [&_code]:after:content-none [&_p]:my-0 [&_p+p]:mt-2">
      {children}
    </MarkdownViewer>
  );
}
