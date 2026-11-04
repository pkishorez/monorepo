// A file imported `?url` is its URL, which the app's bundler gives it.
declare module '*?url' {
  const url: string;
  export default url;
}
