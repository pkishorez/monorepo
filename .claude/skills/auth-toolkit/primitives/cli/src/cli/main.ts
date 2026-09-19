import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { CliAuth } from 'auth-toolkit/cli';
import { Console, Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { appName, hostsFor, instanceConfigFor } from '../../infra/config.ts';
import { GreetingRpc, greetingRpc } from './client.ts';

const usage = `Usage: pnpm cli <command>

  login          Sign in through the browser
  logout         Sign out here and at the Auth Worker
  whoami         Ask the server who you are
  hello [name]   Call a guarded RPC

STAGE=prod selects the production instance; the default is local.`;

const { authWorkerUrl, apiUrl } = instanceConfigFor(
  hostsFor(process.env.STAGE ?? 'local'),
);

const [command, argument] = process.argv.slice(2);

const withRpc = <A, E, R>(
  use: (rpc: GreetingRpc['Service']) => Effect.Effect<A, E, R>,
) => Effect.flatMap(GreetingRpc, use).pipe(Effect.provide(greetingRpc(apiUrl)));

const program = Effect.gen(function* () {
  const auth = yield* CliAuth;
  switch (command) {
    case 'login': {
      const user = yield* auth.login;
      return yield* Console.log(`Signed in as ${user.email}.`);
    }
    case 'logout':
      yield* auth.logout;
      return yield* Console.log('Signed out.');
    case 'whoami': {
      const { kind, user } = yield* withRpc((rpc) => rpc.WhoAmI());
      return yield* Console.log(`${user.name} <${user.email}> (${kind})`);
    }
    case 'hello': {
      const greeting = yield* withRpc((rpc) =>
        rpc.Hello(argument === undefined ? {} : { name: argument }),
      );
      return yield* Console.log(greeting);
    }
    default:
      return yield* Console.log(usage);
  }
});

const fail = (message: string) =>
  Effect.andThen(
    Console.error(message),
    Effect.sync(() => {
      process.exitCode = 1;
    }),
  );

const signedOut = fail('Not signed in. Run: pnpm cli login');

program.pipe(
  Effect.catchTags({
    SignedOut: () => signedOut,
    Unauthenticated: () => signedOut,
    AuthWorkerRejected: (error) => fail(error.message),
    AuthWorkerUnreachable: (error) => fail(error.message),
    AuthWorkerUnavailable: (error) => fail(error.message),
    DeviceLoginFailed: (error) => fail(error.message),
    InvalidAuthWorkerResponse: (error) => fail(error.message),
  }),
  Effect.provide(CliAuth.layer({ authWorkerUrl, app: appName })),
  Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer)),
  NodeRuntime.runMain,
);
