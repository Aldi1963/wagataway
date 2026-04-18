#!/bin/bash
set -e

# Production deploy should only build the app packages that are actually served.
pnpm install --frozen-lockfile
pnpm --filter @workspace/db run push
pnpm run build:prod
