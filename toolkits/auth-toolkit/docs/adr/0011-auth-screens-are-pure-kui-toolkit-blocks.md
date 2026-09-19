# 11. Auth screens are pure kui-toolkit blocks; auth-toolkit only wires data

Date: 2026-09-19

## Status

Accepted

## Context

The Auth Worker serves four screens: Home Page, Login Screen, Consent Screen, and Device Screen. Each has several states (loading, signed out, signed in, error, done) and the states must not shift layout as they change. Until now each screen mixed the better-auth client, effects, and markup in one component inside auth-toolkit, which has no visual test harness. Layout shifts went unnoticed because no state could be rendered on its own, and the only way to see a state was to reproduce it against a running Auth Worker.

kui-toolkit already has react-cosmos fixtures for every block, one fixture entry per state. auth-toolkit depends on kui-toolkit; kui-toolkit imports nothing from auth-toolkit.

## Decision

Every visual of the four screens lives in kui-toolkit as the `auth` block: the frame, the loader, and each screen with all of its states, as pure components. Props in, callbacks out. Nothing under the block imports better-auth, TanStack Query, or the router. Each screen ships a fixture file with one entry per state.

auth-toolkit keeps every fact: the session hook, the queries and mutations for Sessions and Grants, the redirect rules between Home Page and Login Screen, and the calls to the Auth Worker. Its route components pass data and handlers into the block.

## Consequences

Every state of every screen is renderable without a server, so layout-shift regressions are visible in the fixture browser. Auth-specific copy and layout now live in a UI kit, which a reader may find surprising; this file is the answer. A change that needs a new screen state touches both packages: the block for the visual, auth-toolkit for the data. The block cannot know whether a User is signed in; it can only be told.
