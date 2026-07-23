---
status: superseded by ADR-0014
---

# First-class hierarchical Story Groups

Stories are organized by reusable, described Story Group values rather than by
slash-encoded Story names or Story file locations. Root groups come from
`storyGroup()`, child groups from a parent Group's `group()`, grouped Stories
from a Group's `story()`, and direct `story()` declarations remain Standalone
Stories. A Story belongs to at most one Group. Full Group paths define Group
identity; sibling Groups and Stories share one namespace, `/` is reserved as
the displayed path separator, and conflicting declarations invalidate the
catalog.

`discoverStories()` replaces filesystem-only Story ID discovery and loads
Story modules only far enough to collect and validate a complete Story catalog;
module import must therefore remain declaration-only. Catalog validation is
atomic and reports all problems through the CLI and APIs. Story execution still
uses file-based Story IDs. Group execution accepts a Group path, then performs
fresh server-side discovery and runs the whole descendant subtree so stale
clients cannot omit Stories.

The catalog is presented as a collapsed hierarchy in both the All Stories view
and its navigator. Groups are selectable, described destinations and can run
their subtree. When Groups exist, Standalone Stories appear in a distinct
section; when no Groups exist, the existing flat list remains. Search and
manual ordering are deferred; siblings sort alphabetically with Groups first.

Rejected: deriving hierarchy from file paths, encoding hierarchy in Story
names, allowing tag-like multiple Group membership, and retaining a public
filesystem-only `discoverStoryIds()` API. Those alternatives either couple the
domain to source layout, cannot carry rich Group meaning, make placement
ambiguous, or expose an incomplete catalog.
