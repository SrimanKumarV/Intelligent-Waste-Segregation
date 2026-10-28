/**
 * Intelligent Solid Waste Segregation Analytics — IoT Operational Dashboard
 * Strictly data-driven. Zero simulated measurements, zero artificial presets.
 */

// Application State
const state = {
  backendUrl: window.location.origin.includes('http') ? window.location.origin : 'http://localhost:8080',
  isBackendConnected: false,
  webSerialPort: null,
  isSerialConnected: false,
  latestTelemetry: null,
  lastTelemetryTimestamp: 0,
  historyData: [],
  lidEvents: [],
  categoryStats: null
};

// DOM Cache
const dom = {
  connBadge: document.getElementById('conn-badge'),
  connText: document.getElementById('conn-text'),
  btnWebSerial: document.getElementById('btn-webserial'),
  btnWebSerialText: document.getElementById('btn-webserial-text'),

  valDeviceId: document.getElementById('val-device-id'),
  valLastReceived: document.getElementById('val-last-received'),
  valUptime: document.getElementById('val-uptime'),
  valFaultCount: document.getElementById('val-fault-count'),

  // Moisture Card
  moistStatusPill: document.getElementById('moist-status-pill'),
  moistVal: document.getElementById('moist-val'),
  moistUnit: document.getElementById('moist-unit'),
  moistSubtext: document.getElementById('moist-subtext'),
  moistRawAdc: document.getElementById('moist-raw-adc'),
  moistCalibState: document.getElementById('moist-calib-state'),

  // Weight Card
  weightStatusPill: document.getElementById('weight-status-pill'),
  weightVal: document.getElementById('weight-val'),
  weightSubtext: document.getElementById('weight-subtext'),
  weightRawCounts: document.getElementById('weight-raw-counts'),
  weightCalibState: document.getElementById('weight-calib-state'),
  weightTareState: document.getElementById('weight-tare-state'),

  // Proximity Card
  proxStatusPill: document.getElementById('prox-status-pill'),
  proxVal: document.getElementById('prox-val'),
  proxSubtext: document.getElementById('prox-subtext'),
  proxDetected: document.getElementById('prox-detected'),
  proxEchoHealth: document.getElementById('prox-echo-health'),

  // Lid Card
  lidStatusPill: document.getElementById('lid-status-pill'),
  lidVal: document.getElementById('lid-val'),
  lidSubtext: document.getElementById('lid-subtext'),

  // Two Categories
  catBioCount: document.getElementById('cat-bio-count'),
  catBioPct: document.getElementById('cat-bio-pct'),
  catBioWeight: document.getElementById('cat-bio-weight'),
  catBioBar: document.getElementById('cat-bio-bar'),

  catNonbioCount: document.getElementById('cat-nonbio-count'),
  catNonbioPct: document.getElementById('cat-nonbio-pct'),
  catNonbioWeight: document.getElementById('cat-nonbio-weight'),
  catNonbioBar: document.getElementById('cat-nonbio-bar'),

  // Form
  selectCategory: document.getElementById('select-category'),
  inputItemNotes: document.getElementById('input-item-notes'),
  btnSubmitClassification: document.getElementById('btn-submit-classification'),

  // Lid Table
  lidEventsTbody: document.getElementById('lid-events-tbody'),
  btnRefreshLid: document.getElementById('btn-refresh-lid'),

  // Charts
  chartWeightWrap: document.getElementById('chart-weight-wrap'),
  chartMoistureWrap: document.getElementById('chart-moisture-wrap'),

  // Alerts & Terminal
  alertsStatusPill: document.getElementById('alerts-status-pill'),
  alertsContainer: document.getElementById('alerts-container'),
  terminalStream: document.getElementById('terminal-stream'),

  // Commands
  cmdTare: document.getElementById('cmd-tare'),
  cmdOpen: document.getElementById('cmd-open'),
  cmdClose: document.getElementById('cmd-close'),
  cmdClear: document.getElementById('cmd-clear')
};

// ============================================================================
// LOGGING TO DIAGNOSTIC CONSOLE
// ============================================================================
function logTerminal(message, type = 'dim') {
  if (!dom.terminalStream) return;
  const line = document.createElement('div');
  line.className = `terminal-line ${type}`;
  const now = new Date().toLocaleTimeString();
  line.textContent = `[${now}] ${message}`;
  dom.terminalStream.appendChild(line);
  dom.terminalStream.scrollTop = dom.terminalStream.scrollHeight;
}

// ============================================================================
// TELEMETRY PACKET PARSING & UI UPDATE
// ============================================================================
function processTelemetryPacket(packet, sourceName = 'Backend') {
  if (!packet || typeof packet !== 'object') return;

  state.latestTelemetry = packet;
  state.lastTelemetryTimestamp = Date.now();

  // 1. Health & Connection Details
  dom.valDeviceId.textContent = packet.dev || 'UNO-WS01';
  dom.valUptime.textContent = `${packet.up || 0}s`;
  dom.valLastReceived.textContent = new Date().toLocaleTimeString();

  const faultList = Array.isArray(packet.faults) ? packet.faults : [];
  dom.valFaultCount.textContent = faultList.length;

  updateConnectionStatus('ONLINE', `${sourceName} Live (${packet.dev})`);

  // 2. Capacitive Soil Moisture Sensor Card
  dom.moistRawAdc.textContent = `${packet.moist_raw} ADC`;

  if (!packet.moist_ok) {
    dom.moistStatusPill.className = 'card-pill fault';
    dom.moistStatusPill.textContent = 'FAULT';
    dom.moistVal.textContent = '—';
    dom.moistSubtext.textContent = 'Sensor disconnected or out of range';
    dom.moistCalibState.textContent = 'Unavailable';
  } else if (!packet.moist_cal || packet.moist_pct === null) {
    dom.moistStatusPill.className = 'card-pill uncalibrated';
    dom.moistStatusPill.textContent = 'UNCALIBRATED';
    dom.moistVal.textContent = packet.moist_raw;
    dom.moistUnit.textContent = 'raw';
    dom.moistSubtext.textContent = 'Raw ADC reported. Dual-point calibration required.';
    dom.moistCalibState.textContent = 'Not Calibrated';
  } else {
    dom.moistStatusPill.className = 'card-pill ok';
    dom.moistStatusPill.textContent = 'CALIBRATED';
    dom.moistVal.textContent = Number(packet.moist_pct).toFixed(1);
    dom.moistUnit.textContent = '%';
    dom.moistSubtext.textContent = packet.moist_pct > 50 ? 'High moisture (organic)' : 'Low moisture (dry)';
    dom.moistCalibState.textContent = 'Calibrated ✓';
  }

  // 3. Load Cell & HX711 Card
  dom.weightRawCounts.textContent = packet.weight_raw !== undefined ? packet.weight_raw.toLocaleString() : '—';

  if (!packet.weight_ok) {
    dom.weightStatusPill.className = 'card-pill fault';
    dom.weightStatusPill.textContent = 'TIMEOUT';
    dom.weightVal.textContent = '—';
    dom.weightSubtext.textContent = 'HX711 not responding on D2/D3';
    dom.weightCalibState.textContent = 'Communication Error';
    dom.weightTareState.textContent = 'Offline';
  } else if (!packet.weight_cal || packet.weight_g === null) {
    dom.weightStatusPill.className = 'card-pill uncalibrated';
    dom.weightStatusPill.textContent = 'UNCALIBRATED';
    dom.weightVal.textContent = '—';
    dom.weightSubtext.textContent = 'Calibration required with reference mass';
    dom.weightCalibState.textContent = 'Required';
    dom.weightTareState.textContent = 'Initialized';
  } else {
    dom.weightStatusPill.className = 'card-pill ok';
    dom.weightStatusPill.textContent = 'OPERATIONAL';
    dom.weightVal.textContent = Number(packet.weight_g).toFixed(1);
    dom.weightSubtext.textContent = packet.weight_g > 10 ? 'Waste mass present' : 'Empty platform';
    dom.weightCalibState.textContent = 'Calibrated ✓';
    dom.weightTareState.textContent = 'Tared ✓';
  }

  // 4. Ultrasonic Proximity Card
  if (packet.dist_cm === null || packet.dist_cm === undefined || packet.dist_cm < 0) {
    dom.proxStatusPill.className = 'card-pill fault';
    dom.proxStatusPill.textContent = 'TIMEOUT';
    dom.proxVal.textContent = '—';
    dom.proxSubtext.textContent = 'Echo pulse timed out or out of range';
    dom.proxDetected.textContent = 'Unknown';
    dom.proxEchoHealth.textContent = 'No Echo';
  } else {
    dom.proxVal.textContent = Number(packet.dist_cm).toFixed(1);
    dom.proxEchoHealth.textContent = 'Valid Pulse';

    if (packet.prox) {
      dom.proxStatusPill.className = 'card-pill warn';
      dom.proxStatusPill.textContent = 'OBJECT DETECTED';
      dom.proxDetected.textContent = 'Active (≤ 20cm)';
      dom.proxSubtext.textContent = 'Target approaching — auto lid triggered';
    } else {
      dom.proxStatusPill.className = 'card-pill ok';
      dom.proxStatusPill.textContent = 'CLEAR';
      dom.proxDetected.textContent = 'No Object';
      dom.proxSubtext.textContent = 'Clear zone (> 20cm)';
    }
  }

  // 5. Lid Actuator Status Card
  const lidCmd = (packet.lid_cmd || 'CLOSED').toUpperCase();
  dom.lidVal.textContent = lidCmd;
  if (lidCmd === 'OPEN') {
    dom.lidStatusPill.className = 'card-pill warn';
    dom.lidStatusPill.textContent = 'OPEN';
    dom.lidSubtext.textContent = 'Commanded angle: 90° (Active deposition window)';
  } else if (lidCmd === 'OPENING') {
    dom.lidStatusPill.className = 'card-pill warn';
    dom.lidStatusPill.textContent = 'OPENING';
    dom.lidSubtext.textContent = 'Servo moving to open position';
  } else if (lidCmd === 'CLOSING') {
    dom.lidStatusPill.className = 'card-pill ok';
    dom.lidStatusPill.textContent = 'CLOSING';
    dom.lidSubtext.textContent = 'Hold timer expired; servo returning to 0°';
  } else {
    dom.lidStatusPill.className = 'card-pill ok';
    dom.lidStatusPill.textContent = 'CLOSED';
    dom.lidSubtext.textContent = 'Commanded angle: 0° (Closed)';
  }

  // 6. Update Alerts Display
  renderAlerts(packet, faultList);
}

// ============================================================================
// CONNECTION STATUS BADGE MANAGEMENT
// ============================================================================
function updateConnectionStatus(status, text) {
  dom.connBadge.className = 'badge-status';
  if (status === 'ONLINE') {
    dom.connBadge.classList.add('online');
    dom.connText.textContent = text || 'Live Telemetry';
  } else if (status === 'STALE') {
    dom.connBadge.classList.add('stale');
    dom.connText.textContent = text || 'Telemetry Stale (>5s)';
  } else if (status === 'DISCONNECTED') {
    dom.connBadge.classList.add('offline');
    dom.connText.textContent = text || 'Hardware Disconnected';
  } else {
    dom.connBadge.classList.add('connecting');
    dom.connText.textContent = text || 'Connecting...';
  }
}

// Check Staleness Loop
setInterval(() => {
  if (!state.lastTelemetryTimestamp) return;
  const elapsed = (Date.now() - state.lastTelemetryTimestamp) / 1000;

  if (elapsed > 15) {
    updateConnectionStatus('DISCONNECTED', `Disconnected (${Math.round(elapsed)}s since packet)`);
  } else if (elapsed > 5) {
    updateConnectionStatus('STALE', `Telemetry Stale (${Math.round(elapsed)}s ago)`);
  }
}, 2000);

// ============================================================================
// SYSTEM ALERTS RENDERING
// ============================================================================
function renderAlerts(packet, faults) {
  dom.alertsContainer.innerHTML = '';

  let hasFault = false;
  let hasWarning = false;

  if (faults.includes('HX711_TIMEOUT')) {
    hasFault = true;
    addAlertRow('fault', 'HX711 Load Cell Timeout: No response from amplifier on digital pins D2/D3.');
  }

  if (faults.includes('MOISTURE_OFFLINE')) {
    hasFault = true;
    addAlertRow('fault', 'Moisture Sensor Disconnected: Analog reading on A0 outside valid limits (50–980).');
  }

  if (faults.includes('ULTRASONIC_TIMEOUT')) {
    hasWarning = true;
    addAlertRow('warn', 'HC-SR04 Echo Timeout: Ultrasonic sensor echo missed or out of range (>200cm).');
  }

  if (faults.includes('CALIBRATION_REQUIRED') || !packet.moist_cal || !packet.weight_cal) {
    hasWarning = true;
    addAlertRow('warn', 'Calibration Required: Sensor readings are qualitative until dual-point calibration is executed.');
  }

  if (!hasFault && !hasWarning) {
    dom.alertsStatusPill.className = 'card-pill ok';
    dom.alertsStatusPill.textContent = 'NOMINAL';
    addAlertRow('info', 'All sensors and actuator reporting healthy physical telemetry.');
  } else if (hasFault) {
    dom.alertsStatusPill.className = 'card-pill fault';
    dom.alertsStatusPill.textContent = 'FAULT DETECTED';
  } else {
    dom.alertsStatusPill.className = 'card-pill warn';
    dom.alertsStatusPill.textContent = 'WARNING';
  }
}

function addAlertRow(type, text) {
  const row = document.createElement('div');
  row.className = `alert-row ${type}`;
  const icon = type === 'fault' ? '⚠' : (type === 'warn' ? '⚡' : '✓');
  row.innerHTML = `<span style="font-weight: bold;">${icon}</span><span>${text}</span>`;
  dom.alertsContainer.appendChild(row);
}

// ============================================================================
// DUAL WASTE CATEGORIES FETCH & UPDATE
// ============================================================================
async function fetchCategoryStats() {
  try {
    const res = await fetch(`${state.backendUrl}/api/categories`);
    if (!res.ok) return;
    const data = await res.json();
    state.categoryStats = data;

    const bio = data.biodegradable || { count: 0, percentage: 0, total_weight_grams: 0 };
    const nonbio = data.non_biodegradable || { count: 0, percentage: 0, total_weight_grams: 0 };

    dom.catBioCount.textContent = bio.count;
    dom.catBioPct.textContent = `${bio.percentage}%`;
    dom.catBioWeight.textContent = `${(bio.total_weight_grams / 1000).toFixed(2)} kg`;
    dom.catBioBar.style.width = `${bio.percentage}%`;

    dom.catNonbioCount.textContent = nonbio.count;
    dom.catNonbioPct.textContent = `${nonbio.percentage}%`;
    dom.catNonbioWeight.textContent = `${(nonbio.total_weight_grams / 1000).toFixed(2)} kg`;
    dom.catNonbioBar.style.width = `${nonbio.percentage}%`;
  } catch (err) {
    // Backend offline or unreachable
  }
}

// Classification Entry Form Submit
dom.btnSubmitClassification.addEventListener('click', async () => {
  const category = dom.selectCategory.value;
  const notes = dom.inputItemNotes.value.trim();

  const weight = (state.latestTelemetry && state.latestTelemetry.weight_g !== null)
    ? state.latestTelemetry.weight_g : 0;
  const moisture = (state.latestTelemetry && state.latestTelemetry.moist_pct !== null)
    ? state.latestTelemetry.moist_pct : null;

  try {
    const res = await fetch(`${state.backendUrl}/api/classification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        notes,
        weight_g: weight,
        moisture_pct: moisture,
        source: 'OPERATOR_VERIFIED'
      })
    });

    if (res.ok) {
      logTerminal(`✓ Verified classification recorded: ${category} (${notes || 'No description'})`, 'in');
      dom.inputItemNotes.value = '';
      fetchCategoryStats();
    } else {
      logTerminal(`Error submitting classification: ${res.statusText}`, 'err');
    }
  } catch (err) {
    logTerminal(`Failed to reach backend for classification logging: ${err.message}`, 'err');
  }
});

// ============================================================================
// LID ACTIVITY LOG FETCH & RENDER
// ============================================================================
async function fetchLidEvents() {
  try {
    const res = await fetch(`${state.backendUrl}/api/lid/events`);
    if (!res.ok) return;
    const events = await res.json();
    state.lidEvents = events;

    if (!Array.isArray(events) || events.length === 0) {
      dom.lidEventsTbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state-notice">
            No lid opening events recorded yet. Connect sensor hardware to monitor proximity detections.
          </td>
        </tr>`;
      return;
    }

    dom.lidEventsTbody.innerHTML = '';
    // Reverse to display newest first
    events.slice().reverse().forEach(ev => {
      const tr = document.createElement('tr');
      const timeStr = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '—';
      const isOpening = ev.new_state === 'OPEN' || ev.new_state === 'OPENING';
      const badgeClass = isOpening ? 'open' : 'closed';

      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-size: 0.8rem;">${timeStr}</td>
        <td>${ev.trigger || 'PROXIMITY'}</td>
        <td style="font-family: var(--font-mono);">${ev.distance_cm ? Number(ev.distance_cm).toFixed(1) + ' cm' : '—'}</td>
        <td>${ev.previous_state || 'CLOSED'} ➔ <span class="pill-badge ${badgeClass}">${ev.new_state}</span></td>
        <td>Servo PWM Signal (D6)</td>
      `;
      dom.lidEventsTbody.appendChild(tr);
    });
  } catch (e) {}
}

dom.btnRefreshLid.addEventListener('click', fetchLidEvents);

// ============================================================================
// HISTORICAL SENSOR CHARTS (GENUINE SVG RENDERING)
// ============================================================================
async function fetchHistoricalData() {
  try {
    const res = await fetch(`${state.backendUrl}/api/telemetry/history`);
    if (!res.ok) return;
    const history = await res.json();
    state.historyData = history;

    renderLineChart(dom.chartWeightWrap, history, 'weight_g', 'Weight (g)', '#15803d');
    renderLineChart(dom.chartMoistureWrap, history, 'moist_pct', 'Moisture (%)', '#0f766e');
  } catch (e) {}
}

function renderLineChart(container, records, field, label, strokeColor) {
  // Filter for records with genuine numerical readings
  const validPoints = records.filter(r => r && r[field] !== null && typeof r[field] === 'number');

  if (validPoints.length < 2) {
    container.innerHTML = `<span class="chart-empty-text">No historical ${label.toLowerCase()} records available</span>`;
    return;
  }

  const width = container.clientWidth || 450;
  const height = 200;
  const padding = 35;

  const values = validPoints.map(p => p[field]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = (maxVal - minVal) === 0 ? 1 : (maxVal - minVal);

  const pointsStr = validPoints.map((p, idx) => {
    const x = padding + (idx / (validPoints.length - 1)) * (width - 2 * padding);
    const y = (height - padding) - ((p[field] - minVal) / range) * (height - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  container.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
      <!-- Grid lines -->
      <line x1="${padding}" y1="${padding}" x2="${width - padding}" y2="${padding}" stroke="#e2e8f0" stroke-dasharray="3,3" />
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#e2e8f0" />
      
      <!-- Axis Labels -->
      <text x="${padding}" y="${padding - 8}" font-size="10" fill="#94a3b8" font-family="var(--font-mono)">${maxVal.toFixed(1)}</text>
      <text x="${padding}" y="${height - padding + 15}" font-size="10" fill="#94a3b8" font-family="var(--font-mono)">${minVal.toFixed(1)}</text>
      <text x="${width - padding}" y="${height - padding + 15}" font-size="10" fill="#94a3b8" text-anchor="end" font-family="var(--font-mono)">${validPoints.length} Samples</text>

      <!-- Polyline -->
      <polyline fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${pointsStr}" />
    </svg>
  `;
}

// ============================================================================
// DIRECT WEB SERIAL API (BROWSER USB TO ARDUINO UNO)
// ============================================================================
async function initDirectWebSerial() {
  if (!('serial' in navigator)) {
    alert('Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.');
    return;
  }

  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    state.webSerialPort = port;
    state.isSerialConnected = true;

    dom.btnWebSerialText.textContent = 'Disconnect USB';
    dom.btnWebSerial.classList.add('primary');
    logTerminal('✓ Opened direct USB connection to Arduino Uno (115200 baud)', 'in');

    readSerialStream(port);
  } catch (err) {
    logTerminal(`Web Serial connection cancelled or failed: ${err.message}`, 'err');
  }
}

async function readSerialStream(port) {
  const textDecoder = new TextDecoderStream();
  port.readable.pipeTo(textDecoder.writable);
  const reader = textDecoder.readable.getReader();

  let lineBuffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      lineBuffer += value;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop(); // Keep uncompleted fragment

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed);
            processTelemetryPacket(parsed, 'USB Serial');

            // Forward to local backend if running
            forwardTelemetryToBackend(trimmed);
          } catch (jsonErr) {
            logTerminal(`Malformed JSON Line: ${trimmed}`, 'err');
          }
        } else {
          logTerminal(`[UNO] ${trimmed}`, 'dim');
        }
      }
    }
  } catch (err) {
    logTerminal(`Serial read loop error: ${err.message}`, 'err');
  } finally {
    reader.releaseLock();
  }
}

async function forwardTelemetryToBackend(rawJson) {
  try {
    await fetch(`${state.backendUrl}/api/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawJson
    });
  } catch (e) {
    // Backend offline is non-fatal when running direct WebSerial
  }
}

async function sendSerialCommand(cmdChar) {
  logTerminal(`Sending command '${cmdChar}' to Arduino Uno...`, 'out');

  // Option 1: Direct Web Serial
  if (state.webSerialPort && state.webSerialPort.writable) {
    try {
      const writer = state.webSerialPort.writable.getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(cmdChar + '\n'));
      writer.releaseLock();
      logTerminal(`✓ Sent command '${cmdChar}' directly over USB.`, 'in');
      return;
    } catch (e) {
      logTerminal(`Direct USB command failed: ${e.message}`, 'err');
    }
  }

  // Option 2: Forward through Backend API
  try {
    const res = await fetch(`${state.backendUrl}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmdChar })
    });
    if (res.ok) {
      logTerminal(`✓ Queued command '${cmdChar}' via Backend.`, 'in');
    }
  } catch (err) {
    logTerminal(`Command dispatch failed: ${err.message}`, 'err');
  }
}

// Attach Event Listeners
dom.btnWebSerial.addEventListener('click', () => {
  if (state.isSerialConnected && state.webSerialPort) {
    state.webSerialPort.close();
    state.isSerialConnected = false;
    dom.btnWebSerialText.textContent = 'Direct USB (Web Serial)';
    dom.btnWebSerial.classList.remove('primary');
    logTerminal('Closed USB connection.', 'dim');
  } else {
    initDirectWebSerial();
  }
});

dom.cmdTare.addEventListener('click', () => sendSerialCommand('t'));
dom.cmdOpen.addEventListener('click', () => sendSerialCommand('o'));
dom.cmdClose.addEventListener('click', () => sendSerialCommand('x'));
dom.cmdClear.addEventListener('click', () => { dom.terminalStream.innerHTML = ''; });

// ============================================================================
// BACKEND POLLING & LIVE CYCLES
// ============================================================================
async function pollBackendTelemetry() {
  try {
    const res = await fetch(`${state.backendUrl}/api/telemetry/latest`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    state.isBackendConnected = true;

    if (data && data.telemetry) {
      processTelemetryPacket(data.telemetry, 'Backend API');
    } else {
      updateConnectionStatus('DISCONNECTED', 'Backend Connected • Awaiting Arduino Packet');
    }
  } catch (err) {
    state.isBackendConnected = false;
    if (!state.isSerialConnected) {
      updateConnectionStatus('DISCONNECTED', 'Backend Offline • Connect Gateway or Direct USB');
    }
  }
}

// Window Initialization
window.addEventListener('DOMContentLoaded', () => {
  logTerminal('Initializing Intelligent Waste Segregation Analytics IoT Dashboard...', 'in');

  // Initial Polls
  pollBackendTelemetry();
  fetchCategoryStats();
  fetchLidEvents();
  fetchHistoricalData();

  // Polling Intervals
  setInterval(pollBackendTelemetry, 1000);
  setInterval(fetchCategoryStats, 5000);
  setInterval(fetchLidEvents, 5000);
  setInterval(fetchHistoricalData, 10000);
});
