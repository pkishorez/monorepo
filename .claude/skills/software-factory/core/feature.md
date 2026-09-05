# Work on an application

## 1. Confirm setup

Inspect the application's configuration, runtime wiring, and available verification results.

Reuse the user's previous setup acceptance.

For a web application with unfinished setup, return to [web setup](../applications/web/setup/guide.md).

If acceptance is unknown, establish the remaining verification with the user before starting business modeling.

## 2. Choose the next step

Ask what the user wants to add or change.

For a complete feature, follow the steps below in order.

For a focused change, start at the relevant step and inspect its existing prerequisites.

## 3. Model the data

Follow [modeling](modeling/guide.md) for schemas, entities, tables, and access patterns.

Reuse the table and providers created during setup.

## 4. Define behavior

Follow [operations](operations/guide.md) for application behavior and its errors.

## 5. Expose calls

When the feature needs RPC, follow [RPC](rpc/guide.md) for definitions, handlers, and clients.

Reuse the configured transport unless the requirements call for a change.

## 6. Connect client data

When the feature needs collections or update delivery, follow [sync](sync/guide.md).

Reuse the selected update behavior and review any new durability requirements.

## 7. Connect the frontend

For web pages, follow [web architecture](../applications/web/architecture.md) for routes and providers.

Keep framework wiring outside shared application behavior.

For authentication or authorization, follow [auth-toolkit](../../auth-toolkit/SKILL.md).

## 8. Verify the change

Run the checks required by each affected guide.

Show the result and request manual review of the changed behavior.
