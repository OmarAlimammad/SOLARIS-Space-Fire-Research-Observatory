#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
if command -v python3 >/dev/null 2>&1; then
  echo 'Open http://127.0.0.1:8000 in your browser'
  exec python3 -m http.server 8000
elif command -v node >/dev/null 2>&1; then
  echo 'Open http://127.0.0.1:8000 in your browser'
  exec node server.mjs
else
  echo 'Python 3 or Node.js is required' >&2
  exit 1
fi
