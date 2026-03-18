const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 9222;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Helpers ---

function validateApiKey(key) {
  return key && /^TND-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key);
}

function getKeyDir(key) {
  const dir = path.join(DATA_DIR, key);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getStatePath(key) {
  return path.join(getKeyDir(key), 'state.json');
}

// --- Auth middleware ---

function authRequired(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!validateApiKey(key)) {
    return res.status(401).json({ error: 'Invalid or missing X-Api-Key' });
  }
  req.apiKey = key;
  next();
}

// --- Routes ---

// Ping — no auth required
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, server: 'trophy-navigator-sync', version: '1.0.0', time: new Date().toISOString() });
});

// Get state
app.get('/api/state', authRequired, (req, res) => {
  const filePath = getStatePath(req.apiKey);
  if (!fs.existsSync(filePath)) {
    return res.json({ waypoints: [], tracks: [], routes: [], waypointSets: [], counters: {} });
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to read state' });
  }
});

// Put state
app.put('/api/state', authRequired, (req, res) => {
  const filePath = getStatePath(req.apiKey);
  const state = req.body;
  if (!state || typeof state !== 'object') {
    return res.status(400).json({ error: 'Invalid state data' });
  }
  state._updatedAt = new Date().toISOString();
  state._updatedBy = req.headers['x-client-id'] || 'unknown';
  try {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
    res.json({ ok: true, updatedAt: state._updatedAt });
  } catch (e) {
    res.status(500).json({ error: 'Failed to write state' });
  }
});

// Get state metadata
app.get('/api/state/meta', authRequired, (req, res) => {
  const filePath = getStatePath(req.apiKey);
  if (!fs.existsSync(filePath)) {
    return res.json({ exists: false });
  }
  try {
    const stat = fs.statSync(filePath);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({
      exists: true,
      updatedAt: data._updatedAt || stat.mtime.toISOString(),
      updatedBy: data._updatedBy || 'unknown',
      sizeBytes: stat.size,
      waypoints: data.waypoints?.length || 0,
      tracks: data.tracks?.length || 0,
      routes: data.routes?.length || 0
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read metadata' });
  }
});

// --- Start ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Trophy Navigator Sync Server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
