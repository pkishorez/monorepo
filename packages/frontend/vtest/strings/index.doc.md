# Strings

String helpers for identifier-shaped values — the kind you derive from
user input or from other strings, not the kind you display. Output is
always ASCII-safe unless a module explicitly says otherwise.

## Modules

| Module    | Role                                               |
| --------- | -------------------------------------------------- |
| `case`    | `camel` / `pascal` / `kebab` / `snake` conversions |
| `slugify` | URL-safe slug generation with diacritic folding    |

## Conventions

- **Tokenization is shared.** A lower→upper transition is a word boundary
  (`HTTPServer` → `HTTP`, `Server`), and so are runs of non-alphanumerics.
  Both modules use the same rule so `case` and `slugify` stay consistent
  on the same input.
- **Acronyms are preserved as a single token.** This is a deliberate
  choice — the alternative (`H`, `T`, `T`, `P`, `Server`) round-trips
  poorly. See the `acronyms` suite in `case` for the pinned behaviour.
- **Empty / whitespace-only input** always returns `""` rather than
  throwing.

> If you need internationalised case folding (Turkish-i, German-ß), reach
> for `Intl.Collator` instead — these helpers are intentionally
> ASCII-first.
