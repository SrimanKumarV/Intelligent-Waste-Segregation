/**
 * Intelligent Solid Waste Segregation Analytics — Node.js IoT Backend & Gateway
 * Optional cross-platform Node.js alternative
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DASHBOARD_DIR = path.join(__dirname, '..', 'simulation', 'dashboard');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const TELEMETRY_FILE = path.join(DATA_DIR, 'telemetry.jsonl');
const LID_EVENTS_FILE = path.join(DATA_DIR, 'lid_events.jsonl');
const CATEGORIES_FILE = path.join(DATA_DIR, 'classifications.jsonl');

let latestTelemetry = null;
let lastReceivedTime = null;
let lastLidState = 'CLOSED';

function getDeviceHealth() {
  if (!latestTelemetry) {
    return {
      status: 'NO_DATA',
      connected: false,
      device_id: null,
      seconds_since_last_packet: null,
      uptime_seconds: 0,
      message: 'No sensor telemetry received yet. Awaiting hardware connection.'
    };
  }

  const elapsed = ((Date.now() - lastReceivedTime) / 1000);
  let connStatus = 'ONLINE';
  if (elapsed > 15) connStatus = 'DISCONNECTED';
  else if (elapsed > 5) connStatus = 'STALE';

  return {
    status: connStatus,
    connected: (connStatus === 'ONLINE'),
    device_id: latestTelemetry.dev,
    seconds_since_last_packet: Math.round(elapsed * 10) / 10,
    uptime_seconds: latestTelemetry.up,
    last_received_at: new Date(lastReceivedTime).toISOString(),
    faults: latestTelemetry.faults || []
  };
}

function getCategoryStats() {
  let bioCount = 0;
  let nonBioCount = 0;
  let bioWeight = 0;
  let nonBioWeight = 0;

  if (fs.existsSync(CATEGORIES_FILE)) {
    const lines = fs.readFileSync(CATEGORIES_FILE, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        if (item.category === 'BIODEGRADABLE') {
          bioCount++;
          if (item.weight_g) bioWeight += parseFloat(item.weight_g);
        } else if (item.category === 'NON_BIODEGRADABLE') {
          nonBioCount++;
          if (item.weight_g) nonBioWeight += parseFloat(item.weight_g);
        }
      } catch (e) {}
    }
  }

  const total = bioCount + nonBioCount;
  return {
    total_events: total,
    biodegradable: {
      count: bioCount,
      percentage: total > 0 ? Math.round((bioCount / total) * 1000) / 10 : 0.0,
      total_weight_grams: Math.round(bioWeight * 10) / 10
    },
    non_biodegradable: {
      count: nonBioCount,
      percentage: total > 0 ? Math.round((nonBioCount / total) * 1000) / 10 : 0.0,
      total_weight_grams: Math.round(nonBioWeight * 10) / 10
    }
  };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (pathname === '/api/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(getDeviceHealth()));
    } else if (pathname === '/api/telemetry/latest' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        device_health: getDeviceHealth(),
        telemetry: latestTelemetry
      }));
    } else if (pathname === '/api/telemetry/history' && req.method === 'GET') {
      const history = [];
      if (fs.existsSync(TELEMETRY_FILE)) {
        const lines = fs.readFileSync(TELEMETRY_FILE, 'utf8').trim().split('\n').slice(-100);
        for (const line of lines) {
          if (line.trim()) {
            try { history.push(JSON.parse(line)); } catch (e) {}
          }
        }
      }
      res.writeHead(200);
      res.end(JSON.stringify(history));
    } else if (pathname === '/api/lid/events' && req.method === 'GET') {
      const events = [];
      if (fs.existsSync(LID_EVENTS_FILE)) {
        const lines = fs.readFileSync(LID_EVENTS_FILE, 'utf8').trim().split('\n').slice(-50);
        for (const line of lines) {
          if (line.trim()) {
            try { events.push(JSON.parse(line)); } catch (e) {}
          }
        }
      }
      res.writeHead(200);
      res.end(JSON.stringify(events));
    } else if (pathname === '/api/categories' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(getCategoryStats()));
    } else if (pathname === '/api/telemetry' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const rec = JSON.parse(body);
          rec.received_at = new Date().toISOString();
          latestTelemetry = rec;
          lastReceivedTime = Date.now();

          // Check Lid transition
          if (rec.lid_cmd && rec.lid_cmd !== lastLidState) {
            const ev = {
              timestamp: rec.received_at,
              previous_state: lastLidState,
              new_state: rec.lid_cmd,
              trigger: rec.prox ? 'PROXIMITY_DETECTED' : 'AUTO_TIMEOUT_OR_MANUAL',
              distance_cm: rec.dist_cm
            };
            fs.appendFileSync(LID_EVENTS_FILE, JSON.stringify(ev) + '\n');
            lastLidState = rec.lid_cmd;
          }

          fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(rec) + '\n');
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, seq: rec.seq }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (pathname === '/api/classification' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const rec = JSON.parse(body);
          rec.recorded_at = new Date().toISOString();
          fs.appendFileSync(CATEGORIES_FILE, JSON.stringify(rec) + '\n');
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }
    return;
  }

  // Static File Serving
  let filePath = path.join(DASHBOARD_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
  };

  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Node.js IoT Backend listening on http://localhost:${PORT}`);
});
