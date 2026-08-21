# Bank

A shared table of accounts and the money moving between them. You bank as one
of them, send money to the others, and watch it land — against stores of
growing sync radius. The total money in the bank never changes.

## Language

**Account**:
A person who banks here: an immutable Id, a Name, and a balance. Accounts are
opened with a zero balance and are always open — there is no closing, freezing,
or deletion.
_Avoid_: user, customer, wallet.

**Id**:
An Account's identifier: a ULID, assigned once at opening, never shown. Every
Transfer names its two sides by Id.

**Name**:
An Account's human name, written however its owner writes it. Names are not
identifiers: two Accounts may share one, and telling them apart is the reader's
job, not the bank's.
_Avoid_: handle, username, nickname.

**Transfer**:
An immutable record of money moved from one Account to another, in whole
units. Transfers are never edited or deleted; history is append-only and
time-ordered.
_Avoid_: transaction (reserved for the atomic commit that writes a Transfer),
payment, send.

**Refusal**:
A Transfer the bank rejects as a whole, leaving both Accounts untouched. A
Transfer is refused when the amount is not a positive whole number, when both
sides are the same Account, when the sender lacks the funds, or when either
side does not exist. A Refusal is the bank's final word: the same Transfer
attempted again is refused again.

**Failure**:
A Transfer that never reached the bank. Nothing was decided and nothing moved,
so the identical Transfer may be attempted again and may then succeed.
Distinguished from a Refusal by who said no: a Failure is the journey, a
Refusal is the bank.

**Viewpoint**:
The Account you are currently banking as. A Viewpoint is a way of looking, not
a login: it grants nothing, the bank never learns of it, and you may take up
any Account's Viewpoint at will.
_Avoid_: session, login, current user, impersonation.

**Sync Radius**:
How far a store's changes reach: this page (Memory), this browser (IndexedDB),
everyone (DynamoDB). The radius is a property of reach; each one is a separate
bank, with its own Accounts and its own money.

## Decisions

- Banking is anonymous: an Account is not owned, not logged into, and not
  protected. A Viewpoint is chosen, never authenticated.
- An Account opens with the balance its owner chose, up to a fixed cap; from
  then on it changes only through Transfers.
- A Transfer moves money between exactly two distinct Accounts and settles
  atomically: both balances and the Transfer record, or nothing.
- Transfers are immutable history; an Account's history is everything it sent
  plus everything it received.
- A Name is a label, never a key; only the Id identifies an Account. Opening an
  Account can therefore never be refused for its Name.
- Transfers run concurrently, but never two over the same Account: while a
  Transfer is in flight both of its Accounts are held, and neither can send nor
  receive until it settles, is refused, or fails.
- Refusals are permanent and Failures are not; only a Failure may be retried.
