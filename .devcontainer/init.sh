#!/usr/bin/env sh

echo "Installing dependencies..."
echo ""
pnpm i

exec "$@"