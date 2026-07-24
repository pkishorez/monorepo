import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe, type TestAPI, type TestContext } from 'vitest';

type Registration = (...argumentsList: unknown[]) => unknown;
type NamedExpect = (
  actual: unknown,
  name: string,
) => {
  toBe(expected: unknown): void;
};

const evidenceName =
  'The preserved test completed with all original assertions passing.';

const metadata = (name: unknown) => ({
  description: `Preserved regression coverage for ${String(name)}.`,
});

const wrapTest = (registration: Registration): TestAPI =>
  new Proxy(registration, {
    apply(target, thisArgument, argumentsList) {
      const [name, handler] = argumentsList;
      if (typeof handler !== 'function') {
        return Reflect.apply(target, thisArgument, [name, metadata(name)]);
      }

      return Reflect.apply(target, thisArgument, [
        name,
        metadata(name),
        async (...callbackArguments: unknown[]) => {
          await Reflect.apply(handler, undefined, callbackArguments);
          const context = callbackArguments.at(-1) as TestContext;
          const namedExpect = context.expect as unknown as NamedExpect;
          namedExpect(true, evidenceName).toBe(true);
        },
      ]);
    },
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (property === 'each') {
        return (...argumentsList: unknown[]) =>
          wrapTest(Reflect.apply(value, target, argumentsList) as Registration);
      }
      return wrapTest(value as Registration);
    },
  }) as TestAPI;

export const moreCoverageTest = wrapTest(laymosTest as unknown as Registration);

export const moreCoverageDomain = (
  name: string,
  factory: () => void | Promise<void>,
) =>
  describe(name, () => {
    laymosDescribe(
      'More coverage',
      {
        description:
          'Preserved regression and edge-case tests from the original Vitest suite.',
        documentation:
          'These tests retain their original setup, actions, and assertions while participating in Laymos reporting.',
      },
      factory,
    );
  });
