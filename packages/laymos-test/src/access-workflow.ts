import { Effect } from 'effect';
import { all, decision, exhaustive, flow, step, when } from 'laymos/story';

export interface AccessInput {
  readonly actorId: string;
  readonly policy: 'allow' | 'challenge' | 'deny';
}

export type AccessResult = 'granted' | 'verification-required' | 'blocked';

const loadPolicy = flow(
  'Load access policy',
  {
    description:
      'Loads the policy assigned to the actor so the authorization flow can make a consistent access decision.',
  },
  (actorId: string) =>
    step(
      'Read policy store',
      {
        description:
          'Reads the actor-specific policy from persistent storage before evaluating the request.',
        attributes: { actorId },
      },
      () => Effect.sleep(1),
    ),
);

const writeAuditEntry = flow(
  'Write audit entry',
  {
    description:
      'Records that an access attempt occurred independently of whether the policy ultimately grants or blocks it.',
  },
  () =>
    step(
      'Persist audit event',
      {
        description:
          'Writes the access-attempt event to the audit trail for later security review.',
      },
      () => Effect.sleep(1),
    ),
);

export const authorizeAccess = flow(
  'Authorize access',
  {
    description:
      'Loads the actor policy, records the access attempt, and applies the policy to determine the request outcome.',
    attributes: (input: AccessInput) => ({
      actorId: input.actorId,
      policy: input.policy,
    }),
  },
  (input: AccessInput): Effect.Effect<AccessResult> =>
    Effect.gen(function* () {
      yield* all([loadPolicy(input.actorId), writeAuditEntry()], {
        concurrency: 'unbounded',
      });

      return yield* decision(
        'Apply access policy',
        {
          description:
            'Routes the request to grant, additional verification, or denial according to the actor policy.',
        },
        input.policy,
      ).pipe(
        when(
          'allow',
          {
            name: 'Grant access',
            description:
              'The policy trusts this request, so authorization can issue an authenticated session immediately.',
          },
          () =>
            step(
              'Issue session',
              {
                description:
                  'Creates the authenticated session that lets the actor continue into the protected system.',
              },
              () => Effect.succeed('granted' as const),
            ),
        ),
        when(
          'challenge',
          {
            name: 'Verify identity',
            description:
              'The policy requires stronger evidence, so access pauses until the actor completes another verification step.',
          },
          () =>
            step(
              'Request verification',
              {
                description:
                  'Returns a verification requirement instead of issuing a session or rejecting the actor outright.',
              },
              () => Effect.succeed('verification-required' as const),
            ),
        ),
        when(
          'deny',
          {
            name: 'Deny access',
            description:
              'The policy explicitly rejects this request, so authorization must not create a session.',
          },
          () =>
            step(
              'Block request',
              {
                description:
                  'Terminates the authorization flow with a blocked result and leaves the actor unauthenticated.',
              },
              () => Effect.succeed('blocked' as const),
            ),
        ),
        exhaustive,
      );
    }),
);
