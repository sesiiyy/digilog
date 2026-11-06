import json
import os
import sqlite3
from pathlib import Path
DB = Path(os.environ.get("DIGILOG_DB", "digilog.sqlite3"))
def connect():
    db = sqlite3.connect(DB)
    db.execute("CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, kind TEXT, payload TEXT)")
    return db
def save(key, kind, payload):
    with connect() as db:
        db.execute("INSERT OR REPLACE INTO artifacts VALUES (?,?,?)", (key,kind,json.dumps(payload)))
def list_kind(kind):
    with connect() as db:
        return [json.loads(row[0]) for row in db.execute("SELECT payload FROM artifacts WHERE kind=? ORDER BY rowid DESC LIMIT 100", (kind,))]
