const sqlite3 = require('sqlite3').verbose();
const { databasePath } = require('./config');

const db = new sqlite3.Database(databasePath);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

const initialize = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_rows INTEGER DEFAULT 0,
      processed_rows INTEGER DEFAULT 0,
      failure_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS products (
      unique_key TEXT PRIMARY KEY,
      product_title TEXT,
      product_description TEXT,
      style_number TEXT,
      sanmar_mainframe_color TEXT,
      size TEXT,
      color_name TEXT,
      piece_price REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

};

module.exports = {
  db,
  run,
  get,
  all,
  initialize,
};

