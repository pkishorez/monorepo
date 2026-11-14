// CommonJS on purpose: the Capacitor CLI loads a .js config with require()
// and reads module.exports as the config, so an ES module would come back
// wrapped in { default }. A .ts config would need TypeScript resolvable from
// here, which this app does not depend on.

// The site the shell opens. CI points it at a pull request's own deploy,
// path and query included (https://pr<N>-start.kishore.app/native?proof=1);
// both platforms load it exactly as given.
const url = process.env.SHELL_URL || 'https://start.kishore.app';

// iOS gives a remote site a service worker only inside App-Bound Domains.
// scripts/app-bound-domains.sh writes the matching WKAppBoundDomains entry.
const appBound = process.env.SHELL_APP_BOUND === 'true';

module.exports = {
  appId: 'app.kishore.start',
  appName: 'Kabuki Start',
  // Never shown: Capacitor wants a web folder even when it loads server.url.
  webDir: 'www',
  server: {
    url,
    // iOS keeps in the app only navigations that start with server.url, the
    // query too, so naming the host keeps the rest of the site in the app.
    allowNavigation: [new URL(url).hostname],
  },
  ios: {
    limitsNavigationsToAppBoundDomains: appBound,
  },
  // The web view's color before the page draws: the site's dark Theme, its
  // default, so a launch shows no white flash.
  backgroundColor: '#0a0a0a',
  plugins: {
    // The shell keeps the web view between the system bars itself
    // (ShellBars.java). SystemBars would hand the bars to a page with
    // viewport-fit=cover on WebView 140 and later, as this site has.
    SystemBars: { insetsHandling: 'disable', style: 'DARK' },
  },
};
