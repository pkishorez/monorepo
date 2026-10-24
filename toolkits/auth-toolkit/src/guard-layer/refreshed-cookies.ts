import { Cookies, HttpServerResponse } from 'effect/http';

/** Puts the Auth Worker's refreshed cookies on `response`, one per name
 * (ADR 0004). */
export const appendRefreshedCookies = (
  response: HttpServerResponse.HttpServerResponse,
  setCookieHeaders: ReadonlyArray<string>,
): HttpServerResponse.HttpServerResponse =>
  setCookieHeaders.length === 0
    ? response
    : HttpServerResponse.replaceCookies(
        response,
        Cookies.merge(
          response.cookies,
          Cookies.fromSetCookie(setCookieHeaders),
        ),
      );

/** How the refreshed cookies differ from the ones the request sent, for
 * logs. */
export const cookieChanges = (
  cookieHeader: string | undefined,
  setCookieHeaders: ReadonlyArray<string>,
) => {
  const previous = Cookies.parseHeader(cookieHeader ?? '');
  const returned = Object.values(
    Cookies.fromSetCookie(setCookieHeaders).cookies,
  );
  let added = 0;
  let refreshed = 0;
  let reissued = 0;
  let removed = 0;

  for (const cookie of returned) {
    if (cookie.value === '') {
      removed += 1;
    } else if (!Object.hasOwn(previous, cookie.name)) {
      added += 1;
    } else if (previous[cookie.name] === cookie.value) {
      reissued += 1;
    } else {
      refreshed += 1;
    }
  }

  return { added, refreshed, reissued, removed };
};
