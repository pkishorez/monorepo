import { Cookies, HttpServerResponse } from 'effect/unstable/http';

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
