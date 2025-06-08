const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();

router.post('/:id/delete-photo', (req, res) => {
    const orderId = req.params.id;
    const { url } = req.body;

    if (!url) return res.status(400).json({ error: 'No URL provided' });

    const stmt = db.prepare('SELECT photos FROM orders WHERE id = ?');
    const order = stmt.get(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let photos = [];
    try {
        photos = JSON.parse(order.photos || '[]');
    } catch (e) {
        return res.status(500).json({ error: 'Photos format error' });
    }

    const updatedPhotos = photos.filter(photo => photo !== url);

    // Удаление файла
    const filePath = path.join(__dirname, '..', url); // url = "/uploads/..."
    fs.unlink(filePath, err => {
        if (err && err.code !== 'ENOENT') {
            console.error('Ошибка удаления файла:', err);
            return res.status(500).json({ error: 'Failed to delete file' });
        }

        const updateStmt = db.prepare('UPDATE orders SET photos = ? WHERE id = ?');
        updateStmt.run(JSON.stringify(updatedPhotos), orderId);

        res.json({ success: true });
    });
});

module.exports = router;
