/**
 * Intelligent Solid Waste Segregation Analytics — IoT Backend & Gateway Server (Node.js)
 * Architecture: Multi-Microcontroller (Module A: Arduino Uno & Module B: ESP32)
 *
 * Provides:
 *   - 4-Channel Sensor Data Ingestion (C1, C2, LC1, LC2)
 *   - Device-specific routes (/api/telemetry/uno, /api/telemetry/esp32)
 *   - Normalised composite state (/api/telemetry/combined, /api/telemetry/latest)
 *   - Centralised 3-Compartment Mapping (/api/compartments)
 *   - Independent Hardware Health Tracking (/api/devices/status, /api/health)
 *   - Bidirectional Command Dispatch (/api/cmd/uno, /api/cmd/esp32)
 *   - ML Service Reverse Proxy (/api/ml/* -> 127.0.0.1:8000)
 *   - Persistent Logging to data/telemetry.jsonl, data/lid_events.jsonl
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

// Centralized Compartment Definitions
const COMPARTMENTS_CONFIG = [
  {
    id: "A",
    name: "Biodegradable Waste",
    configured: true,
    active: true,
    category: "BIODEGRADABLE",
    moisture_channel: "c1",
    weight_channel: "lc1",
    description: "Organic food scraps, compostable matter. High moisture capacity."
  },
  {
    id: "B",
    name: "Non-Biodegradable Waste",
    configured: true,
    active: true,
    category: "NON_BIODEGRADABLE",
    moisture_channel: "c2",
    weight_channel: "lc2",
    description: "Dry recyclables, containers, plastics, metals, packaging."
  },
  {
    id: "C",
    name: "Reserved Compartment",
    configured: false,
    active: false,
    category: null,
    moisture_channel: null,
    weight_channel: null,
    status: "RESERVED_FUTURE_USE",
    description: "Reserved for future hardware expansion — no active sensors assigned."
  }
];

// In-Memory Device State
let latestUnoTelemetry = null;
let lastUnoReceivedTime = null;

let latestEsp32Telemetry = null;
let lastEsp32ReceivedTime = null;

let latestTelemetry = null;
let lastReceivedTime = null;
let lastLidState = 'CLOSED';

// Command Queues for Hardware Dispatch
const unoCommandQueue = [];
const esp32CommandQueue = [];

// Monitoring Mode State
let monitoringMode = 'hardware';
let simulationStartedAt = null;
let simulationSessionId = null;

function getDevicesHealth() {
  const now = Date.now();

  // 1. Arduino Uno (Module A: Lid & Proximity)
  let unoStatus = 'DISCONNECTED';
  let unoElapsed = null;
  let unoConnected = false;
  if (lastUnoReceivedTime) {
    unoElapsed = Math.round(((now - lastUnoReceivedTime) / 1000) * 10) / 10;
    if (unoElapsed <= 5.0) {
      unoStatus = 'CONNECTED';
      unoConnected = true;
    } else if (unoElapsed <= 15.0) {
      unoStatus = 'STALE';
      unoConnected = false;
    } else {
      unoStatus = 'DISCONNECTED';
      unoConnected = false;
    }
  }

  // 2. ESP32 (Module B: 4 Sensor Channels)
  let espStatus = 'DISCONNECTED';
  let espElapsed = null;
  let espConnected = false;
  if (lastEsp32ReceivedTime) {
    espElapsed = Math.round(((now - lastEsp32ReceivedTime) / 1000) * 10) / 10;
    if (espElapsed <= 5.0) {
      espStatus = 'CONNECTED';
      espConnected = true;
    } else if (espElapsed <= 15.0) {
      espStatus = 'STALE';
      espConnected = false;
    } else {
      espStatus = 'DISCONNECTED';
      espConnected = false;
    }
  }

  let overall = 'ALL_OFFLINE';
  if (unoConnected && espConnected) overall = 'BOTH_CONNECTED';
  else if (unoConnected) overall = 'UNO_ONLY';
  else if (espConnected) overall = 'ESP32_ONLY';

  const espTelem = latestEsp32Telemetry || {};

  return {
    overall_status: overall,
    timestamp: new Date().toISOString(),
    uno: {
      device_id: (latestUnoTelemetry && latestUnoTelemetry.dev) || 'UNO-WS01',
      device_name: 'Arduino Uno (Proximity & Autonomous Lid)',
      status: unoStatus,
      connected: unoConnected,
      seconds_since_last_packet: unoElapsed,
      last_received_at: lastUnoReceivedTime ? new Date(lastUnoReceivedTime).toISOString() : null,
      uptime_seconds: (latestUnoTelemetry && latestUnoTelemetry.up) || 0,
      faults: (latestUnoTelemetry && latestUnoTelemetry.faults) || []
    },
    esp32: {
      device_id: espTelem.dev || 'ESP32-WS01',
      device_name: 'ESP32 Multi-Sensor Hub (C1, C2, LC1, LC2)',
      status: espStatus,
      connected: espConnected,
      seconds_since_last_packet: espElapsed,
      last_received_at: lastEsp32ReceivedTime ? new Date(lastEsp32ReceivedTime).toISOString() : null,
      uptime_seconds: espTelem.up || 0,
      channels: {
        c1: {
          ok: Boolean(espTelem.c1_ok !== undefined ? espTelem.c1_ok : espTelem.moist_ok),
          calibrated: Boolean(espTelem.c1_cal !== undefined ? espTelem.c1_cal : espTelem.moist_cal)
        },
        c2: {
          ok: Boolean(espTelem.c2_ok),
          calibrated: Boolean(espTelem.c2_cal)
        },
        lc1: {
          ok: Boolean(espTelem.lc1_ok !== undefined ? espTelem.lc1_ok : espTelem.weight_ok),
          calibrated: Boolean(espTelem.lc1_cal !== undefined ? espTelem.lc1_cal : espTelem.weight_cal)
        },
        lc2: {
          ok: Boolean(espTelem.lc2_ok),
          calibrated: Boolean(espTelem.lc2_cal)
        }
      },
      lid_sync_state: espTelem.lid_sync_state || 'UNKNOWN',
      lid_sync_fresh: Boolean(espTelem.lid_sync_fresh),
      faults: espTelem.faults || []
    }
  };
}

function getDeviceHealth() {
  const devices = getDevicesHealth();
  const connected = (devices.overall_status === 'BOTH_CONNECTED' || devices.overall_status === 'UNO_ONLY' || devices.overall_status === 'ESP32_ONLY');
  const status = (devices.overall_status === 'BOTH_CONNECTED') ? 'ONLINE' : (connected ? 'PARTIAL' : 'DISCONNECTED');

  return {
    status: status,
    connected: connected,
    overall_status: devices.overall_status,
    device_id: 'MULTI-MICROCONTROLLER',
    uno: devices.uno,
    esp32: devices.esp32,
    seconds_since_last_packet: devices.uno.seconds_since_last_packet !== null ? devices.uno.seconds_since_last_packet : devices.esp32.seconds_since_last_packet,
    uptime_seconds: Math.max(devices.uno.uptime_seconds, devices.esp32.uptime_seconds),
    last_received_at: lastReceivedTime ? new Date(lastReceivedTime).toISOString() : null
  };
}

function getCombinedTelemetry() {
  const health = getDevicesHealth();
  const now = new Date().toISOString();

  const uno = latestUnoTelemetry;
  const esp32 = latestEsp32Telemetry;

  const faultsSet = new Set();
  if (uno && Array.isArray(uno.faults)) uno.faults.forEach(f => faultsSet.add(f));
  if (esp32 && Array.isArray(esp32.faults)) esp32.faults.forEach(f => faultsSet.add(f));
  if (health.uno.status === 'DISCONNECTED') faultsSet.add('UNO_OFFLINE');
  if (health.esp32.status === 'DISCONNECTED') faultsSet.add('ESP32_OFFLINE');

  // Channel C1
  const c1Raw = esp32 ? (esp32.c1_raw !== undefined ? esp32.c1_raw : esp32.moist_raw) : null;
  const c1Pct = esp32 ? (esp32.c1_pct !== undefined ? esp32.c1_pct : esp32.moist_pct) : null;
  const c1Ok = esp32 ? Boolean(esp32.c1_ok !== undefined ? esp32.c1_ok : esp32.moist_ok) : false;
  const c1Cal = esp32 ? Boolean(esp32.c1_cal !== undefined ? esp32.c1_cal : esp32.moist_cal) : false;

  // Channel C2
  const c2Raw = esp32 ? (esp32.c2_raw !== undefined ? esp32.c2_raw : null) : null;
  const c2Pct = esp32 ? (esp32.c2_pct !== undefined ? esp32.c2_pct : null) : null;
  const c2Ok = esp32 ? Boolean(esp32.c2_ok) : false;
  const c2Cal = esp32 ? Boolean(esp32.c2_cal) : false;

  // Channel LC1
  const lc1G = esp32 ? (esp32.lc1_g !== undefined ? esp32.lc1_g : esp32.weight_g) : null;
  const lc1Raw = esp32 ? (esp32.lc1_raw !== undefined ? esp32.lc1_raw : esp32.weight_raw) : null;
  const lc1Ok = esp32 ? Boolean(esp32.lc1_ok !== undefined ? esp32.lc1_ok : esp32.weight_ok) : false;
  const lc1Cal = esp32 ? Boolean(esp32.lc1_cal !== undefined ? esp32.lc1_cal : esp32.weight_cal) : false;

  // Channel LC2
  const lc2G = esp32 ? (esp32.lc2_g !== undefined ? esp32.lc2_g : null) : null;
  const lc2Raw = esp32 ? (esp32.lc2_raw !== undefined ? esp32.lc2_raw : null) : null;
  const lc2Ok = esp32 ? Boolean(esp32.lc2_ok) : false;
  const lc2Cal = esp32 ? Boolean(esp32.lc2_cal) : false;

  // Total Measured Mass calculation across active compartments (LC1 + LC2)
  let totalWeightG = null;
  let totalWeightStatus = 'UNAVAILABLE';

  const isLc1Valid = (lc1G !== null && lc1G !== undefined && lc1Ok && lc1Cal);
  const isLc2Valid = (lc2G !== null && lc2G !== undefined && lc2Ok && lc2Cal);

  if (isLc1Valid && isLc2Valid) {
    totalWeightG = Math.round((lc1G + lc2G) * 10) / 10;
    totalWeightStatus = 'COMPLETE';
  } else if (isLc1Valid) {
    totalWeightG = Math.round(lc1G * 10) / 10;
    totalWeightStatus = 'PARTIAL (LC1 Only)';
  } else if (isLc2Valid) {
    totalWeightG = Math.round(lc2G * 10) / 10;
    totalWeightStatus = 'PARTIAL (LC2 Only)';
  } else {
    totalWeightG = null;
    totalWeightStatus = 'UNAVAILABLE';
  }

  return {
    v: 1,
    source: (monitoringMode === 'simulation') ? 'simulation' : 'hardware',
    timestamp: now,
    device_health: health,

    // Module A: Arduino Uno (Proximity & Autonomous Lid)
    dist_cm: uno ? uno.dist_cm : null,
    prox: uno ? Boolean(uno.prox) : false,
    lid_cmd: (uno && uno.lid_cmd) ? uno.lid_cmd : 'CLOSED',
    uno_stale: (health.uno.status !== 'CONNECTED'),
    uno_received_at: lastUnoReceivedTime ? new Date(lastUnoReceivedTime).toISOString() : null,
    uno_seq: uno ? uno.seq : null,
    uno_up: uno ? uno.up : 0,

    // Module B: ESP32 Independent Channels
    c1_raw: c1Raw,
    c1_pct: c1Pct,
    c1_ok: c1Ok,
    c1_cal: c1Cal,

    c2_raw: c2Raw,
    c2_pct: c2Pct,
    c2_ok: c2Ok,
    c2_cal: c2Cal,

    lc1_g: lc1G,
    lc1_raw: lc1Raw,
    lc1_ok: lc1Ok,
    lc1_cal: lc1Cal,

    lc2_g: lc2G,
    lc2_raw: lc2Raw,
    lc2_ok: lc2Ok,
    lc2_cal: lc2Cal,

    // Backward compatibility composite properties
    moist_raw: c1Raw,
    moist_pct: c1Pct,
    moist_ok: c1Ok,
    moist_cal: c1Cal,
    weight_g: lc1G,
    weight_raw: lc1Raw,
    weight_ok: lc1Ok,
    weight_cal: lc1Cal,

    // Total Measured Mass
    total_measured_weight_g: totalWeightG,
    total_weight_status: totalWeightStatus,

    // Three Compartments Representation
    compartments: {
      A: {
        id: "A",
        name: "Biodegradable Waste",
        configured: true,
        active: true,
        category: "BIODEGRADABLE",
        moisture_pct: c1Pct,
        moisture_raw: c1Raw,
        moisture_ok: c1Ok,
        moisture_cal: c1Cal,
        weight_g: lc1G,
        weight_raw: lc1Raw,
        weight_ok: lc1Ok,
        weight_cal: lc1Cal,
        status: (c1Ok && lc1Ok) ? 'HEALTHY' : 'WARNING'
      },
      B: {
        id: "B",
        name: "Non-Biodegradable Waste",
        configured: true,
        active: true,
        category: "NON_BIODEGRADABLE",
        moisture_pct: c2Pct,
        moisture_raw: c2Raw,
        moisture_ok: c2Ok,
        moisture_cal: c2Cal,
        weight_g: lc2G,
        weight_raw: lc2Raw,
        weight_ok: lc2Ok,
        weight_cal: lc2Cal,
        status: (c2Ok && lc2Ok) ? 'HEALTHY' : 'WARNING'
      },
      C: {
        id: "C",
        name: "Reserved / Future Use",
        configured: false,
        active: false,
        category: null,
        status: "NOT_CONFIGURED",
        moisture_pct: null,
        weight_g: null,
        note: "Reserved for future functionality — no sensors assigned"
      }
    },

    esp32_stale: (health.esp32.status !== 'CONNECTED'),
    esp32_received_at: lastEsp32ReceivedTime ? new Date(lastEsp32ReceivedTime).toISOString() : null,
    esp32_seq: esp32 ? esp32.seq : null,
    esp32_up: esp32 ? esp32.up : 0,

    faults: Array.from(faultsSet),
    raw_uno: uno,
    raw_esp32: esp32
  };
}

function ingestTelemetry(rec, explicitTarget = '') {
  const now = Date.now();
  rec.received_at = new Date(now).toISOString();

  let target = explicitTarget;
  if (!target) {
    const devStr = String(rec.dev || '').toUpperCase();
    if (devStr.includes('UNO')) target = 'uno';
    else if (devStr.includes('ESP32')) target = 'esp32';
    else if (rec.dist_cm !== undefined && rec.c1_raw === undefined && rec.moist_raw === undefined && rec.weight_raw === undefined) target = 'uno';
    else if (rec.c1_raw !== undefined || rec.moist_raw !== undefined || rec.lc1_raw !== undefined || rec.weight_raw !== undefined) target = 'esp32';
    else target = 'composite';
  }

  if (target === 'uno') {
    latestUnoTelemetry = rec;
    lastUnoReceivedTime = now;

    // Record verified lid transition events
    if (rec.lid_cmd && rec.lid_cmd !== lastLidState) {
      const ev = {
        timestamp: rec.received_at,
        device: rec.dev || 'UNO-WS01',
        previous_state: lastLidState,
        new_state: rec.lid_cmd,
        trigger: rec.prox ? 'PROXIMITY_DETECTED' : 'AUTO_TIMEOUT_OR_MANUAL',
        distance_cm: rec.dist_cm
      };
      fs.appendFileSync(LID_EVENTS_FILE, JSON.stringify(ev) + '\n');
      lastLidState = rec.lid_cmd;

      // Queue sync command to ESP32 so both boards stay coordinated
      esp32CommandQueue.push(JSON.stringify({
        cmd: "sync_lid",
        state: rec.lid_cmd,
        seq: rec.seq || 0,
        ts: now
      }));
    }
  } else if (target === 'esp32') {
    latestEsp32Telemetry = rec;
    lastEsp32ReceivedTime = now;
  } else {
    latestUnoTelemetry = rec;
    lastUnoReceivedTime = now;
    latestEsp32Telemetry = rec;
    lastEsp32ReceivedTime = now;
  }

  latestTelemetry = getCombinedTelemetry();
  lastReceivedTime = now;

  // Persist genuine hardware packets only
  if (monitoringMode === 'hardware') {
    fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(rec) + '\n');
  }

  return { success: true, target: target, seq: rec.seq };
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
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

    if (pathname === '/api/compartments' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ compartments: COMPARTMENTS_CONFIG }));
    } else if (pathname === '/api/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(getDeviceHealth()));
    } else if (pathname === '/api/devices/status' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(getDevicesHealth()));
    } else if (pathname === '/api/telemetry/combined' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(getCombinedTelemetry()));
    } else if (pathname === '/api/telemetry/latest' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        device_health: getDeviceHealth(),
        telemetry: getCombinedTelemetry()
      }));
    } else if (pathname === '/api/telemetry/uno' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const rec = JSON.parse(body);
          const result = ingestTelemetry(rec, 'uno');
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (pathname === '/api/telemetry/esp32' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const rec = JSON.parse(body);
          const result = ingestTelemetry(rec, 'esp32');
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (pathname === '/api/telemetry' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const rec = JSON.parse(body);
          const result = ingestTelemetry(rec, '');
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (pathname === '/api/cmd/uno' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const cmd = JSON.parse(body);
          unoCommandQueue.push(cmd);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, target: 'uno', command: cmd, status: 'QUEUED' }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (pathname === '/api/cmd/esp32' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const cmd = JSON.parse(body);
          esp32CommandQueue.push(cmd);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, target: 'esp32', command: cmd, status: 'QUEUED' }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (pathname === '/api/cmd/pending' && req.method === 'GET') {
      const dev = parsedUrl.searchParams.get('device');
      let cmds = [];
      if (dev === 'uno') {
        cmds = unoCommandQueue.splice(0, unoCommandQueue.length);
      } else if (dev === 'esp32') {
        cmds = esp32CommandQueue.splice(0, esp32CommandQueue.length);
      }
      res.writeHead(200);
      res.end(JSON.stringify({ device: dev, commands: cmds }));
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
    } else if (pathname === '/api/classification' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const rec = JSON.parse(body);
          rec.timestamp = new Date().toISOString();
          fs.appendFileSync(CATEGORIES_FILE, JSON.stringify(rec) + '\n');
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, record: rec }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (pathname === '/api/monitoring/mode' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        mode: monitoringMode,
        simulation_active: (monitoringMode === 'simulation'),
        session_id: simulationSessionId,
        started_at: simulationStartedAt,
        timestamp: new Date().toISOString()
      }));
    } else if (pathname === '/api/monitoring/mode' && (req.method === 'POST' || req.method === 'PUT')) {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const reqObj = JSON.parse(body);
          const newMode = (reqObj.mode || '').toLowerCase().trim();
          if (newMode === 'simulation' || newMode === 'hardware') {
            const prevMode = monitoringMode;
            monitoringMode = newMode;
            if (newMode === 'simulation') {
              if (!simulationStartedAt || prevMode !== 'simulation') {
                simulationStartedAt = new Date().toISOString();
                simulationSessionId = `SIM-${Math.floor(Date.now() / 1000)}`;
              }
            } else {
              simulationStartedAt = null;
              simulationSessionId = null;
            }
            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              mode: monitoringMode,
              previous_mode: prevMode,
              session_id: simulationSessionId,
              started_at: simulationStartedAt
            }));
          } else {
            res.writeHead(400);
            res.end(JSON.stringify({ success: false, error: "Invalid mode. Must be 'hardware' or 'simulation'." }));
          }
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
    } else if (pathname === '/api/simulation/status' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({
        simulation_enabled: (monitoringMode === 'simulation'),
        session_id: simulationSessionId,
        started_at: simulationStartedAt,
        scenarios_available: ['SCENARIO_A', 'SCENARIO_B', 'SCENARIO_C', 'SCENARIO_D', 'SCENARIO_E', 'SCENARIO_F'],
        default_interval_ms: 1000,
        hardware_isolated: true
      }));
    } else if (pathname.startsWith('/api/ml/')) {
      const mlUrl = `http://127.0.0.1:8000${pathname}${parsedUrl.search || ''}`;
      let postBody = '';
      req.on('data', chunk => { postBody += chunk; });
      req.on('end', () => {
        try {
          const urlObj = new URL(mlUrl);
          const proxyReq = http.request({
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname + urlObj.search,
            method: req.method,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postBody)
            },
            timeout: 2500
          }, (proxyRes) => {
            let data = '';
            proxyRes.on('data', c => { data += c; });
            proxyRes.on('end', () => {
              res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(data);
            });
          });
          proxyReq.on('error', (err) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              status: 'model_unavailable',
              message: 'Python ML service offline on port 8000',
              error: err.message
            }));
          });
          if (postBody) proxyReq.write(postBody);
          proxyReq.end();
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ status: 'model_unavailable', error: e.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }
    return;
  }

  // Static File Serving for Dashboard
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
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
  };

  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Node.js IoT Backend listening on http://localhost:${PORT}`);
});
