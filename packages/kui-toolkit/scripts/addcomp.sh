#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: pnpm addcomp <component>"
  echo "Example: pnpm addcomp button"
  exit 1
fi

pnpm dlx shadcn@latest add "$@" --overwrite
