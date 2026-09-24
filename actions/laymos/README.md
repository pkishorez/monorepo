# action-laymos

GitHub action that draws the Laymos Projects a pull request changed and keeps one comment with the pictures up to date.

## Big picture

It runs [`devtools snapshot --all`](../../devtools/devtools/README.md) against
the pull request's target branch, builds a comment with one picture per changed
Project, and posts it through [`action-pr-media`](../pr-media/README.md). With
`theme: both` the picture follows the reader's GitHub theme.

On `opened` it first posts a placeholder, so the comment sits near the top of
the conversation; if nothing is drawn, the placeholder then says no Module
changed. Later pushes only create the comment when there is a picture, and
edit it otherwise.

The devtools version comes from npm (`latest` by default) and needs no
install of the repository's own dependencies. The runner's Chrome draws the
pictures.

## Install

```yaml
steps:
  - uses: actions/checkout@v7
    with:
      fetch-depth: 0
  - uses: pkishorez/monorepo/actions/laymos@main
    with:
      token: ${{ secrets.PR_MEDIA_TOKEN }}
```

`token` is the personal access token that
[`action-pr-media`](../pr-media/README.md#install) needs. Pin a commit SHA
instead of `main` to hold a version.

## Exports

### Inputs

| Input               | What it does                                                                            |
| ------------------- | --------------------------------------------------------------------------------------- |
| `token`             | Required. Attaches the pictures and writes the comment.                                 |
| `base`              | Branch to compare with; defaults to the pull request's target, else the default branch. |
| `working-directory` | Folder to search for Laymos Projects; default `.`.                                      |
| `theme`             | `dark`, `light`, or `both` (default).                                                   |
| `only-changed`      | Leave out a Project when none of its Modules changed; default `true`.                   |
| `include-unchanged` | Draw every Module of a changed Project; default `false`.                                |
| `devtools-version`  | `@pkishorez/devtools` version from npm; default `latest`.                               |
| `devtools-bin`      | A built devtools entry to run instead; wins over `devtools-version`.                    |
| `browser`           | Chrome or Chromium executable; the runner's Chrome by default.                          |
| `id`                | Names the comment; default `laymos`.                                                    |

### Outputs

| Output     | What it does           |
| ---------- | ---------------------- |
| `markdown` | The comment as posted. |

## Usage

### Architecture pictures on every pull request

```yaml
name: pr:architecture
on:
  pull_request:
    types: [opened, reopened, synchronize]
concurrency:
  group: pr-architecture-${{ github.event.number }}
  cancel-in-progress: true
jobs:
  laymos:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: pkishorez/monorepo/actions/laymos@main
        with:
          token: ${{ secrets.PR_MEDIA_TOKEN }}
```

- Only commits since the merge-base with `base` are marked.
- A Project that fails to draw is named in the comment and fails the job
  after the comment is posted.
- This monorepo runs it with `devtools-bin` set to the devtools built from the
  pull request; see `.github/workflows/pr-architecture.yml`.
