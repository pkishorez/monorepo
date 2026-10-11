# 1. Actor

Status: works

## What it shows

Model, Message, Update. One Circle is the Counter Instance, with its `count`
written inside. The only way the number changes is a Message going through
Update.

## What to click

- The Circle: Increment.
- Chips: Decrement, Reset.

## What to watch

- The Strip: one lane, `Counter`, with a View-coloured Marble per click.
- The devtools: each Step's Change is the one field `count`, old and new.
  Pick a Step to Time Travel: the Circle shows that count and cannot Send.

## Deviations from the spec

None.

## Blockers

None.
