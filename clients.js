const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'crm.sqlite'));

// Создаем таблицу клиентов, если её нет
db.prepare(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT,
    address TEXT,
    notes TEXT
  )
`).run();

// Проверка: если таблица пустая — вставим 3 тестовых клиента
const count = db.prepare('SELECT COUNT(*) AS count FROM clients').get().count;
if (count === 0) {
  const insert = db.prepare('INSERT INTO clients (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)');
  insert.run('Иван Иванов', '79001234567', 'ivan@example.com', 'ул. Пушкина, 10', 'Постоянный клиент');
  insert.run('Мария Петрова', '79007654321', 'maria@example.com', 'ул. Ленина, 5', 'Покупала телевизор');
  insert.run('Сергей Смирнов', '79005556677', 'sergey@example.com', 'ул. Кирова, 25', 'Нужна доставка');
}


// Получить всех клиентов
router.get('/', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY name').all();
  res.json(clients);
});

// Получить одного клиента по id
router.get('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Клиент не найден' });
  res.json(client);
});

// Создать клиента
router.post('/', (req, res) => {
  const { name, phone, email = '', address = '', notes = '' } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Имя и телефон обязательны' });
  }

  try {
    const stmt = db.prepare('INSERT INTO clients (name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?)');
    const info = stmt.run(name, phone, email, address, notes);
    const newClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ message: 'Клиент добавлен', client: newClient });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Клиент с таким телефоном уже существует' });
    } else {
      res.status(500).json({ error: 'Ошибка при добавлении клиента' });
    }
  }
});

// Обновить клиента
router.put('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Клиент не найден' });

  const { name, phone, email, address, notes } = req.body;

  try {
    const stmt = db.prepare(`
      UPDATE clients SET
        name = ?,
        phone = ?,
        email = ?,
        address = ?,
        notes = ?
      WHERE id = ?
    `);
    stmt.run(
      name || client.name,
      phone || client.phone,
      email || client.email,
      address || client.address,
      notes || client.notes,
      req.params.id
    );

    const updatedClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
    res.json({ message: 'Клиент обновлен', client: updatedClient });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(400).json({ error: 'Клиент с таким телефоном уже существует' });
    } else {
      res.status(500).json({ error: 'Ошибка при обновлении клиента' });
    }
  }
});

// Удалить клиента
router.delete('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Клиент не найден' });

  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ message: 'Клиент удален' });
});

module.exports = router;
