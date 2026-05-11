const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/db/app.db');

let _rawDb = null;

function _save() {
  if (!_rawDb) return;
  const data = _rawDb.export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

class StatementShim {
  constructor(sql) { this._sql = sql; }

  _bind(stmt, args) {
    // accepts .get(a, b) or .get([a, b])
    const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    if (params.length) stmt.bind(params);
  }

  get(...args) {
    const stmt = _rawDb.prepare(this._sql);
    this._bind(stmt, args);
    const row = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return row;
  }

  all(...args) {
    const stmt = _rawDb.prepare(this._sql);
    this._bind(stmt, args);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  run(...args) {
    const stmt = _rawDb.prepare(this._sql);
    this._bind(stmt, args);
    stmt.step();
    stmt.free();
    const lastInsertRowid =
      _rawDb.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0;
    const changes = _rawDb.getRowsModified();
    _save();
    return { lastInsertRowid, changes };
  }
}

const db = {
  prepare(sql) {
    if (!_rawDb) throw new Error('Database not initialized. Call init() first.');
    return new StatementShim(sql);
  },
  exec(sql) {
    if (!_rawDb) throw new Error('Database not initialized. Call init() first.');
    _rawDb.exec(sql);
    _save();
    return this;
  },
};

async function init() {
  const SQL = await initSqlJs();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _rawDb = fs.existsSync(DB_PATH)
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();

  _rawDb.run('PRAGMA foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  _rawDb.exec(schema);
  _save();
}

module.exports = { init, db };
