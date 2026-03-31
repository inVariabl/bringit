#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${ROOT_DIR}/bringit.db"

if [[ ! -f "${DB_PATH}" ]]; then
  echo "Database not found: ${DB_PATH}" >&2
  exit 1
fi

read -r -p "Permanently delete all list data from ${DB_PATH}? [y/N] " reply
if [[ ! "${reply}" =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

node - "${DB_PATH}" <<'EOF'
const Database = require('better-sqlite3');

const dbPath = process.argv[2];
const db = new Database(dbPath);

const hasSqliteSequence = db.prepare(`
  SELECT 1
  FROM sqlite_master
  WHERE type = 'table' AND name = 'sqlite_sequence'
`).get();

db.exec('BEGIN');
db.prepare('DELETE FROM lists').run();

if (hasSqliteSequence) {
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'lists'").run();
}

db.exec('COMMIT');

const count = db.prepare('SELECT COUNT(*) AS count FROM lists').get().count;
console.log(`Purged database. Remaining rows in lists: ${count}`);
EOF
