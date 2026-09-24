# action-pr-media

GitHub action that attaches local images to a pull request in one comment that each run edits.

## Big picture

A comment can only show an image that has a URL. `pr-media` uploads each file
the way a drag-and-drop into a comment does, as a GitHub attachment, then
writes the comment with those URLs. In a private repository only people who
can see the repository can see the attachments.

The built-in `GITHUB_TOKEN` cannot upload attachments, so the action needs a
personal access token and fails without one. Pull requests from forks get no
secrets, so it does not run for them.

The comment is found again by a hidden marker and edited in place, so a pull
request has one comment per `id`. The code in `src/` reads top down:
`main.ts` reads the inputs, and `pr-media.ts` runs the steps in `steps/`:
upload, then link and comment. `laymos.config.json` holds that direction.
[`action-laymos`](../laymos/README.md) builds on it.

## Install

```yaml
steps:
  - uses: pkishorez/monorepo/actions/pr-media@main
    with:
      token: ${{ secrets.PR_MEDIA_TOKEN }}
```

`PR_MEDIA_TOKEN` is a classic personal access token with the `repo` scope, or
a fine-grained one with read and write access to Contents and Pull requests.
The comment is posted as the token's owner. Pin a commit SHA instead of `main`
to hold a version.

## Exports

### Inputs

| Input      | What it does                                                            |
| ---------- | ----------------------------------------------------------------------- |
| `token`    | Required. Uploads the files and writes the comment.                     |
| `markdown` | The comment; each path from `files` in it becomes the attachment's URL. |
| `files`    | Local files to attach, one per line: images or videos.                  |
| `id`       | Names the comment; defaults to the job id.                              |
| `create`   | `false` only edits an existing comment; default `true`.                 |

### Outputs

| Output     | What it does                                             |
| ---------- | -------------------------------------------------------- |
| `markdown` | The Markdown as posted, its file paths replaced by URLs. |

## Usage

### Post screenshots from a test run

A job writes PNGs, then posts them under one heading. Later pushes edit the
same comment.

```yaml
on:
  pull_request:
jobs:
  screenshots:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - run: npm ci && npm run screenshots # writes shots/*.png
      - uses: pkishorez/monorepo/actions/pr-media@main
        with:
          token: ${{ secrets.PR_MEDIA_TOKEN }}
          files: |
            shots/login.png
            shots/home.png
          markdown: |
            ## Screenshots
            ![Login](shots/login.png)
            <img src="shots/home.png" width="400">
```

- Each path from `files` is replaced wherever it appears in `markdown`, so it
  works in Markdown images, `src`, and `srcset` alike.
- A missing file, or one that is not an image or video, fails the run before
  anything is uploaded.
