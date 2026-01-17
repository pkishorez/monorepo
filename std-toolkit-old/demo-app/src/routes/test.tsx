import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/test')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="overflow-hidden">
      <iframe
        className="w-full h-96 -mt-10"
        src="https://stately.ai/registry/editor/embed/d19cd6bd-b6c9-4319-9489-58addab4e25b?machineId=15ec3537-a96a-48ef-b1a5-4ef1237bbb05&mode=simulate&colorMode=light"
      />
    </div>
  );
}
