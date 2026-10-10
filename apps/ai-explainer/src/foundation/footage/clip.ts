import { useEffect, useState } from 'react';
import { getStaticFiles, staticFile, useDelayRender } from 'remotion';

// What the recorder writes beside each clip: its length and the moments the
// cursor clicked, both in seconds from the clip's start.
export type Clip = { seconds: number; clicks: number[] };

// Recordings live in public/recordings/<look>/<id>.mp4 with <id>.json
// beside them. A clip not recorded yet is `null`, and footage draws a
// labelled placeholder in its place.
export function useClip(look: string, id: string) {
  const base = `recordings/${look}/${id}`;
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
