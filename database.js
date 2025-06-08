const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'crm.sqlite'));

// Создаем таблицу заказов, если нет
db.prepare(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    createdAt TEXT NOT NULL,
    clientName TEXT NOT NULL,
    clientPhone TEXT NOT NULL,
    deviceType TEXT,
    deviceBrand TEXT,
    deviceModel TEXT,
    problem TEXT,
    shelf TEXT,
    status TEXT,
    photos TEXT -- JSON строка с массивом путей
  )
`).run();

try {
  db.prepare(`ALTER TABLE orders ADD COLUMN price INT`).run();
} catch (e) {
  // Игнорируем ошибку, если колонка уже существует
  if (!e.message.includes('duplicate column name')) {
    throw e;
  }
}

module.exports = db;
