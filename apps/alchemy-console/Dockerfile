# The image every run's container starts from: Node 22 with corepack (pnpm,
# yarn), Bun, git and a C toolchain for native installs, and the runner,
# bundled by `runner.build.ts`, at /opt/console-runner/runner.mjs.
#
# Built by Alchemy against the `.runner/` folder `alchemy.run.ts` bundles
# the runner into; the runner's three variables (RUN_ID, RUN_TOKEN,
# CONSOLE_URL) are given when a run's container starts, never baked in.

FROM oven/bun:1.4.3-slim AS bun

FROM node:22.23.3-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential ca-certificates git python3 unzip \
  && rm -rf /var/lib/apt/lists/*

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx \
  && rm -f /usr/local/bin/yarn /usr/local/bin/yarnpkg \
  && corepack enable pnpm yarn

# Projects run as a user of their own, not root.
RUN useradd --create-home --shell /bin/bash runner
USER runner
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /home/runner

COPY runner.mjs /opt/console-runner/runner.mjs

CMD ["node", "/opt/console-runner/runner.mjs"]
