declare module 'virtual:kabuki-start/worker' {
  const worker: {
    readonly fetch: (request: Request, env: unknown) => Promise<Response>;
  };
  export default worker;
}
