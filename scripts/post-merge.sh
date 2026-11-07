#!/bin/bash
set -e
# Merged workspace catalogs can change independently of the lockfile; reconcile them here.
pnpm install --no-frozen-lockfile
pnpm --filter db push
