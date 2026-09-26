/** Safari on iPhone, iPod or iPad (iPadOS reports a Mac with touch). Other iOS browsers get no manual steps. */
export const isIosSafari = (nav: {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}): boolean => {
  const ua = nav.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  return (
    ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)
  );
};
