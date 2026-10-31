/*
 * The App Shell's one trick: the app sits in a Suspense boundary that the
 * server cannot draw, so React leaves it for the browser, which draws the
 * app there, at its own URL, while it hydrates the Document around it.
 * React reports the boundary the server gave up on as a recoverable error,
 * with the digest the server named it by; the browser knows it by that.
 */

/** The digest the App Shell's boundary goes to the browser with. */
export const NOT_HERE = 'kabuki-start/app-shell';

/** Thrown where the app goes in the App Shell: it is drawn in the browser alone. */
export class NotHere extends Error {
  readonly digest = NOT_HERE;
  constructor() {
    super('the App Shell leaves the app to the browser');
  }

  /** Stands where the app goes, on the server. */
  static Draw(): never {
    throw new NotHere();
  }
}
