import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/test')({
  component: RouteComponent,
});

function RouteComponent() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/hello world!')
      .then((v) => v.json())
      .then(setData);
  }, []);

  return <div>TEST ?? : {JSON.stringify(data, null, 2)}</div>;
}
