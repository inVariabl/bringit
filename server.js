const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new Database('bringit.db');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    who TEXT DEFAULT '',
    what TEXT DEFAULT '',
    location TEXT DEFAULT '',
    date TEXT DEFAULT '',
    time TEXT DEFAULT '',
    end_time TEXT DEFAULT '',
    rows_json TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    visibility TEXT DEFAULT 'public',
    pin_hash TEXT DEFAULT ''
  )
`);

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API Routes
app.post('/api/lists', (req, res) => {
  const { id, title, created_at, updated_at, who, what, location, date, time, end_time, rows_json } = req.body;
  try {
    const stmt = db.prepare(`
      INSERT INTO lists (id, title, visibility, pin_hash, created_at, updated_at, who, what, location, date, time, end_time, rows_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, title, 'public', '', created_at, updated_at, who, what, location, date, time, end_time, JSON.stringify(rows_json));
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
    list.rows_json = JSON.parse(list.rows_json);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/lists/:id', (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(req.params.id);
    if (!list) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    list.rows_json = JSON.parse(list.rows_json);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/lists/:id', (req, res) => {
  const { title, who, date, time, end_time, location, rows_json, updated_at } = req.body;
  try {
    const stmt = db.prepare(`
      UPDATE lists 
      SET title = ?, who = ?, date = ?, time = ?, end_time = ?, location = ?, rows_json = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(title, who, date, time, end_time, location, JSON.stringify(rows_json), updated_at, req.params.id);
    const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(req.params.id);
    list.rows_json = JSON.parse(list.rows_json);
    
    // Notify clients on same list
    io.to(`list:${req.params.id}`).emit('list_updated', list);
    
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real-time with Socket.io
const presence = {}; // listId -> { userId -> presenceData }

io.on('connection', (socket) => {
  socket.on('join_list', (listId) => {
    socket.join(`list:${listId}`);
    socket.listId = listId;
  });

  socket.on('local_input', (data) => {
    // Broadcast granular input change to everyone else in the room
    socket.to(`list:${data.listId}`).emit('remote_input', data);
  });

  socket.on('track_presence', (data) => {
    const { listId, user_id } = data;
    if (!presence[listId]) presence[listId] = {};
    presence[listId][user_id] = data;
    socket.user_id = user_id;
    io.to(`list:${listId}`).emit('presence_sync', presence[listId]);
  });

  socket.on('clear_presence', (data) => {
    const { listId, user_id } = data;
    if (!listId || !user_id || !presence[listId]) return;
    delete presence[listId][user_id];
    io.to(`list:${listId}`).emit('presence_sync', presence[listId]);
  });

  socket.on('disconnect', () => {
    if (socket.listId && socket.user_id && presence[socket.listId]) {
      delete presence[socket.listId][socket.user_id];
      io.to(`list:${socket.listId}`).emit('presence_sync', presence[socket.listId]);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
