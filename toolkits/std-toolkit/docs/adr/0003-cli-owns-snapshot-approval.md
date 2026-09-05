# The CLI owns snapshot approval

std-toolkit provides the complete local snapshot workflow: verification compares the current contract with its approved baseline, while explicit approval writes the current contract as the new baseline regardless of the safety classification of its changes. This reverses ADR 0001's decision to keep snapshot storage and approval outside the library because making every consumer rebuild the same workflow obscures the safety decision and creates needless variation. Approval means “accept this baseline,” not “this change is safe,” so dangerous changes require explicit intent rather than being prohibited.

Verification passes only when the current contract exactly matches the approved baseline. Every difference requires approval even when classified as safe, because letting unapproved additions pass would allow later edits to those additions to remain hidden behind a stale baseline.

The CLI exposes only `std-toolkit snapshot` for verification and `std-toolkit snapshot approve` for approval. Approval reports the accepted changes, writes atomically, and needs no extra confirmation or force flag. First approval reports only that the baseline was approved; approving an unchanged contract is a no-op. Full contract viewing remains available through the library rather than a CLI subcommand.
