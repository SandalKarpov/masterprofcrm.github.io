const express = require('express');
const db = require('./database');
const router = express.Router();

router.get('/', (req, res) => {
  const { start, end } = req.query;

  try {
    const stats = {};

    // Общее количество заявок
    stats.totalOrders = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE createdAt BETWEEN ? AND ?
    `).get(start, end).count;

    //Заявки со статусом "Оплачено"
    stats.paidOrders = db.prepare(`
        SELECT COUNT(*) as count FROM orders
        WHERE createdAt BETWEEN ? AND ?
        AND status='Оплачено' 
    `).get(start,end).count

    // Заявки по статусам
    stats.statuses = db.prepare(`
      SELECT status, COUNT(*) as count FROM orders
      WHERE createdAt BETWEEN ? AND ?
      GROUP BY status
    `).all(start, end);

    // 👉 Преобразуем в объект { "Готово": 3, "В ремонте": 5, ... }
    stats.statusCounts = {};
    stats.statuses.forEach(row => {
      stats.statusCounts[row.status] = row.count;
    });

    // Новые клиенты
    stats.newClients = db.prepare(`
      SELECT COUNT(DISTINCT clientPhone) as count FROM orders
      WHERE createdAt BETWEEN ? AND ?
    `).get(start, end).count;

    // Среднее в день
    const days = (new Date(end) - new Date(start)) / (1000 * 3600 * 24) || 1;
    stats.avgPerDay = +(stats.totalOrders / days).toFixed(2);

    // Доходы и средний чек
    let totalRevenue = 0;
    let avgCheck = 0;

    try {
      const result = db.prepare(`
        SELECT COALESCE(SUM(price), 0) as sum 
        FROM orders
        WHERE createdAt BETWEEN ? AND ?
        AND status = 'Оплачено' 
      `).get(start, end);

      totalRevenue = result.sum || 0;
      avgCheck = stats.totalOrders > 0 ? +(totalRevenue / stats.paidOrders).toFixed(2) : 0;
    } catch (e) {
      totalRevenue = 0;
      avgCheck = 0;
    }

    stats.totalRevenue = totalRevenue;
    stats.avgCheck = avgCheck;

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Ошибка статистики', error: err.message });
  }
});

module.exports = router;
