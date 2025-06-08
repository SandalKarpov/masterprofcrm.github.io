const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = 3000;

// Подключаем базу данных (создаст файл crm.sqlite рядом с сервером)
const db = new Database(path.join(__dirname, 'crm.sqlite'));

const clientsRouter = require('./clients');
const statsRouter = require('./stats');

// Создаем таблицу заказов, если её нет
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
    price INT,
    photos TEXT
  )
`).run();

// Создаем папку для фото, если не существует
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Настройка multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'photo-' + uniqueSuffix + ext);
  },
});
const upload = multer({ storage });

// Статические папки
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use(cors());
app.use(bodyParser.json());

app.use('/api/clients', clientsRouter);

app.use('/api/stats', statsRouter);

// --- Роуты ---

// Получить все заказы с фильтрами
app.get('/api/orders', (req, res) => {
  const { search, status, shelf, fromDate, toDate, phone } = req.query;

  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (clientName LIKE ? OR clientPhone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (shelf) {
    query += ' AND shelf = ?';
    params.push(shelf);
  }

  if (fromDate) {
    query += ' AND date(createdAt) >= date(?)';
    params.push(fromDate);
  }

  if (toDate) {
    query += ' AND date(createdAt) <= date(?)';
    params.push(toDate);
  }

  if (phone) {
    query += ' AND clientPhone = ?';
    params.push(phone);
  }


  query += ' ORDER BY id DESC';

  const orders = db.prepare(query).all(...params);
  orders.forEach(o => {
    o.photos = o.photos ? JSON.parse(o.photos) : [];
  });

  res.json(orders);
});

// Получить заказ по id
app.get('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });
  order.photos = order.photos ? JSON.parse(order.photos) : [];
  res.json(order);
});

// Создать новый заказ
app.post('/api/orders', (req, res) => {
  const {
    clientName,
    clientPhone,
    deviceType = '',
    deviceBrand = '',
    deviceModel = '',
    problem = '',
    shelf = '',
    status = ''
  } = req.body;

  const createdAt = new Date().toISOString();
  const photos = JSON.stringify([]);

  // Перед вставкой заказа
  const existingClient = db.prepare('SELECT id FROM clients WHERE phone = ?').get(clientPhone);
  if (!existingClient) {
    db.prepare(`
      INSERT INTO clients (name, phone)
      VALUES (?, ?)
    `).run(clientName, clientPhone);
  }

  const price = req.body.price || 0;

  const stmt = db.prepare(`
    INSERT INTO orders (createdAt, clientName, clientPhone, deviceType, deviceBrand, deviceModel, problem, shelf, status, price, photos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(createdAt, clientName, clientPhone, deviceType, deviceBrand, deviceModel, problem, shelf, status, price, photos);

  const newOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
  newOrder.photos = [];

  res.status(201).json({ message: 'Заказ добавлен', order: newOrder });
});

// Обновить заказ, включая загрузку фото
app.put('/api/orders/:id', upload.array('photos'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  // Берем поля из тела запроса (если есть)
  const updatedFields = req.body;

  // multer-загруженные фото
  const newPhotos = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

  // Объединяем старые и новые фото
  const oldPhotos = order.photos ? JSON.parse(order.photos) : [];
  const photos = JSON.stringify([...oldPhotos, ...newPhotos]);

  // Обновляем запись
   const stmt = db.prepare(`
    UPDATE orders SET
      clientName = ?,
      clientPhone = ?,
      deviceType = ?,
      deviceBrand = ?,
      deviceModel = ?,
      problem = ?,
      shelf = ?,
      status = ?,
      price = ?,
      photos = ?
    WHERE id = ?
  `);

  stmt.run(
    updatedFields.clientName || order.clientName,
    updatedFields.clientPhone || order.clientPhone,
    updatedFields.deviceType || order.deviceType,
    updatedFields.deviceBrand || order.deviceBrand,
    updatedFields.deviceModel || order.deviceModel,
    updatedFields.problem || order.problem,
    updatedFields.shelf || order.shelf,
    updatedFields.status || order.status,
    updatedFields.price !== undefined ? updatedFields.price : order.price,
    photos,
    req.params.id
  );

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  updatedOrder.photos = JSON.parse(updatedOrder.photos);

  res.json({ message: 'Заявка обновлена', order: updatedOrder });
});

// Удалить заказ и связанные фото
app.delete('/api/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Заявка не найдена' });

  // Удаляем фото с диска
  const photos = order.photos ? JSON.parse(order.photos) : [];
  photos.forEach(photoPath => {
    const fullPath = path.join(__dirname, photoPath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  });

  // Удаляем из базы
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);

  res.json({ message: 'Заявка удалена' });
});

// Маршрут загрузки фото (если хочешь отдельно загружать фото)
app.post('/api/upload', upload.array('photos', 5), (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) return res.status(400).json({ error: 'Нет файлов для загрузки' });

  const urls = files.map(file => `/uploads/${file.filename}`);
  res.json({ photoUrls: urls });
});

app.post('/api/orders/:id/delete-photo', (req, res) => {
  const orderId = req.params.id;
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Не указан путь к фото' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return res.status(404).json({ error: 'Заявка не найдена' });
  }

  let photos = [];
  try {
    photos = order.photos ? JSON.parse(order.photos) : [];
  } catch (err) {
    return res.status(500).json({ error: 'Ошибка разбора JSON фото' });
  }

  const updatedPhotos = photos.filter(p => p !== url);

  // Удаляем файл с диска
  const filePath = path.join(__dirname, url);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Ошибка при удалении файла:', err);
      return res.status(500).json({ error: 'Ошибка при удалении файла' });
    }

    // Обновляем базу данных
    db.prepare('UPDATE orders SET photos = ? WHERE id = ?')
      .run(JSON.stringify(updatedPhotos), orderId);

    res.json({ message: 'Фото удалено' });
  });
});


// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
