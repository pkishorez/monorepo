/*
 * A Video's id from the YouTube link it is created with, read from the link
 * alone, with no network call.
 */

/** A YouTube video id: 11 letters, digits, `_` or `-`. */
const ID = /^[A-Za-z0-9_-]{11}$/;

/** Paths whose next part is the id, as in youtube.com/shorts/<id>. */
const BEFORE_ID = new Set(['shorts', 'live', 'embed', 'v']);

/**
 * The video id `link` names, or null: watch?v=, youtu.be/, shorts/, live/
 * and embed/ links, on www., m. or music., with or without https://, with
 * any other parameters.
 */
export const idOf = (link: string): string | null => {
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(link) ? link : `https://${link}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const [first, second] = url.pathname.split('/').filter((part) => part !== '');
  const id =
    host === 'youtu.be'
      ? first
      : host === 'youtube.com' || host === 'youtube-nocookie.com'
        ? first === 'watch'
          ? url.searchParams.get('v')
          : first !== undefined && BEFORE_ID.has(first)
            ? second
            : null
        : null;
  return id !== null && id !== undefined && ID.test(id) ? id : null;
};
