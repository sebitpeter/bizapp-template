#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Database migrations (lib/db/migrations) run automatically when the API starts.
# Do not use "db push" here: it bypasses the migration history.
