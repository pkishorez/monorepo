# Shopping cart

Status: partial. Browse, search, add, change quantities, check out and place
an order all work; product cards cannot show their quantity in the cart.

## What was ported

Foldkit's `shopping-cart`: Products (with search), Cart (quantities, remove,
clear, total) and Checkout (delivery instructions, place order). Products and
orders come from a fake `ShopServer` in the app's Layer.

```
Shop (root)                       Model { cart }; requires ShopServer (from the Layer)
  Products                        Provides Basket { cart, add, clear }
  └─ products: Products           requires ShopServer, Basket
       Loading                    Lifetime: ShopServer.products → Loaded
       Ready { products, search } Add to cart → Command → Basket.add(item) (a Request)
  Cart                            drawn from the Model by cart-page/; the shop's own Messages
  Checkout                        Provides Basket
  └─ checkout: Checkout           Model { instructions }; requires ShopServer, Basket
       Editing { error }
       Placing                    Command: reads Basket.cart, ShopServer.placeOrder,
                                  Basket.clear() (a Request) → SucceededPlaceOrder
       Placed { orderId }
basket/       Item and Cart Schemas, cart changes, the Basket Service
shop-server/  ShopServer: fake catalog and order desk, slow on purpose
cart-page/    CartPage, a drawing
```

## Page switching as States

Each page is a State of the Shop; the nav sends `ClickedPage`, one `'*'`
rule. The cart is the Model, so it outlives every page. What went well and
what did not:

- It reads clearly: the State says which page is shown and which Children
  exist, and the Message Log shows every page change.
- **Leaving a page destroys its Child.** Going Products → Cart → Products
  forgets the search and fetches the catalog again. Foldkit keeps
  `productsPage` in the root Model (and the search in the URL). Keeping it
  would need the Products Child to live across a set of States (blocker 10),
  or a Model-level page with every Child alive at once, as api-cache does.
- **No URLs** (blocker 15): no deep link to /cart, no NotFound page, and the
  search is not in the query string.
- Basket is the same Service in two States, so `provides` builds it twice
  through one helper.

## Deviations

- Products and orders come from `ShopServer`, a fake backend with a delay.
  Foldkit's products are a constant and placing an order only sets a flag.
- The Checkout Command reads the cart from Basket when it runs (a Command
  sees the latest Services) instead of the page being handed the cart.
- An empty cart is refused by the fake server, so Checkout shows an error
  rather than an empty state.

## Blockers

- **A parent cannot pass data to a Child** (blocker 13). Foldkit's products
  page gets the cart as `viewInputs` and swaps "Add to cart" for − n + once a
  product is in the cart. The Products Child cannot see the cart, so every
  product shows "Add to cart" and the count lives in the shop's nav. The
  Checkout Child cannot show the cart either: the Shop's View draws the
  item count and total above it.
- **Children belong to exactly one State** (blocker 10): see above.
- **No routing** (blocker 15).

## Testing

Foldkit's stories feed `ChangedUrl` with `/`, `/cart`, `/checkout` and an
unknown path and check the route, and fold the products page's
`AddedToCart` OutMessage to check quantities. Scenes draw the nav, the cart
count, an empty cart, a cart with items and its total, and the checkout.

What Effect Oak would need:

- A typed `Node.step` (blocker 5): the cart rules (`RequestedAdd` twice gives
  quantity two) are pure and need nothing else.
- Drawing the Shop's View from a given Model and State (blocker 5) for the
  scenes; the Cart page is a plain component and can be rendered with React
  Testing Library today.
- Named Commands (blocker 4) to check the Checkout asked to place an order.
  Today the Command needs a stub `ShopServer` and `Basket` to run at all.
- A way to emit the Products Lifetime's `Loaded` (blocker 6).
- Routing tests have nothing to test until there are URLs (blocker 15).
