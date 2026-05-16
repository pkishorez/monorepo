export function InlineScript({ script }: { script: () => void }) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(${script.toString()})()`,
      }}
    />
  );
}
