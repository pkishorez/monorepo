# State machine

Status: partial. The checkout works end to end; Foldkit's machine analysis
panel (dead transitions, unreachable States, Mermaid chart) cannot be built.

## What was ported

Foldkit's `state-machine`: a book checkout that goes Cart → Shipping (only
for the hardcover) → Payment → Review → Placing → Confirmed, with Back,
Cancel from any step before Placing, a promo code, and Start over.

```
Checkout (root)                      Model { shipping }: the edition, kept in every State
  Cart
  Shipping
  Payment { paymentSelected }
  Review { paymentSelected,          Provides Promos
           termsAccepted, promo }
  └─ promo: PromoCode                Model { input }; Submitted → Command → Promos.submit(code)
                                     (a Request: it reaches Checkout as SubmittedPromo)
  Placing { discount }               Command: sleep 1 s in the app's Time → SucceededPlaceOrder
  Confirmed { discount, orderId }
  Cancelled
summary/  OrderSummary, the price panel beside every step; a drawing
promo/    PromoCode Actor and View, the Promos Capability, the known codes
```

Foldkit's machine is a separate declared chart folded into an app Model. Here
the Actor's States are the chart. Foldkit's `Machine.forStates([...]).on(...)`
is an object spread (`...cancellable`, `...finished`) in the update of each
State that has those rules. Its `when(...)` / `otherwise(...)` guards are a
ternary in the rule.

## Deviations

- **The edition is the Model, not repeated in every State.** Foldkit carries
  `isShippingRequired` in all seven States. Here it is the Actor's Model,
  since it is kept in every State, and only Cart has the rule that changes it.
- **No transition log.** Foldkit keeps the last 20 transitions in its Model.
  The Shell's Message Log already lists every Message with what came of it
  (handled or ignored), so the demo does not copy it into the Model.
- **No analysis panel.** See the blocker below.
- **The promo code field is a Child Actor.** It keeps only the typed text and
  hands the code up through a Request; the Checkout decides whether it is good,
  because the discount has to reach Placing. A rejected code stays shown
  until the next submit: the parent does not see the typing, so Foldkit's
  "typing clears the rejection" is gone.
- The edition picker is drawn by the Checkout's View, not a Child: it needs
  the current edition, which a Child cannot be given (blocker 13). Foldkit
  uses its `RadioGroup` Submodel; this uses web-platform's RadioGroup.

## Blockers

- **New: Transitions are not data, so the chart cannot be drawn or checked**
  (blocker 17 in [../NOTES.md](../NOTES.md)). Foldkit's
  `Machine.define` knows every State's targets, so it can list dead
  transitions and unreachable States and print a Mermaid chart. In Effect Oak a
  Transition is whatever Update returns (ADR 0002), a function nobody can read
  without running it. An optional declaration in `make`
  (`transitions: { Cart: ['Shipping', 'Payment', 'Cancelled'], … }`), with
  each State's rules typed to return only those tags, would make the chart
  data: drawable, checkable, and still plain functions.
- Blocker 13 (no data from parent to Child): the edition picker stays in the
  parent's View.

## Testing

Foldkit tests the machine with `story`: given the initial Model, send
`ClickedContinue`, check `Command.expectNone()` and that the State is
Shipping; a digital cart goes Cart → Payment and back. Review only allows
`ClickedPlaceOrder` once payment and terms are set, and then
`Command.expectHas(PlaceOrder)`, resolved with `SucceededPlaceOrder`. A plain
Effect test runs `PlaceOrder` under `TestClock` to check it waits 1 s. Scenes
click through the whole flow and check the promo discount in the total.

What Effect Oak would need:

- A typed `Actor.step` to run one Update from a given Model and State (blocker
  5). The rules are pure, so this is all the state tests need.
- Named Commands (blocker 4) to check that Placing asked for `PlaceOrder`
  with `{ shipping: false }` and to answer it.
- The `PlaceOrder` timing test works today: the Command is an Effect and
  `Effect.sleep` can be driven with `TestClock`.
- A way to test the Request from `PromoCode`: `Runtime.start` with only the
  child and a stub `Promos` Layer can do it now.

## Also surprising

- The checkout needs no Capabilities and no Layer: `Layer.empty`.
- A Message with no rule in the current State is ignored and the Log says
  so, which is the "Ignored" half of Foldkit's transition log for free.
