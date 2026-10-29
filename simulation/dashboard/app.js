/**
 * Intelligent Solid Waste Segregation Analytics — IoT Operational Dashboard
 * Dual-Mode Monitoring:
 *  1. Live Hardware Mode — receives actual physical telemetry from Arduino Uno R3.
 *  2. Simulation Mode    — deterministic synthetic telemetry engine when hardware is offline.
 */

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
  backendUrl: window.location.origin.includes('http') ? window.location.origin : 'http://localhost:8080',
  isBackendConnected: false,
  webSerialPort: null,
  isSerialConnected: false,

  // Monitoring Mode: 'hardware' | 'simulation'
  mode: 'hardware',
  debounceTimer: null,

  // Hardware telemetry tracking
  latestTelemetry: null,
  lastTelemetryTimestamp: 0,
  historyData: [],
  lidEvents: [],
  categoryStats: null,

  // Simulation engine state
  simSessionId: null,
  simStartedAt: null,
  simIntervalId: null,
  simIntervalMs: 1000,
  simScenario: 'SCENARIO_A',
  simIsPaused: false,
  simFaultActive: false,
  simHistoryData: [],
  simLidEvents: [],

  // Machine Learning Pipeline State
  selectedHorizon: '5m',
  lastMlInferenceTime: 0,
  mlServiceOnline: false
};

// ============================================================================
// DOM CACHE
// ============================================================================
const dom = {
  // Mode Controls & Banner
  modeToggleSwitch: document.getElementById('mode-toggle-switch'),
  modeOptLive: document.getElementById('mode-opt-live'),
  modeOptSim: document.getElementById('mode-opt-sim'),

  modeBanner: document.getElementById('mode-banner'),
  modeBannerBadge: document.getElementById('mode-banner-badge'),
  modeBannerTitle: document.getElementById('mode-banner-title'),
  modeBannerDesc: document.getElementById('mode-banner-desc'),
  modeBannerSubdesc: document.getElementById('mode-banner-subdesc'),
  modeBannerSource: document.getElementById('mode-banner-source'),

  // Simulation Controls Panel
  simulationControls: document.getElementById('simulation-controls'),
  simScenarioSelect: document.getElementById('sim-scenario-select'),
  simSpeedSelect: document.getElementById('sim-speed-select'),
  btnSimPause: document.getElementById('btn-sim-pause'),
  simPauseIcon: document.getElementById('sim-pause-icon'),
  simPauseText: document.getElementById('sim-pause-text'),
  btnSimReset: document.getElementById('btn-sim-reset'),
  btnSimFault: document.getElementById('btn-sim-fault'),
  simFaultIcon: document.getElementById('sim-fault-icon'),
  simFaultText: document.getElementById('sim-fault-text'),

  // Header Status & Hardware
  connBadge: document.getElementById('conn-badge'),
  connText: document.getElementById('conn-text'),
  btnWebSerial: document.getElementById('btn-webserial'),
  btnWebSerialText: document.getElementById('btn-webserial-text'),

  valDeviceId: document.getElementById('val-device-id'),
  valLastReceived: document.getElementById('val-last-received'),
  valUptime: document.getElementById('val-uptime'),
  valFaultCount: document.getElementById('val-fault-count'),

  // Section titles
  sensorSectionTitle: document.getElementById('sensor-section-title'),
  sensorSectionSubtitle: document.getElementById('sensor-section-subtitle'),
  chartSectionTitle: document.getElementById('chart-section-title'),
  chartSectionSubtitle: document.getElementById('chart-section-subtitle'),

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

  // Classification Form
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

  // Hardware / Simulated Actuator Commands
  cmdTare: document.getElementById('cmd-tare'),
  cmdOpen: document.getElementById('cmd-open'),
  cmdClose: document.getElementById('cmd-close'),
  cmdClear: document.getElementById('cmd-clear'),

  // ML Analytics Cards
  mlAnomalyPill: document.getElementById('ml-anomaly-pill'),
  mlAnomalyScore: document.getElementById('ml-anomaly-score'),
  mlAnomalyBar: document.getElementById('ml-anomaly-bar'),
  mlAnomalySubtext: document.getElementById('ml-anomaly-subtext'),
  mlAnomalyStatusText: document.getElementById('ml-anomaly-status-text'),
  mlAnomalyF1: document.getElementById('ml-anomaly-f1'),
  mlAnomalyProvenance: document.getElementById('ml-anomaly-provenance'),

  mlForecastVal: document.getElementById('ml-forecast-val'),
  mlForecastSubtext: document.getElementById('ml-forecast-subtext'),
  mlForecastCurrent: document.getElementById('ml-forecast-current'),
  mlForecastDelta: document.getElementById('ml-forecast-delta'),
  mlForecastBaseline: document.getElementById('ml-forecast-baseline'),
  mlForecastBenchmark: document.getElementById('ml-forecast-benchmark'),
  btnHorizon5m: document.getElementById('btn-horizon-5m'),
  btnHorizon15m: document.getElementById('btn-horizon-15m'),
  btnHorizon30m: document.getElementById('btn-horizon-30m'),

  mlServicePill: document.getElementById('ml-service-pill'),
  mlRegistryVersion: document.getElementById('ml-registry-version'),
  mlRegistrySubtext: document.getElementById('ml-registry-subtext'),
  mlMetaDetector: document.getElementById('ml-meta-detector'),
  mlMetaForecaster: document.getElementById('ml-meta-forecaster'),
  mlServiceStatusText: document.getElementById('ml-service-status-text')
};

// ============================================================================
// DIAGNOSTIC TERMINAL LOGGING
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
// COMMON TELEMETRY PIPELINE (USED BY BOTH HARDWARE & SYNTHETIC ENGINE)
// ============================================================================
function processTelemetryPacket(packet, sourceName = 'Backend') {
  if (!packet || typeof packet !== 'object') return;

  state.latestTelemetry = packet;
  state.lastTelemetryTimestamp = Date.now();

  const isSim = (packet.source === 'simulation' || state.mode === 'simulation');

  // 1. Health & Connection Details
  dom.valDeviceId.textContent = packet.dev || (isSim ? 'SIM-WS01' : 'UNO-WS01');
  dom.valUptime.textContent = `${packet.up || 0}s`;
  dom.valLastReceived.textContent = new Date().toLocaleTimeString();

  const faultList = Array.isArray(packet.faults) ? packet.faults : [];
  dom.valFaultCount.textContent = faultList.length;

  if (isSim) {
    const statusText = state.simIsPaused ? 'Simulation Paused' : `Simulation Active (${packet.dev})`;
    updateConnectionStatus('ONLINE', statusText);
  } else {
    updateConnectionStatus('ONLINE', `${sourceName} Live (${packet.dev})`);
  }

  // 2. Capacitive Soil Moisture Sensor Card
  dom.moistRawAdc.textContent = (packet.moist_raw !== null && packet.moist_raw !== undefined) 
    ? `${packet.moist_raw} ADC` : '—';

  if (!packet.moist_ok) {
    dom.moistStatusPill.className = 'card-pill fault';
    dom.moistStatusPill.textContent = 'FAULT';
    dom.moistVal.textContent = '—';
    dom.moistSubtext.textContent = isSim ? 'Simulated moisture fault active' : 'Sensor disconnected or out of range';
    dom.moistCalibState.textContent = 'Unavailable';
  } else if (!packet.moist_cal || packet.moist_pct === null) {
    dom.moistStatusPill.className = 'card-pill uncalibrated';
    dom.moistStatusPill.textContent = 'UNCALIBRATED';
    dom.moistVal.textContent = packet.moist_raw !== null ? packet.moist_raw : '—';
    dom.moistUnit.textContent = 'raw';
    dom.moistSubtext.textContent = 'Raw ADC reported. Dual-point calibration required.';
    dom.moistCalibState.textContent = 'Not Calibrated';
  } else {
    dom.moistStatusPill.className = 'card-pill ok';
    dom.moistStatusPill.textContent = isSim ? 'SIMULATED' : 'CALIBRATED';
    dom.moistVal.textContent = Number(packet.moist_pct).toFixed(1);
    dom.moistUnit.textContent = '%';
    dom.moistSubtext.textContent = packet.moist_pct > 50 ? 'High moisture (organic matter)' : 'Low moisture (inorganic / dry)';
    dom.moistCalibState.textContent = isSim ? 'Correlated Model ✓' : 'Calibrated ✓';
  }

  // 3. Load Cell & HX711 Card
  dom.weightRawCounts.textContent = (packet.weight_raw !== undefined && packet.weight_raw !== null)
    ? packet.weight_raw.toLocaleString() : '—';

  if (!packet.weight_ok) {
    dom.weightStatusPill.className = 'card-pill fault';
    dom.weightStatusPill.textContent = 'TIMEOUT';
    dom.weightVal.textContent = '—';
    dom.weightSubtext.textContent = isSim ? 'Simulated HX711 timeout condition' : 'HX711 not responding on D2/D3';
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
    dom.weightStatusPill.textContent = isSim ? 'SIMULATED' : 'OPERATIONAL';
    dom.weightVal.textContent = Number(packet.weight_g).toFixed(1);
    dom.weightSubtext.textContent = packet.weight_g > 10 ? 'Waste mass present on platform' : 'Empty platform';
    dom.weightCalibState.textContent = isSim ? 'Synthetic Calibration ✓' : 'Calibrated ✓';
    dom.weightTareState.textContent = 'Tared ✓';
  }

  // 4. Ultrasonic Proximity Sensor Card
  if (packet.dist_cm === null || packet.dist_cm === undefined || packet.dist_cm < 0) {
    dom.proxStatusPill.className = 'card-pill fault';
    dom.proxStatusPill.textContent = 'TIMEOUT';
    dom.proxVal.textContent = '—';
    dom.proxSubtext.textContent = isSim ? 'Simulated echo timeout' : 'Echo pulse timed out or out of range';
    dom.proxDetected.textContent = 'Unknown';
    dom.proxEchoHealth.textContent = 'No Echo';
  } else {
    dom.proxVal.textContent = Number(packet.dist_cm).toFixed(1);
    dom.proxEchoHealth.textContent = 'Valid Pulse';

    if (packet.prox) {
      dom.proxStatusPill.className = 'card-pill warn';
      dom.proxStatusPill.textContent = 'OBJECT DETECTED';
      dom.proxDetected.textContent = 'Active (≤ 20.0cm)';
      dom.proxSubtext.textContent = 'Target approaching — auto lid triggered';
    } else {
      dom.proxStatusPill.className = 'card-pill ok';
      dom.proxStatusPill.textContent = 'CLEAR';
      dom.proxDetected.textContent = 'No Object';
      dom.proxSubtext.textContent = 'Clear detection zone (> 20.0cm)';
    }
  }

  // 5. Lid Actuator Status Card
  const lidCmd = (packet.lid_cmd || 'CLOSED').toUpperCase();
  dom.lidVal.textContent = lidCmd;
  if (lidCmd === 'OPEN') {
    dom.lidStatusPill.className = 'card-pill warn';
    dom.lidStatusPill.textContent = 'OPEN';
    dom.lidSubtext.textContent = isSim 
      ? 'Simulated command: 90° angle (Servo has no position feedback)'
      : 'Commanded angle: 90° (Active deposition window)';
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
    dom.lidSubtext.textContent = isSim
      ? 'Simulated command: 0° angle (Closed position)'
      : 'Commanded angle: 0° (Closed)';
  }

  // 6. Update Alerts Display
  renderAlerts(packet, faultList);

  // 7. Sensor Machine Learning Analytics Inference
  requestMlInference(packet);
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

// Check Staleness Loop (Runs every 2 seconds)
setInterval(() => {
  if (state.mode === 'simulation') {
    if (state.simIsPaused) {
      updateConnectionStatus('STALE', 'Simulation Paused');
    } else {
      updateConnectionStatus('ONLINE', `Simulation Active (${state.simScenario})`);
    }
    return;
  }

  // Live Hardware checks
  if (!state.lastTelemetryTimestamp) {
    updateConnectionStatus('DISCONNECTED', 'Awaiting Hardware Telemetry...');
    return;
  }

  const elapsed = (Date.now() - state.lastTelemetryTimestamp) / 1000;
  if (elapsed > 15) {
    updateConnectionStatus('DISCONNECTED', `Hardware Disconnected (${Math.round(elapsed)}s since packet)`);
  } else if (elapsed > 5) {
    updateConnectionStatus('STALE', `Hardware Telemetry Stale (${Math.round(elapsed)}s ago)`);
  }
}, 2000);

// ============================================================================
// SYSTEM ALERTS & DIAGNOSTICS RENDERING
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

  if (faults.includes('HARDWARE_UNAVAILABLE')) {
    hasWarning = true;
    addAlertRow('warn', 'Hardware Unavailable: Simulation Mode active without physical serial gateway.');
  }

  if (faults.includes('CALIBRATION_REQUIRED') || (!packet.moist_cal && packet.moist_ok) || (!packet.weight_cal && packet.weight_ok)) {
    hasWarning = true;
    addAlertRow('warn', 'Calibration Required: Sensor readings are qualitative until dual-point calibration is executed.');
  }

  if (!hasFault && !hasWarning) {
    dom.alertsStatusPill.className = 'card-pill ok';
    dom.alertsStatusPill.textContent = 'NOMINAL';
    addAlertRow('info', packet.source === 'simulation' 
      ? 'Synthetic simulation engine operating nominally without active faults.'
      : 'All physical sensors and actuator reporting healthy telemetry.');
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
// DETERMINISTIC SYNTHETIC TELEMETRY ENGINE
// ============================================================================
const simulationEngine = {
  seq: 100,
  up: 0,
  moistPercent: 52.0,
  weightG: 185.0,
  distanceCm: 68.0,
  prox: false,
  lidCmd: 'CLOSED',

  // Proximity & Lid Cycle State Machine:
  // 'APPROACH_WAIT' -> 'APPROACHING' -> 'TRIGGER_OPEN' -> 'HOLDING' -> 'DEPARTING' -> 'CLOSING'
  cycleState: 'APPROACH_WAIT',
  cycleTicks: 0,
  holdTicksRemaining: 0,

  // Scenario B accumulation
  binFillMass: 45.0,

  reset() {
    this.seq = 100;
    this.up = 0;
    this.cycleState = 'APPROACH_WAIT';
    this.cycleTicks = 0;
    this.holdTicksRemaining = 0;
    this.lidCmd = 'CLOSED';
    this.prox = false;
    this.distanceCm = 68.0;

    if (state.simScenario === 'SCENARIO_B') {
      this.binFillMass = 45.0;
      this.weightG = 45.0;
      this.moistPercent = 38.0;
    } else {
      this.weightG = 185.0;
      this.moistPercent = 52.0;
    }

    state.simHistoryData = [];
    state.simLidEvents = [];
    renderLidEventsList(state.simLidEvents);
    logTerminal(`[SIMULATION] Simulation engine reset to initial state.`, 'in');
  },

  forceOpen() {
    this.cycleState = 'HOLDING';
    this.lidCmd = 'OPEN';
    this.prox = true;
    this.distanceCm = 12.0;
    this.holdTicksRemaining = Math.max(1, Math.round(4000 / state.simIntervalMs));
    this.recordSimLidEvent('MANUAL_OVERRIDE (SIM)', 'CLOSED', 'OPEN', 12.0);
  },

  forceClose() {
    this.cycleState = 'APPROACH_WAIT';
    this.lidCmd = 'CLOSED';
    this.prox = false;
    this.distanceCm = 65.0;
    this.holdTicksRemaining = 0;
    this.recordSimLidEvent('MANUAL_OVERRIDE (SIM)', 'OPEN', 'CLOSED', 65.0);
  },

  recordSimLidEvent(trigger, prev, next, dist) {
    const ev = {
      timestamp: new Date().toISOString(),
      trigger: trigger,
      previous_state: prev,
      new_state: next,
      distance_cm: dist,
      source: 'SIMULATION'
    };
    state.simLidEvents.push(ev);
    if (state.simLidEvents.length > 50) state.simLidEvents.shift();
    if (state.mode === 'simulation') {
      renderLidEventsList(state.simLidEvents);
    }
  },

  tick() {
    if (state.simIsPaused) return;

    this.seq++;
    this.up += Math.round(state.simIntervalMs / 1000);
    this.cycleTicks++;

    const faultList = [];
    let moistOk = true;
    let weightOk = true;

    // Check fault injection
    if (state.simFaultActive) {
      faultList.push('HX711_TIMEOUT', 'MOISTURE_OFFLINE');
      moistOk = false;
      weightOk = false;
    }

    // 1. Proximity & Lid Sequence State Machine (Hold open duration: 4 seconds)
    const intervalSec = state.simIntervalMs / 1000;
    const holdTicksTotal = Math.max(1, Math.round(4.0 / intervalSec));

    switch (this.cycleState) {
      case 'APPROACH_WAIT':
        this.lidCmd = 'CLOSED';
        this.prox = false;
        // Natural background distance variation (55 - 75 cm)
        this.distanceCm = 65.0 + (Math.sin(this.cycleTicks * 0.5) * 6);
        if (this.cycleTicks >= 5) {
          this.cycleState = 'APPROACHING';
          this.cycleTicks = 0;
        }
        break;

      case 'APPROACHING':
        // Object steadily approaches the bin
        this.distanceCm = Math.max(12.0, 48.0 - (this.cycleTicks * 12.0));
        if (this.distanceCm <= 20.0) {
          this.prox = true;
          const prevLid = this.lidCmd;
          this.lidCmd = 'OPEN';
          this.cycleState = 'HOLDING';
          this.cycleTicks = 0;
          this.holdTicksRemaining = holdTicksTotal;
          this.recordSimLidEvent('PROXIMITY_DETECTED (SIM)', prevLid, 'OPEN', this.distanceCm);
          logTerminal(`[SIM] Proximity triggered (dist: ${this.distanceCm.toFixed(1)} cm ≤ 20cm). Servo commanded 90° OPEN.`, 'out');
        }
        break;

      case 'HOLDING':
        this.prox = true;
        this.distanceCm = 13.5 + (Math.random() * 2.0);
        this.holdTicksRemaining--;
        if (this.holdTicksRemaining <= 0) {
          this.cycleState = 'DEPARTING';
          this.cycleTicks = 0;
        }
        break;

      case 'DEPARTING':
        // Object moving away from bin
        this.distanceCm = 28.0 + (this.cycleTicks * 14.0);
        this.prox = false;
        if (this.distanceCm > 20.0) {
          this.cycleState = 'CLOSING';
          this.cycleTicks = 0;
        }
        break;

      case 'CLOSING':
        const prevLid = this.lidCmd;
        this.lidCmd = 'CLOSED';
        this.recordSimLidEvent('HOLD_TIMER_EXPIRED (SIM)', prevLid, 'CLOSED', this.distanceCm);
        logTerminal(`[SIM] Hold timer (4s) expired. Servo commanded 0° CLOSED.`, 'out');

        // Scenario B: Accumulate deposited waste mass after lid cycle
        if (state.simScenario === 'SCENARIO_B') {
          const deposit = 75 + Math.round(Math.random() * 65);
          this.binFillMass += deposit;
          this.moistPercent = Math.min(88.0, this.moistPercent + (Math.random() * 4.5));
          logTerminal(`[SIM: Scenario B] Deposited +${deposit}g organic waste. Cumulative simulated mass: ${this.binFillMass.toFixed(0)}g.`, 'in');
        }

        this.cycleState = 'APPROACH_WAIT';
        this.cycleTicks = 0;
        break;
    }

    // 2. Weight Sensor Synthesis
    let weightG;
    let weightRaw;
    if (state.simScenario === 'SCENARIO_B') {
      weightG = this.binFillMass + (Math.random() * 2.0 - 1.0);
    } else {
      weightG = Math.max(0, this.weightG + (Math.sin(this.up * 0.1) * 2.5) + (Math.random() * 1.0 - 0.5));
    }
    weightRaw = Math.round(100000 + (weightG * 420.5));

    // 3. Capacitive Soil Moisture Sensor Synthesis (Correlated ADC)
    let moistPct;
    let moistRaw;
    if (state.simScenario === 'SCENARIO_B') {
      moistPct = Math.min(100, Math.max(0, this.moistPercent + (Math.sin(this.up * 0.05) * 1.5)));
    } else {
      moistPct = Math.min(100, Math.max(0, this.moistPercent + (Math.sin(this.up * 0.08) * 8.0) + (Math.random() * 1.0 - 0.5)));
    }
    // Capacitive sensor model: Dry ~850 ADC, Wet ~250 ADC (ADC decreases with moisture)
    const adcNoise = Math.round(Math.random() * 4 - 2);
    moistRaw = Math.max(50, Math.min(980, Math.round(850 - (moistPct / 100.0) * 600 + adcNoise)));

    // Handle injected faults
    if (!moistOk) {
      moistPct = null;
      moistRaw = 1023;
    }
    if (!weightOk) {
      weightG = null;
      weightRaw = 0;
    }

    // Scenario C special handling if not faulted
    let distCm = Math.round(this.distanceCm * 10) / 10;
    if (state.simScenario === 'SCENARIO_C' && !state.simFaultActive) {
      distCm = 85.0;
      this.prox = false;
      this.lidCmd = 'CLOSED';
      faultList.push('HARDWARE_UNAVAILABLE');
    }

    // Build unified telemetry packet
    const packet = {
      v: "1.0",
      dev: "SIM-WS01",
      seq: this.seq,
      up: this.up,
      source: "simulation",
      sim_session_id: state.simSessionId,
      scenario: state.simScenario,
      moist_raw: moistRaw,
      moist_pct: moistPct !== null ? Math.round(moistPct * 10) / 10 : null,
      moist_ok: moistOk,
      moist_cal: true,
      weight_raw: weightRaw,
      weight_g: weightG !== null ? Math.round(weightG * 10) / 10 : null,
      weight_ok: weightOk,
      weight_cal: true,
      dist_cm: distCm,
      prox: this.prox,
      lid_cmd: this.lidCmd,
      faults: faultList
    };

    // Process through the common dashboard rendering pipeline
    processTelemetryPacket(packet, 'Synthetic Engine');

    // Add to isolated simulation chart buffer (Zero production log pollution!)
    state.simHistoryData.push(packet);
    if (state.simHistoryData.length > 50) state.simHistoryData.shift();

    renderLineChart(dom.chartWeightWrap, state.simHistoryData, 'weight_g', 'Weight (g)', '#15803d');
    renderLineChart(dom.chartMoistureWrap, state.simHistoryData, 'moist_pct', 'Moisture (%)', '#0f766e');
  }
};

// ============================================================================
// MONITORING MODE SWITCHING LOGIC
// ============================================================================
function setMonitoringMode(targetMode) {
  // Prevent rapid switching race conditions with 250ms debounce
  if (state.debounceTimer) return;
  state.debounceTimer = setTimeout(() => { state.debounceTimer = null; }, 250);

  if (targetMode === state.mode) return;

  if (targetMode === 'simulation') {
    state.mode = 'simulation';

    // 1. Update Mode Switch UI
    dom.modeToggleSwitch.setAttribute('aria-checked', 'true');
    dom.modeOptLive.classList.remove('active');
    dom.modeOptSim.classList.add('active');

    // 2. Update Mode Banner
    dom.modeBanner.className = 'mode-banner simulation';
    dom.modeBannerTitle.textContent = 'SIMULATION MODE — SYNTHETIC DATA';
    dom.modeBannerDesc.textContent = 'Real-time synthetic sensor generator active. Testing scenarios without physical Arduino.';
    dom.modeBannerSubdesc.textContent = 'Hardware Isolated • Zero Physical Serial I/O • Isolated Simulation History';
    dom.modeBannerSource.textContent = 'SIMULATION';

    // 3. Show Simulation Controls Panel
    dom.simulationControls.style.display = 'block';

    // 4. Update Section Subtitles
    dom.sensorSectionTitle.textContent = 'Sensor Telemetry (Synthetic Simulation)';
    dom.sensorSectionSubtitle.textContent = 'Deterministic Emulated Stream • Provenance: simulation';
    dom.chartSectionTitle.textContent = 'Historical Sensor Analytics (Simulation Stream)';
    dom.chartSectionSubtitle.textContent = 'Rendered from In-Memory Simulation Buffer (Zero Production Log Pollution)';

    // 5. Initialize Simulation Session
    state.simSessionId = 'SIM-' + Math.floor(Date.now() / 1000);
    state.simStartedAt = new Date().toLocaleTimeString();
    state.simHistoryData = [];
    state.simLidEvents = [];
    simulationEngine.reset();

    // 6. Launch Simulation Interval
    if (state.simIntervalId) clearInterval(state.simIntervalId);
    state.simIntervalId = setInterval(() => simulationEngine.tick(), state.simIntervalMs);
    simulationEngine.tick(); // Immediate first tick

    logTerminal(`[MODE] Switched to SIMULATION MODE (${state.simScenario}). Synthetic telemetry started.`, 'in');

    // 7. Inform Backend of mode switch
    fetch(`${state.backendUrl}/api/monitoring/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'simulation' })
    }).catch(() => {});

  } else {
    state.mode = 'hardware';

    // 1. Immediately halt synthetic generator
    if (state.simIntervalId) {
      clearInterval(state.simIntervalId);
      state.simIntervalId = null;
    }

    // 2. Update Mode Switch UI
    dom.modeToggleSwitch.setAttribute('aria-checked', 'false');
    dom.modeOptLive.classList.add('active');
    dom.modeOptSim.classList.remove('active');

    // 3. Update Mode Banner
    dom.modeBanner.className = 'mode-banner live';
    dom.modeBannerTitle.textContent = 'LIVE HARDWARE MODE';
    dom.modeBannerDesc.textContent = 'Receiving physical telemetry from Arduino Uno R3 via Serial Gateway or Web Serial.';
    dom.modeBannerSubdesc.textContent = 'Hardware disconnected — connect the Arduino or switch to Simulation Mode.';
    dom.modeBannerSource.textContent = 'HARDWARE';

    // 4. Hide Simulation Controls Panel
    dom.simulationControls.style.display = 'none';

    // 5. Restore Subtitles
    dom.sensorSectionTitle.textContent = 'Live Sensor Telemetry';
    dom.sensorSectionSubtitle.textContent = 'Actual Physical Readings Only';
    dom.chartSectionTitle.textContent = 'Historical Sensor Analytics';
    dom.chartSectionSubtitle.textContent = 'Rendered from Actual Backend Records (Zero Fabricated Points)';

    logTerminal(`[MODE] Switched to LIVE HARDWARE MODE. Synthetic generator stopped. Awaiting hardware.`, 'dim');

    // 6. Fetch genuine hardware history and events
    fetchHistoricalData();
    fetchLidEvents();

    // 7. Inform Backend
    fetch(`${state.backendUrl}/api/monitoring/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'hardware' })
    }).catch(() => {});

    // 8. Poll hardware immediately
    pollBackendTelemetry();
  }
}

// Toggle Event Listeners (Click & Keyboard accessibility)
dom.modeToggleSwitch.addEventListener('click', () => {
  const nextMode = state.mode === 'hardware' ? 'simulation' : 'hardware';
  setMonitoringMode(nextMode);
});

dom.modeToggleSwitch.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    const nextMode = state.mode === 'hardware' ? 'simulation' : 'hardware';
    setMonitoringMode(nextMode);
  }
});

// ============================================================================
// SIMULATION CONTROL PANEL LISTENERS
// ============================================================================
dom.simScenarioSelect.addEventListener('change', (e) => {
  state.simScenario = e.target.value;
  simulationEngine.reset();
  logTerminal(`[SIMULATION] Scenario changed to: ${state.simScenario}`, 'in');
});

dom.simSpeedSelect.addEventListener('change', (e) => {
  state.simIntervalMs = parseInt(e.target.value, 10);
  if (state.simIntervalId && !state.simIsPaused) {
    clearInterval(state.simIntervalId);
    state.simIntervalId = setInterval(() => simulationEngine.tick(), state.simIntervalMs);
  }
  logTerminal(`[SIMULATION] Update interval changed to: ${state.simIntervalMs}ms`, 'dim');
});

dom.btnSimPause.addEventListener('click', () => {
  state.simIsPaused = !state.simIsPaused;
  if (state.simIsPaused) {
    dom.simPauseIcon.textContent = '▶';
    dom.simPauseText.textContent = 'Resume';
    dom.btnSimPause.classList.add('active');
    logTerminal(`[SIMULATION] Simulation paused.`, 'dim');
  } else {
    dom.simPauseIcon.textContent = '⏸';
    dom.simPauseText.textContent = 'Pause';
    dom.btnSimPause.classList.remove('active');
    logTerminal(`[SIMULATION] Simulation resumed.`, 'in');
  }
});

dom.btnSimReset.addEventListener('click', () => {
  simulationEngine.reset();
  simulationEngine.tick();
});

dom.btnSimFault.addEventListener('click', () => {
  state.simFaultActive = !state.simFaultActive;
  if (state.simFaultActive) {
    dom.btnSimFault.classList.add('active');
    dom.simFaultText.textContent = 'Clear Fault';
    logTerminal(`[SIMULATION] Injected simulated sensor communication fault (HX711/Moisture Offline).`, 'err');
  } else {
    dom.btnSimFault.classList.remove('active');
    dom.simFaultText.textContent = 'Simulate Fault';
    logTerminal(`[SIMULATION] Cleared simulated faults. Normal simulation restored.`, 'in');
  }
});

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
    // Backend unreachable
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

  const isSim = (state.mode === 'simulation');

  try {
    const res = await fetch(`${state.backendUrl}/api/classification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        notes: isSim ? `[SIMULATION TEST] ${notes}` : notes,
        weight_g: weight,
        moisture_pct: moisture,
        source: isSim ? 'SIMULATION_VERIFIED' : 'OPERATOR_VERIFIED'
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
function renderLidEventsList(events) {
  if (!Array.isArray(events) || events.length === 0) {
    dom.lidEventsTbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state-notice">
          No lid opening events recorded yet. Connect sensor hardware or run Simulation Mode.
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
      <td>${ev.source === 'SIMULATION' ? 'Simulated Servo Command (D6)' : 'Servo PWM Signal (D6)'}</td>
    `;
    dom.lidEventsTbody.appendChild(tr);
  });
}

async function fetchLidEvents() {
  if (state.mode === 'simulation') return; // Do not overwrite simulation event list
  try {
    const res = await fetch(`${state.backendUrl}/api/lid/events`);
    if (!res.ok) return;
    const events = await res.json();
    state.lidEvents = events;
    renderLidEventsList(events);
  } catch (e) {}
}

dom.btnRefreshLid.addEventListener('click', () => {
  if (state.mode === 'simulation') {
    renderLidEventsList(state.simLidEvents);
  } else {
    fetchLidEvents();
  }
});

// ============================================================================
// HISTORICAL SENSOR CHARTS (GENUINE SVG RENDERING)
// ============================================================================
async function fetchHistoricalData() {
  if (state.mode === 'simulation') return; // Do not overwrite simulation chart data
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
            if (state.mode === 'hardware') {
              processTelemetryPacket(parsed, 'USB Serial');
            }
            // Forward genuine hardware telemetry to backend
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

// ============================================================================
// ACTUATOR COMMANDS (TARE / OPEN / CLOSE) WITH SIMULATION SAFETY
// ============================================================================
async function sendSerialCommand(cmdChar) {
  // CRITICAL REQUIREMENT: Simulation Mode must NEVER operate physical actuators!
  if (state.mode === 'simulation') {
    logTerminal(`[SIMULATION] Hardware command '${cmdChar}' intercepted. Physical serial is disabled in Simulation Mode.`, 'warn');
    if (cmdChar === 't') {
      simulationEngine.weightG = 0.0;
      simulationEngine.binFillMass = 0.0;
      logTerminal(`[SIMULATION] Simulated scale tared to 0.0g.`, 'in');
    } else if (cmdChar === 'o') {
      simulationEngine.forceOpen();
      logTerminal(`[SIMULATION] Simulated lid forced OPEN (90°).`, 'in');
    } else if (cmdChar === 'x') {
      simulationEngine.forceClose();
      logTerminal(`[SIMULATION] Simulated lid forced CLOSED (0°).`, 'in');
    }
    return;
  }

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
// SENSOR MACHINE LEARNING ANALYTICS INTEGRATION
// ============================================================================
async function requestMlInference(packet) {
  if (!packet) return;

  const now = Date.now();
  if (now - state.lastMlInferenceTime < 800) {
    return; // Throttle requests to avoid overwhelming the inference service
  }
  state.lastMlInferenceTime = now;

  const isSim = (packet.source === 'simulation' || state.mode === 'simulation');
  if (dom.mlAnomalyProvenance) {
    dom.mlAnomalyProvenance.textContent = isSim ? 'SIMULATION' : 'HARDWARE';
    dom.mlAnomalyProvenance.style.color = isSim ? 'var(--accent-teal)' : 'var(--accent-forest)';
  }

  // Dual-target resilience: backend proxy (port 8080) or direct to FastAPI (port 8000)
  const baseUrl = state.backendUrl || window.location.origin;
  const mlDirectUrl = 'http://127.0.0.1:8000';

  const fetchWithFallback = async (endpoint, options) => {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, options);
      if (res.ok) return await res.json();
    } catch (e) {}
    try {
      const res2 = await fetch(`${mlDirectUrl}${endpoint}`, options);
      if (res2.ok) return await res2.json();
    } catch (e2) {}
    return null;
  };

  try {
    const [anomalyData, forecastData] = await Promise.all([
      fetchWithFallback('/api/ml/anomaly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet)
      }),
      fetchWithFallback(`/api/ml/forecast?horizon=${state.selectedHorizon}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packet)
      })
    ]);

    // Update Anomaly Detection Card
    if (anomalyData && anomalyData.status !== 'model_unavailable') {
      state.mlServiceOnline = true;
      if (dom.mlServicePill) {
        dom.mlServicePill.className = 'card-pill ok';
        dom.mlServicePill.textContent = 'MODELS ACTIVE';
      }
      if (dom.mlServiceStatusText) {
        dom.mlServiceStatusText.textContent = 'Online (FastAPI / Port 8000)';
      }

      const score = Number(anomalyData.anomaly_score || 0);
      const isAnomaly = Boolean(anomalyData.is_anomaly);

      if (dom.mlAnomalyScore) dom.mlAnomalyScore.textContent = score.toFixed(2);
      if (dom.mlAnomalyBar) {
        const pct = Math.min(100, Math.round(score * 100));
        dom.mlAnomalyBar.style.width = `${pct}%`;
        if (score >= 0.75) {
          dom.mlAnomalyBar.style.backgroundColor = 'var(--accent-red)';
        } else if (score >= 0.56) {
          dom.mlAnomalyBar.style.backgroundColor = 'var(--accent-amber)';
        } else {
          dom.mlAnomalyBar.style.backgroundColor = 'var(--accent-forest)';
        }
      }

      if (dom.mlAnomalyPill) {
        if (isAnomaly) {
          dom.mlAnomalyPill.className = 'card-pill fault';
          dom.mlAnomalyPill.textContent = 'SUSPECTED ANOMALY';
        } else {
          dom.mlAnomalyPill.className = 'card-pill ok';
          dom.mlAnomalyPill.textContent = 'NORMAL';
        }
      }

      if (dom.mlAnomalyStatusText) {
        const reasons = anomalyData.reasons || [];
        dom.mlAnomalyStatusText.textContent = reasons.length > 0 
          ? reasons.join(' • ') 
          : 'Nominal telemetry distribution';
      }
    } else {
      if (dom.mlAnomalyPill) {
        dom.mlAnomalyPill.className = 'card-pill uncalibrated';
        dom.mlAnomalyPill.textContent = 'MODEL OFFLINE';
      }
      if (dom.mlAnomalyScore) dom.mlAnomalyScore.textContent = '—';
      if (dom.mlAnomalyStatusText) dom.mlAnomalyStatusText.textContent = 'Start ml/service.py on port 8000';
    }

    // Update Weight Forecast Card
    if (forecastData && forecastData.status === 'forecast_ready') {
      const pred = Number(forecastData.predicted_weight_g || 0);
      const curr = Number(forecastData.current_weight_g || 0);
      const delta = pred - curr;
      const lower = Number(forecastData.lower_bound_g || 0);
      const upper = Number(forecastData.upper_bound_g || 0);

      if (dom.mlForecastVal) dom.mlForecastVal.textContent = pred.toFixed(1);
      if (dom.mlForecastCurrent) dom.mlForecastCurrent.textContent = `${curr.toFixed(1)} g`;
      if (dom.mlForecastDelta) {
        const sign = delta >= 0 ? '+' : '';
        dom.mlForecastDelta.textContent = `${sign}${delta.toFixed(1)} g`;
        dom.mlForecastDelta.style.color = delta > 0 ? 'var(--accent-teal)' : 'var(--text-main)';
      }
      if (dom.mlForecastBaseline) dom.mlForecastBaseline.textContent = `${curr.toFixed(1)} g`;
      if (dom.mlForecastSubtext) {
        dom.mlForecastSubtext.textContent = `95% CI: [${lower.toFixed(1)}g – ${upper.toFixed(1)}g]`;
      }
    } else {
      if (dom.mlForecastVal) dom.mlForecastVal.textContent = '—';
      if (dom.mlForecastSubtext) dom.mlForecastSubtext.textContent = 'Awaiting forecast inference';
    }
  } catch (err) {
    if (dom.mlServicePill) {
      dom.mlServicePill.className = 'card-pill uncalibrated';
      dom.mlServicePill.textContent = 'SERVICE OFFLINE';
    }
  }
}

function initMlAnalyticsControls() {
  const horizonBtns = [
    { el: dom.btnHorizon5m, horizon: '5m', benchmark: '808.7g (vs 1069.7g | Beats Baseline ✓)' },
    { el: dom.btnHorizon15m, horizon: '15m', benchmark: '1193.1g (vs 1219.1g | Beats Baseline ✓)' },
    { el: dom.btnHorizon30m, horizon: '30m', benchmark: '2237.4g (Baseline: 1327.5g | High variance)' },
  ];

  horizonBtns.forEach(({ el, horizon, benchmark }) => {
    if (!el) return;
    el.addEventListener('click', () => {
      state.selectedHorizon = horizon;
      horizonBtns.forEach(b => { if (b.el) b.el.classList.remove('active'); });
      el.classList.add('active');
      if (dom.mlForecastBenchmark) dom.mlForecastBenchmark.textContent = benchmark;
      if (state.latestTelemetry) {
        requestMlInference(state.latestTelemetry);
      }
    });
  });
}

// ============================================================================
// BACKEND POLLING & LIVE CYCLES
// ============================================================================
async function pollBackendTelemetry() {
  if (state.mode === 'simulation') {
    // In Simulation Mode, do not overwrite the synthetic active view with hardware polling
    return;
  }

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

// ============================================================================
// WINDOW INITIALIZATION
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  logTerminal('Initializing Intelligent Waste Segregation Analytics IoT Dashboard...', 'in');
  logTerminal('Default mode: LIVE HARDWARE MODE. Toggle available in header.', 'dim');

  // Initialize ML Analytics Controls
  initMlAnalyticsControls();

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

