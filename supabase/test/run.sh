#!/usr/bin/env bash
# Spins up a throwaway local Postgres, loads schema.sql twice (to prove it
# can be re-run safely), and runs the security rule tests.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
dir="$(mktemp -d)"
trap '"$PGBIN/pg_ctl" -D "$dir/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$dir"' EXIT

"$PGBIN/initdb" -D "$dir/data" -U postgres >/dev/null
"$PGBIN/pg_ctl" -D "$dir/data" -o "-k $dir -p 54329 -c listen_addresses=''" -l "$dir/log" start >/dev/null
psql=(psql -h "$dir" -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

"${psql[@]}" -f "$here/supabase_stubs.sql"
"${psql[@]}" -f "$here/../schema.sql"
"${psql[@]}" -f "$here/../schema.sql"
"${psql[@]}" -f "$here/rls_test.sql"
