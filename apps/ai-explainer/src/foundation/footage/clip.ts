import { useEffect, useState } from 'react';
import { getStaticFiles, staticFile, useDelayRender } from 'remotion';

// What the recorder writes beside a recording: its length and the moments
// the cursor clicked, both in seconds from its start.
export type Clip = { seconds: number; clicks: number[] };

// A recording lives in public/recordings/<id>.mp4 with <id>.json beside it.
// Until it is recorded, `src` is `null` and footage draws a placeholder.
export function useClip(id: string) {
  const base = `recordings/${id}`;
  const recorded = getStaticFiles().some((file) => file.name === `${base}.mp4`);
  const [clip, setClip] = useState<Clip | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() =>
    recorded ? delayRender(`Reading ${base}.json`) : null,
  );
  useEffect(() => {
    if (handle === null) return;
    fetch(staticFile(`${base}.json`))
      .then((response) => response.json() as Promise<Clip>)
      .then((read) => {
        setClip(read);
        continueRender(handle);
      })
      .catch((error: unknown) => cancelRender(error));
  }, [base, handle, continueRender, cancelRender]);
  return { src: recorded ? staticFile(`${base}.mp4`) : null, clip };
}
