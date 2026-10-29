/**
 * Intelligent Solid Waste Segregation Analytics — IoT Operational Dashboard
 * Multi-Microcontroller Architecture (Arduino Uno & ESP32)
 *
 * Two-Page Modular Experience:
 *   Page 1: Overview Dashboard — Clean, high-level environmental metrics & alerts
 *   Page 2: Technical Operations — Detailed diagnostics, 4-channel telemetry & calibration
 *
 * Dual Mode Monitoring:
 *   - Live Hardware Mode: Genuine multi-device telemetry from Uno & ESP32
 *   - Simulation Mode: Isolated synthetic engine (4 channels, 2 active bins, Bin 3 reserved)
 */

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
  backendUrl: window.location.origin.includes('http') ? window.location.origin : 'http://localhost:8080',
  isBackendConnected: false,
  webSerialPort: null,
  isSerialConnected: false,

  // Active View Tab: 'overview' | 'operations'
  activeTab: 'overview',

  // Monitoring Mode: 'hardware' | 'simulation'
  mode: 'hardware',

  // Device Telemetry State
  unoTelemetry: null,
  lastUnoTimestamp: 0,
  esp32Telemetry: null,
  lastEsp32Timestamp: 0,
  latestTelemetry: null,
  lastTelemetryTimestamp: 0,

  deviceHealth: {
    overall_status: 'ALL_OFFLINE',
    uno: { status: 'DISCONNECTED', connected: false },
    esp32: { status: 'DISCONNECTED', connected: false }
  },

  // Telemetry History for SVG Charts
  historyData: [],
  lidEvents: [],

  // Simulation Engine State
  simSessionId: null,
  simStartedAt: null,
  simIntervalId: null,
  simIntervalMs: 1000,
  simScenario: 'SCENARIO_A',
  simIsPaused: false,
  simFaultActive: false,
  simSeqUno: 100,
  simSeqEsp: 100,
  simLc1Weight: 350.0,
  simLc2Weight: 220.0,
  simC1Moist: 65.0,
  simC2Moist: 18.0,

  // ML Pipeline Cache
  mlAnomalyResult: null,
  mlForecastResult: null,
  mlClassifyResult: null,
  mlServiceOnline: false,
  lastMlInferenceTime: 0
};

// ============================================================================
// DOM ELEMENTS CACHE
// ============================================================================
const dom = {
  // Navigation Tabs
  tabOverview: document.getElementById('tab-overview'),
  tabOperations: document.getElementById('tab-operations'),
  viewOverview: document.getElementById('view-overview'),
  viewOperations: document.getElementById('view-operations'),

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

  // Header Status Badges
  unoConnBadge: document.getElementById('uno-conn-badge'),
  unoConnText: document.getElementById('uno-conn-text'),
  espConnBadge: document.getElementById('esp-conn-badge'),
  espConnText: document.getElementById('esp-conn-text'),
  btnWebSerial: document.getElementById('btn-webserial'),
  btnWebSerialText: document.getElementById('btn-webserial-text'),

  // Overview Summary Metrics
  valTotalWeight: document.getElementById('val-total-weight'),
  unitTotalWeight: document.getElementById('unit-total-weight'),
  subTotalWeight: document.getElementById('sub-total-weight'),
  valSummaryLid: document.getElementById('val-summary-lid'),
  subSummaryLid: document.getElementById('sub-summary-lid'),
  valSummaryDevices: document.getElementById('val-summary-devices'),
  subSummaryDevices: document.getElementById('sub-summary-devices'),
  valSummaryWarnings: document.getElementById('val-summary-warnings'),
  subSummaryWarnings: document.getElementById('sub-summary-warnings'),
  valSummaryLastUpdate: document.getElementById('val-summary-last-update'),
  subSummaryUpdate: document.getElementById('sub-summary-update'),

  // Device Health Cards (Overview)
  unoHealthPill: document.getElementById('uno-health-pill'),
  unoStateDesc: document.getElementById('uno-state-desc'),
  unoDistDesc: document.getElementById('uno-dist-desc'),
  unoProxDesc: document.getElementById('uno-prox-desc'),
  unoLidDesc: document.getElementById('uno-lid-desc'),
  unoLastSeen: document.getElementById('uno-last-seen'),

  esp32HealthPill: document.getElementById('esp32-health-pill'),
  esp32StateDesc: document.getElementById('esp32-state-desc'),
  esp32MoistHealth: document.getElementById('esp32-moist-health'),
  esp32MassHealth: document.getElementById('esp32-mass-health'),
  esp32CalibSummary: document.getElementById('esp32-calib-summary'),
  esp32LastSeen: document.getElementById('esp32-last-seen'),

  // Compartment Cards (Overview)
  compAStatusPill: document.getElementById('comp-a-status-pill'),
  compAMoistVal: document.getElementById('comp-a-moist-val'),
  compAMoistDesc: document.getElementById('comp-a-moist-desc'),
  compAWeightVal: document.getElementById('comp-a-weight-val'),
  compAWeightDesc: document.getElementById('comp-a-weight-desc'),
  compAHealth: document.getElementById('comp-a-health'),
  compACalib: document.getElementById('comp-a-calib'),
  compATrend: document.getElementById('comp-a-trend'),

  compBStatusPill: document.getElementById('comp-b-status-pill'),
  compBMoistVal: document.getElementById('comp-b-moist-val'),
  compBMoistDesc: document.getElementById('comp-b-moist-desc'),
  compBWeightVal: document.getElementById('comp-b-weight-val'),
  compBWeightDesc: document.getElementById('comp-b-weight-desc'),
  compBHealth: document.getElementById('comp-b-health'),
  compBCalib: document.getElementById('comp-b-calib'),
  compBTrend: document.getElementById('comp-b-trend'),

  compCStatusPill: document.getElementById('comp-c-status-pill'),

  // Overview Charts & Insights
  chartWeightWrap: document.getElementById('chart-weight-wrap'),
  chartMoistureWrap: document.getElementById('chart-moisture-wrap'),
  overviewAlertsPill: document.getElementById('overview-alerts-pill'),
  overviewAlertsList: document.getElementById('overview-alerts-list'),
  mlInsightPill: document.getElementById('ml-insight-pill'),
  mlPlainSummary: document.getElementById('ml-plain-summary'),
  mlInsightProvenance: document.getElementById('ml-insight-provenance'),
  overviewLidEventsTbody: document.getElementById('overview-lid-events-tbody'),
  btnRefreshLidOverview: document.getElementById('btn-refresh-lid-overview'),

  // Technical Operations: Panel A (Devices)
  opUnoPill: document.getElementById('op-uno-pill'),
  opUnoDev: document.getElementById('op-uno-dev'),
  opUnoElapsed: document.getElementById('op-uno-elapsed'),
  opUnoSeqUp: document.getElementById('op-uno-seq-up'),
  opUnoDistProx: document.getElementById('op-uno-dist-prox'),
  opUnoLidCmd: document.getElementById('op-uno-lid-cmd'),
  opUnoFaults: document.getElementById('op-uno-faults'),
  opUnoLcd: document.getElementById('op-uno-lcd'),
  opUnoRawPacket: document.getElementById('op-uno-raw-packet'),

  opEspPill: document.getElementById('op-esp-pill'),
  opEspDev: document.getElementById('op-esp-dev'),
  opEspElapsed: document.getElementById('op-esp-elapsed'),
  opEspSeqUp: document.getElementById('op-esp-seq-up'),
  opEspChansStatus: document.getElementById('op-esp-chans-status'),
  opEspCalibNvs: document.getElementById('op-esp-calib-nvs'),
  opEspLidSync: document.getElementById('op-esp-lid-sync'),
  opEspLcd: document.getElementById('op-esp-lcd'),
  opEspRawPacket: document.getElementById('op-esp-raw-packet'),

  // Technical Operations: Panel B (Four Channels)
  c1Pill: document.getElementById('c1-pill'),
  c1PctVal: document.getElementById('c1-pct-val'),
  c1Desc: document.getElementById('c1-desc'),
  c1RawVal: document.getElementById('c1-raw-val'),
  c1AirRef: document.getElementById('c1-air-ref'),
  c1WaterRef: document.getElementById('c1-water-ref'),
  c1HealthText: document.getElementById('c1-health-text'),

  c2Pill: document.getElementById('c2-pill'),
  c2PctVal: document.getElementById('c2-pct-val'),
  c2Desc: document.getElementById('c2-desc'),
  c2RawVal: document.getElementById('c2-raw-val'),
  c2AirRef: document.getElementById('c2-air-ref'),
  c2WaterRef: document.getElementById('c2-water-ref'),
  c2HealthText: document.getElementById('c2-health-text'),

  lc1Pill: document.getElementById('lc1-pill'),
  lc1GVal: document.getElementById('lc1-g-val'),
  lc1Desc: document.getElementById('lc1-desc'),
  lc1RawVal: document.getElementById('lc1-raw-val'),
  lc1FactorVal: document.getElementById('lc1-factor-val'),
  lc1TareVal: document.getElementById('lc1-tare-val'),
  lc1HealthText: document.getElementById('lc1-health-text'),

  lc2Pill: document.getElementById('lc2-pill'),
  lc2GVal: document.getElementById('lc2-g-val'),
  lc2Desc: document.getElementById('lc2-desc'),
  lc2RawVal: document.getElementById('lc2-raw-val'),
  lc2FactorVal: document.getElementById('lc2-factor-val'),
  lc2TareVal: document.getElementById('lc2-tare-val'),
  lc2HealthText: document.getElementById('lc2-health-text'),

  // Technical Operations: Panel C (Lid Diagnostics)
  opLidStatePill: document.getElementById('op-lid-state-pill'),
  opLidAngle: document.getElementById('op-lid-angle'),
  opSyncStatusPill: document.getElementById('op-sync-status-pill'),
  opSyncUnoState: document.getElementById('op-sync-uno-state'),
  opSyncEspState: document.getElementById('op-sync-esp-state'),

  // Technical Operations: Panel D (Controls & Calibration)
  btnCmdOpen: document.getElementById('btn-cmd-open'),
  btnCmdClose: document.getElementById('btn-cmd-close'),
  btnCmdUnoStatus: document.getElementById('btn-cmd-uno-status'),
  unoCmdStatus: document.getElementById('uno-cmd-status'),

  btnTareLc1: document.getElementById('btn-tare-lc1'),
  inputRefLc1: document.getElementById('input-ref-lc1'),
  btnCalLc1: document.getElementById('btn-cal-lc1'),
  btnTareLc2: document.getElementById('btn-tare-lc2'),
  inputRefLc2: document.getElementById('input-ref-lc2'),
  btnCalLc2: document.getElementById('btn-cal-lc2'),
  btnCalC1Dry: document.getElementById('btn-cal-c1-dry'),
  btnCalC1Wet: document.getElementById('btn-cal-c1-wet'),
  btnCalC2Dry: document.getElementById('btn-cal-c2-dry'),
  btnCalC2Wet: document.getElementById('btn-cal-c2-wet'),
  esp32CmdStatus: document.getElementById('esp32-cmd-status'),
  terminalStream: document.getElementById('terminal-stream'),
  cmdClear: document.getElementById('cmd-clear'),

  // Technical Operations: Panel F (ML & Diagnostics)
  opMlAnomPill: document.getElementById('op-ml-anom-pill'),
  opMlAnomScore: document.getElementById('op-ml-anom-score'),
  opMlAnomReasons: document.getElementById('op-ml-anom-reasons'),
  opMlFcPill: document.getElementById('op-ml-fc-pill'),
  opMlFcVal: document.getElementById('op-ml-fc-val'),
  opMlFcSubtext: document.getElementById('op-ml-fc-subtext'),
  opMlCatPill: document.getElementById('op-ml-cat-pill'),
  opMlCatVal: document.getElementById('op-ml-cat-val'),
  opMlCatConf: document.getElementById('op-ml-cat-conf')
};

// ============================================================================
// TERMINAL LOGGING
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
// TWO-PAGE NAVIGATION HANDLERS
// ============================================================================
function initNavigation() {
  function switchTab(tabId) {
    state.activeTab = tabId;
    if (tabId === 'overview') {
      dom.tabOverview.classList.add('active');
      dom.tabOverview.setAttribute('aria-selected', 'true');
      dom.tabOperations.classList.remove('active');
      dom.tabOperations.setAttribute('aria-selected', 'false');

      dom.viewOverview.classList.add('active');
      dom.viewOverview.style.display = 'block';
      dom.viewOperations.classList.remove('active');
      dom.viewOperations.style.display = 'none';
      renderCharts();
    } else {
      dom.tabOperations.classList.add('active');
      dom.tabOperations.setAttribute('aria-selected', 'true');
      dom.tabOverview.classList.remove('active');
      dom.tabOverview.setAttribute('aria-selected', 'false');

      dom.viewOperations.classList.add('active');
      dom.viewOperations.style.display = 'block';
      dom.viewOverview.classList.remove('active');
      dom.viewOverview.style.display = 'none';
    }
  }

  if (dom.tabOverview) {
    dom.tabOverview.addEventListener('click', () => switchTab('overview'));
    dom.tabOverview.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab('overview'); }
    });
  }

  if (dom.tabOperations) {
    dom.tabOperations.addEventListener('click', () => switchTab('operations'));
    dom.tabOperations.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab('operations'); }
    });
  }
}

// ============================================================================
// MONITORING MODE CONTROLLER (LIVE HARDWARE vs SYNTHETIC SIMULATION)
// ============================================================================
function setMonitoringMode(targetMode, emitToServer = true) {
  if (state.mode === targetMode) return;
  state.mode = targetMode;

  const isLive = (targetMode === 'hardware');

  // Update Toggle Pill UI
  if (dom.modeToggleSwitch) {
    dom.modeToggleSwitch.setAttribute('aria-checked', isLive ? 'false' : 'true');
  }
  if (dom.modeOptLive && dom.modeOptSim) {
    dom.modeOptLive.classList.toggle('active', isLive);
    dom.modeOptSim.classList.toggle('active', !isLive);
  }

  // Update Persistent Banner
  if (dom.modeBanner) {
    dom.modeBanner.className = `mode-banner ${targetMode}`;
  }
  if (dom.modeBannerTitle) {
    dom.modeBannerTitle.textContent = isLive ? 'LIVE HARDWARE MODE' : 'SIMULATION MODE — SYNTHETIC DATA';
  }
  if (dom.modeBannerDesc) {
    dom.modeBannerDesc.textContent = isLive
      ? 'Streaming live telemetry from Arduino Uno (Module A) & ESP32 (Module B).'
      : 'Simulating 4 independent sensor channels across two microcontrollers. Physical actuators isolated.';
  }
  if (dom.modeBannerSubdesc) {
    dom.modeBannerSubdesc.textContent = isLive
      ? 'All measurements reflect physical sensor voltages and load cell strain gauges.'
      : 'PROVENANCE: SYNTHETIC DATA GENERATOR — Real hardware not connected.';
  }
  if (dom.modeBannerSource) {
    dom.modeBannerSource.textContent = isLive ? 'HARDWARE' : 'SIMULATION';
  }

  // Simulation Controls Panel Visibility
  if (dom.simulationControls) {
    dom.simulationControls.style.display = isLive ? 'none' : 'block';
  }

  // Update Actuator Control Availability on Operations Page
  updateActuatorControlsAvailability();

  if (!isLive) {
    // Start synthetic simulation loop
    startSyntheticSimulation();
    logTerminal('Monitoring mode changed to SIMULATION (Synthetic Multi-MCU Generator Active)', 'info');
  } else {
    // Stop synthetic simulation loop
    stopSyntheticSimulation();
    logTerminal('Monitoring mode changed to LIVE HARDWARE (Awaiting physical packets)', 'info');
  }

  // Synchronize mode with backend
  if (emitToServer && state.isBackendConnected) {
    fetch(`${state.backendUrl}/api/monitoring/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: targetMode, source: 'dashboard_ui' })
    }).catch(err => console.warn('Failed to post mode to server:', err));
  }
}

function updateActuatorControlsAvailability() {
  const isSim = (state.mode === 'simulation');
  if (dom.btnCmdOpen) dom.btnCmdOpen.disabled = isSim;
  if (dom.btnCmdClose) dom.btnCmdClose.disabled = isSim;
  if (dom.unoCmdStatus) {
    dom.unoCmdStatus.textContent = isSim
      ? 'Actuator controls disabled in Simulation Mode to isolate physical hardware.'
      : 'Status: Ready for Arduino Uno commands';
    dom.unoCmdStatus.style.color = isSim ? 'var(--accent-amber)' : 'var(--text-dim)';
  }
}

// ============================================================================
// COMMON TELEMETRY PIPELINE (INGESTION & CACHING)
// ============================================================================
function processTelemetryPacket(packet, sourceName = 'Backend') {
  if (!packet || typeof packet !== 'object') return;

  const now = Date.now();
  state.lastTelemetryTimestamp = now;

  // Ingest into dedicated device states
  if (packet.raw_uno || packet.uno) {
    state.unoTelemetry = packet.raw_uno || packet.uno;
    state.lastUnoTimestamp = now;
  } else if (packet.dev && String(packet.dev).toUpperCase().includes('UNO')) {
    state.unoTelemetry = packet;
    state.lastUnoTimestamp = now;
  } else if (packet.dist_cm !== undefined && packet.c1_raw === undefined && packet.moist_raw === undefined) {
    state.unoTelemetry = packet;
    state.lastUnoTimestamp = now;
  }

  if (packet.raw_esp32 || packet.esp32) {
    state.esp32Telemetry = packet.raw_esp32 || packet.esp32;
    state.lastEsp32Timestamp = now;
  } else if (packet.dev && String(packet.dev).toUpperCase().includes('ESP32')) {
    state.esp32Telemetry = packet;
    state.lastEsp32Timestamp = now;
  } else if (packet.c1_raw !== undefined || packet.moist_raw !== undefined || packet.lc1_raw !== undefined || packet.weight_raw !== undefined) {
    state.esp32Telemetry = packet;
    state.lastEsp32Timestamp = now;
  }

  if (packet.device_health) {
    state.deviceHealth = packet.device_health;
  }

  // Maintain composite
  state.latestTelemetry = packet;

  // Push to history for charts (maintain last 30 data points)
  appendHistoryPoint(packet, now);

  // Render both pages
  renderDashboard();
}

function appendHistoryPoint(packet, now) {
  const esp = state.esp32Telemetry;
  const lc1 = (esp && esp.lc1_g !== undefined) ? esp.lc1_g : ((esp && esp.weight_g !== undefined) ? esp.weight_g : null);
  const lc2 = (esp && esp.lc2_g !== undefined) ? esp.lc2_g : null;
  const c1 = (esp && esp.c1_pct !== undefined) ? esp.c1_pct : ((esp && esp.moist_pct !== undefined) ? esp.moist_pct : null);
  const c2 = (esp && esp.c2_pct !== undefined) ? esp.c2_pct : null;

  state.historyData.push({
    time: now,
    lc1: (lc1 !== null && !isNaN(lc1)) ? Number(lc1) : null,
    lc2: (lc2 !== null && !isNaN(lc2)) ? Number(lc2) : null,
    c1: (c1 !== null && !isNaN(c1)) ? Number(c1) : null,
    c2: (c2 !== null && !isNaN(c2)) ? Number(c2) : null
  });

  if (state.historyData.length > 30) {
    state.historyData.shift();
  }
}

// ============================================================================
// DASHBOARD RENDERING ENGINE
// ============================================================================
function renderDashboard() {
  const now = Date.now();
  const isSim = (state.mode === 'simulation');

  // Evaluate Device Connections
  let unoStatus = 'DISCONNECTED';
  if (isSim) {
    unoStatus = (state.simScenario === 'SCENARIO_D' || state.simFaultActive) ? 'DISCONNECTED' : (state.simIsPaused ? 'STALE' : 'CONNECTED');
  } else if (state.deviceHealth?.uno?.status) {
    unoStatus = state.deviceHealth.uno.status;
  } else if (state.lastUnoTimestamp) {
    const elapsed = (now - state.lastUnoTimestamp) / 1000;
    unoStatus = elapsed <= 5.0 ? 'CONNECTED' : (elapsed <= 15.0 ? 'STALE' : 'DISCONNECTED');
  }

  let espStatus = 'DISCONNECTED';
  if (isSim) {
    espStatus = (state.simScenario === 'SCENARIO_E' || state.simFaultActive) ? 'DISCONNECTED' : (state.simIsPaused ? 'STALE' : 'CONNECTED');
  } else if (state.deviceHealth?.esp32?.status) {
    espStatus = state.deviceHealth.esp32.status;
  } else if (state.lastEsp32Timestamp) {
    const elapsed = (now - state.lastEsp32Timestamp) / 1000;
    espStatus = elapsed <= 5.0 ? 'CONNECTED' : (elapsed <= 15.0 ? 'STALE' : 'DISCONNECTED');
  }

  // 1. Header Badges
  updateDualBadges(unoStatus, espStatus);

  // 2. Page 1: Overview Summary Metrics
  renderSummaryMetrics(unoStatus, espStatus);

  // 3. Page 1: Device Health Summary Cards
  renderDeviceHealthCards(unoStatus, espStatus);

  // 4. Page 1: Three Compartment Cards
  renderCompartmentCards(espStatus);

  // 5. Page 1: Charts
  renderCharts();

  // 6. Page 1: Plain-English Alerts & ML Insights
  renderAlertsAndMLInsights(unoStatus, espStatus);

  // 7. Page 2: Technical Operations Panel
  renderTechnicalOperations(unoStatus, espStatus);
}

function updateDualBadges(unoStatus, espStatus) {
  if (dom.unoConnBadge && dom.unoConnText) {
    dom.unoConnBadge.className = `badge-status ${unoStatus.toLowerCase()}`;
    dom.unoConnText.textContent = `Uno: ${unoStatus}`;
  }
  if (dom.espConnBadge && dom.espConnText) {
    dom.espConnBadge.className = `badge-status ${espStatus.toLowerCase()}`;
    dom.espConnText.textContent = `ESP32: ${espStatus}`;
  }
}

// ----------------------------------------------------------------------------
// PAGE 1: SUMMARY METRICS
// ----------------------------------------------------------------------------
function renderSummaryMetrics(unoStatus, espStatus) {
  const esp = state.esp32Telemetry;
  const uno = state.unoTelemetry;

  // Calculate Total Measured Weight (strictly from LC1 and LC2)
  let totalGrams = 0;
  let validChannelsCount = 0;
  let missingChannelsCount = 0;

  if (espStatus === 'CONNECTED' && esp) {
    const lc1 = (esp.lc1_g !== undefined) ? esp.lc1_g : esp.weight_g;
    const lc2 = esp.lc2_g;

    if (lc1 !== null && lc1 !== undefined && !isNaN(lc1)) {
      totalGrams += Number(lc1);
      validChannelsCount++;
    } else {
      missingChannelsCount++;
    }

    if (lc2 !== null && lc2 !== undefined && !isNaN(lc2)) {
      totalGrams += Number(lc2);
      validChannelsCount++;
    } else {
      missingChannelsCount++;
    }
  }

  if (dom.valTotalWeight && dom.subTotalWeight) {
    if (validChannelsCount === 2) {
      dom.valTotalWeight.textContent = (totalGrams / 1000.0).toFixed(2);
      dom.unitTotalWeight.textContent = 'kg';
      dom.subTotalWeight.textContent = 'Sum of Compartments A & B (Full)';
    } else if (validChannelsCount === 1) {
      dom.valTotalWeight.textContent = (totalGrams / 1000.0).toFixed(2);
      dom.unitTotalWeight.textContent = 'kg (Partial)';
      dom.subTotalWeight.textContent = '1 of 2 load cells reporting';
    } else {
      dom.valTotalWeight.textContent = '—';
      dom.unitTotalWeight.textContent = '';
      dom.subTotalWeight.textContent = 'Weight data unavailable';
    }
  }

  // Commanded Lid State
  if (dom.valSummaryLid) {
    if (unoStatus === 'CONNECTED' && uno && uno.lid_cmd) {
      dom.valSummaryLid.textContent = uno.lid_cmd;
      dom.valSummaryLid.style.color = (uno.lid_cmd === 'OPEN') ? 'var(--accent-forest)' : 'var(--text-main)';
    } else {
      dom.valSummaryLid.textContent = 'UNKNOWN';
      dom.valSummaryLid.style.color = 'var(--text-dim)';
    }
  }

  // Devices Online Count
  if (dom.valSummaryDevices) {
    let onlineCount = (unoStatus === 'CONNECTED' ? 1 : 0) + (espStatus === 'CONNECTED' ? 1 : 0);
    dom.valSummaryDevices.textContent = `${onlineCount} / 2 Online`;
  }

  // Active Warnings
  let warningsCount = 0;
  if (unoStatus !== 'CONNECTED') warningsCount++;
  if (espStatus !== 'CONNECTED') warningsCount++;
  if (esp && (esp.c1_cal === false || esp.c2_cal === false || esp.lc1_cal === false || esp.lc2_cal === false)) warningsCount++;
  if (dom.valSummaryWarnings) {
    dom.valSummaryWarnings.textContent = `${warningsCount} ${warningsCount === 1 ? 'Notice' : 'Notices'}`;
    dom.valSummaryWarnings.style.color = (warningsCount === 0) ? 'var(--accent-forest)' : 'var(--accent-amber)';
  }

  // Last Update
  if (dom.valSummaryLastUpdate) {
    if (state.lastTelemetryTimestamp) {
      dom.valSummaryLastUpdate.textContent = new Date(state.lastTelemetryTimestamp).toLocaleTimeString();
    } else {
      dom.valSummaryLastUpdate.textContent = 'Waiting';
    }
  }
}

// ----------------------------------------------------------------------------
// PAGE 1: DEVICE HEALTH CARDS
// ----------------------------------------------------------------------------
function renderDeviceHealthCards(unoStatus, espStatus) {
  const uno = state.unoTelemetry;
  const esp = state.esp32Telemetry;

  // Uno Card
  if (dom.unoHealthPill) {
    dom.unoHealthPill.className = `card-pill ${unoStatus === 'CONNECTED' ? 'ok' : (unoStatus === 'STALE' ? 'warning' : 'fault')}`;
    dom.unoHealthPill.textContent = unoStatus;
  }
  if (dom.unoStateDesc) {
    dom.unoStateDesc.textContent = (unoStatus === 'CONNECTED') ? 'Streaming at 115200 baud' : (unoStatus === 'STALE' ? 'Packet delayed > 5s' : 'Disconnected');
  }
  if (dom.unoDistDesc) {
    if (unoStatus === 'CONNECTED' && uno && uno.dist_cm !== null && uno.dist_cm !== undefined) {
      dom.unoDistDesc.textContent = `${Number(uno.dist_cm).toFixed(1)} cm (Threshold: ≤ 20.0 cm)`;
    } else {
      dom.unoDistDesc.textContent = '— cm';
    }
  }
  if (dom.unoProxDesc) {
    if (unoStatus === 'CONNECTED' && uno) {
      dom.unoProxDesc.textContent = uno.prox ? 'Yes (Object Detected)' : 'No';
      dom.unoProxDesc.style.color = uno.prox ? 'var(--accent-forest)' : 'var(--text-main)';
    } else {
      dom.unoProxDesc.textContent = 'No';
      dom.unoProxDesc.style.color = 'var(--text-main)';
    }
  }
  if (dom.unoLidDesc) {
    if (unoStatus === 'CONNECTED' && uno && uno.lid_cmd) {
      dom.unoLidDesc.textContent = `${uno.lid_cmd === 'OPEN' ? '90° (OPEN)' : '0° (CLOSED)'}`;
    } else {
      dom.unoLidDesc.textContent = '0° (CLOSED)';
    }
  }
  if (dom.unoLastSeen) {
    dom.unoLastSeen.textContent = state.lastUnoTimestamp ? new Date(state.lastUnoTimestamp).toLocaleTimeString() : 'Never';
  }

  // ESP32 Card
  if (dom.esp32HealthPill) {
    dom.esp32HealthPill.className = `card-pill ${espStatus === 'CONNECTED' ? 'ok' : (espStatus === 'STALE' ? 'warning' : 'fault')}`;
    dom.esp32HealthPill.textContent = espStatus;
  }
  if (dom.esp32StateDesc) {
    dom.esp32StateDesc.textContent = (espStatus === 'CONNECTED') ? 'Telemetry active (4 Channels)' : (espStatus === 'STALE' ? 'Packet delayed > 5s' : 'Disconnected');
  }
  if (dom.esp32MoistHealth) {
    if (espStatus === 'CONNECTED' && esp) {
      const c1Ok = (esp.c1_ok !== undefined) ? esp.c1_ok : esp.moist_ok;
      const c2Ok = (esp.c2_ok !== undefined) ? esp.c2_ok : true;
      dom.esp32MoistHealth.textContent = `C1: ${c1Ok ? 'OK' : 'Fault'} • C2: ${c2Ok ? 'OK' : 'Fault'}`;
    } else {
      dom.esp32MoistHealth.textContent = 'C1: Offline • C2: Offline';
    }
  }
  if (dom.esp32MassHealth) {
    if (espStatus === 'CONNECTED' && esp) {
      const lc1Ok = (esp.lc1_ok !== undefined) ? esp.lc1_ok : esp.weight_ok;
      const lc2Ok = (esp.lc2_ok !== undefined) ? esp.lc2_ok : true;
      dom.esp32MassHealth.textContent = `LC1: ${lc1Ok ? 'OK' : 'Fault'} • LC2: ${lc2Ok ? 'OK' : 'Fault'}`;
    } else {
      dom.esp32MassHealth.textContent = 'LC1: Offline • LC2: Offline';
    }
  }
  if (dom.esp32CalibSummary) {
    if (espStatus === 'CONNECTED' && esp) {
      const isCal = (esp.c1_cal !== false && esp.c2_cal !== false && esp.lc1_cal !== false && esp.lc2_cal !== false);
      dom.esp32CalibSummary.textContent = isCal ? 'All channels calibrated (NVS)' : 'Calibration check recommended';
      dom.esp32CalibSummary.style.color = isCal ? 'var(--accent-forest)' : 'var(--accent-amber)';
    } else {
      dom.esp32CalibSummary.textContent = 'Awaiting connection';
      dom.esp32CalibSummary.style.color = 'var(--text-dim)';
    }
  }
  if (dom.esp32LastSeen) {
    dom.esp32LastSeen.textContent = state.lastEsp32Timestamp ? new Date(state.lastEsp32Timestamp).toLocaleTimeString() : 'Never';
  }
}

// ----------------------------------------------------------------------------
// PAGE 1: THREE COMPARTMENTS CARDS
// ----------------------------------------------------------------------------
function renderCompartmentCards(espStatus) {
  const esp = state.esp32Telemetry;
  const isOnline = (espStatus === 'CONNECTED' && esp);

  // Compartment A: Biodegradable
  if (dom.compAStatusPill) {
    dom.compAStatusPill.className = `card-pill ${isOnline ? 'ok' : 'uncalibrated'}`;
    dom.compAStatusPill.textContent = isOnline ? 'ACTIVE BIN' : 'AWAITING ESP32';
  }
  if (dom.compAMoistVal && dom.compAMoistDesc) {
    const c1Pct = isOnline ? (esp.c1_pct !== undefined ? esp.c1_pct : esp.moist_pct) : null;
    if (c1Pct !== null && c1Pct !== undefined && !isNaN(c1Pct)) {
      dom.compAMoistVal.textContent = Number(c1Pct).toFixed(0);
      dom.compAMoistDesc.textContent = (c1Pct >= 50) ? 'Moist / Organic range' : 'Dry / Low moisture';
    } else {
      dom.compAMoistVal.textContent = '—';
      dom.compAMoistDesc.textContent = isOnline ? 'Sensor uncalibrated' : 'Awaiting sensor reading';
    }
  }
  if (dom.compAWeightVal && dom.compAWeightDesc) {
    const lc1G = isOnline ? (esp.lc1_g !== undefined ? esp.lc1_g : esp.weight_g) : null;
    if (lc1G !== null && lc1G !== undefined && !isNaN(lc1G)) {
      dom.compAWeightVal.textContent = Number(lc1G).toFixed(0);
      dom.compAWeightDesc.textContent = `Measured mass (${(Number(lc1G)/1000).toFixed(2)} kg)`;
    } else {
      dom.compAWeightVal.textContent = '—';
      dom.compAWeightDesc.textContent = isOnline ? 'Load cell uncalibrated' : 'Awaiting load cell';
    }
  }
  if (dom.compAHealth) dom.compAHealth.textContent = isOnline ? 'Normal' : 'Offline';
  if (dom.compACalib) {
    const c1Cal = isOnline ? (esp.c1_cal !== undefined ? esp.c1_cal : esp.moist_cal) : false;
    const lc1Cal = isOnline ? (esp.lc1_cal !== undefined ? esp.lc1_cal : esp.weight_cal) : false;
    dom.compACalib.textContent = (c1Cal && lc1Cal) ? 'Calibrated' : 'Calibration Needed';
    dom.compACalib.style.color = (c1Cal && lc1Cal) ? 'var(--accent-forest)' : 'var(--accent-amber)';
  }
  if (dom.compATrend) {
    if (state.mlForecastResult && state.mlForecastResult.lc1) {
      const delta = state.mlForecastResult.lc1.projected_delta_grams || 0;
      dom.compATrend.textContent = delta > 10 ? `+${delta.toFixed(0)}g expected` : 'Stable mass';
    } else {
      dom.compATrend.textContent = 'Awaiting data';
    }
  }

  // Compartment B: Non-Biodegradable
  if (dom.compBStatusPill) {
    dom.compBStatusPill.className = `card-pill ${isOnline ? 'ok' : 'uncalibrated'}`;
    dom.compBStatusPill.textContent = isOnline ? 'ACTIVE BIN' : 'AWAITING ESP32';
  }
  if (dom.compBMoistVal && dom.compBMoistDesc) {
    const c2Pct = isOnline ? esp.c2_pct : null;
    if (c2Pct !== null && c2Pct !== undefined && !isNaN(c2Pct)) {
      dom.compBMoistVal.textContent = Number(c2Pct).toFixed(0);
      dom.compBMoistDesc.textContent = (c2Pct < 30) ? 'Dry / Packaging range' : 'Elevated moisture';
    } else {
      dom.compBMoistVal.textContent = '—';
      dom.compBMoistDesc.textContent = isOnline ? 'Sensor uncalibrated' : 'Awaiting sensor reading';
    }
  }
  if (dom.compBWeightVal && dom.compBWeightDesc) {
    const lc2G = isOnline ? esp.lc2_g : null;
    if (lc2G !== null && lc2G !== undefined && !isNaN(lc2G)) {
      dom.compBWeightVal.textContent = Number(lc2G).toFixed(0);
      dom.compBWeightDesc.textContent = `Measured mass (${(Number(lc2G)/1000).toFixed(2)} kg)`;
    } else {
      dom.compBWeightVal.textContent = '—';
      dom.compBWeightDesc.textContent = isOnline ? 'Load cell uncalibrated' : 'Awaiting load cell';
    }
  }
  if (dom.compBHealth) dom.compBHealth.textContent = isOnline ? 'Normal' : 'Offline';
  if (dom.compBCalib) {
    const c2Cal = isOnline ? esp.c2_cal : false;
    const lc2Cal = isOnline ? esp.lc2_cal : false;
    dom.compBCalib.textContent = (c2Cal && lc2Cal) ? 'Calibrated' : 'Calibration Needed';
    dom.compBCalib.style.color = (c2Cal && lc2Cal) ? 'var(--accent-forest)' : 'var(--accent-amber)';
  }
  if (dom.compBTrend) {
    if (state.mlForecastResult && state.mlForecastResult.lc2) {
      const delta = state.mlForecastResult.lc2.projected_delta_grams || 0;
      dom.compBTrend.textContent = delta > 10 ? `+${delta.toFixed(0)}g expected` : 'Stable mass';
    } else {
      dom.compBTrend.textContent = 'Awaiting data';
    }
  }

  // Compartment C: Reserved (Strictly Inactive)
  if (dom.compCStatusPill) {
    dom.compCStatusPill.className = 'card-pill neutral';
    dom.compCStatusPill.textContent = 'NOT CONFIGURED';
  }
}

// ----------------------------------------------------------------------------
// PAGE 1: CHARTS (SVG RENDERING)
// ----------------------------------------------------------------------------
function renderCharts() {
  if (state.activeTab !== 'overview') return;
  renderSvgChart(dom.chartWeightWrap, 'lc1', 'lc2', 'Mass (g)', '#15803d', '#0f766e');
  renderSvgChart(dom.chartMoistureWrap, 'c1', 'c2', 'Moisture (%)', '#15803d', '#0f766e');
}

function renderSvgChart(container, key1, key2, yLabel, color1, color2) {
  if (!container) return;

  const data = state.historyData;
  if (!data || data.length < 2) {
    container.innerHTML = '<span class="chart-empty-text">Awaiting sensor data points...</span>';
    return;
  }

  const width = container.clientWidth || 400;
  const height = 220;
  const pad = { top: 20, right: 20, bottom: 30, left: 45 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Find Min & Max
  let minVal = Infinity;
  let maxVal = -Infinity;
  data.forEach(d => {
    if (d[key1] !== null) { minVal = Math.min(minVal, d[key1]); maxVal = Math.max(maxVal, d[key1]); }
    if (d[key2] !== null) { minVal = Math.min(minVal, d[key2]); maxVal = Math.max(maxVal, d[key2]); }
  });

  if (minVal === Infinity) {
    container.innerHTML = '<span class="chart-empty-text">No valid numerical points to plot</span>';
    return;
  }

  if (minVal === maxVal) { minVal -= 5; maxVal += 5; }
  minVal = Math.max(0, minVal);

  const scaleX = (i) => pad.left + (i / (data.length - 1)) * plotW;
  const scaleY = (v) => pad.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  // Build Paths with gap handling (avoid drawing lines across nulls)
  function buildPath(key) {
    let path = '';
    let inSegment = false;
    data.forEach((d, i) => {
      const val = d[key];
      if (val !== null && !isNaN(val)) {
        const x = scaleX(i);
        const y = scaleY(val);
        if (!inSegment) {
          path += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
          inSegment = true;
        } else {
          path += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
        }
      } else {
        inSegment = false;
      }
    });
    return path;
  }

  const path1 = buildPath(key1);
  const path2 = buildPath(key2);

  // Gridlines & Labels
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block; overflow:visible;">
      <!-- Gridlines -->
      <line x1="${pad.left}" y1="${pad.top}" x2="${width - pad.right}" y2="${pad.top}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
      <line x1="${pad.left}" y1="${pad.top + plotH/2}" x2="${width - pad.right}" y2="${pad.top + plotH/2}" stroke="#e2e8f0" stroke-dasharray="3 3"/>
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" stroke="#cbd5e1" stroke-width="1"/>
      
      <!-- Y-Axis Labels -->
      <text x="${pad.left - 8}" y="${pad.top + 4}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">${maxVal.toFixed(0)}</text>
      <text x="${pad.left - 8}" y="${pad.top + plotH/2 + 4}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">${((maxVal + minVal)/2).toFixed(0)}</text>
      <text x="${pad.left - 8}" y="${pad.top + plotH + 4}" fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">${minVal.toFixed(0)}</text>

      <!-- Data Traces -->
      ${path1 ? `<path d="${path1}" fill="none" stroke="${color1}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${path2 ? `<path d="${path2}" fill="none" stroke="${color2}" stroke-width="2.5" stroke-dasharray="4 2" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    </svg>
  `;
  container.innerHTML = svg;
}

// ----------------------------------------------------------------------------
// PAGE 1: ALERTS & ML INSIGHTS
// ----------------------------------------------------------------------------
function renderAlertsAndMLInsights(unoStatus, espStatus) {
  const alerts = [];
  const esp = state.esp32Telemetry;

  if (unoStatus !== 'CONNECTED') {
    alerts.push({ type: 'warning', text: 'Arduino Uno is offline. Automatic lid servo status is unavailable.' });
  }
  if (espStatus !== 'CONNECTED') {
    alerts.push({ type: 'warning', text: 'ESP32 sensor hub is offline. Bin mass & moisture telemetry may be outdated.' });
  } else if (esp) {
    if (esp.c1_cal === false) alerts.push({ type: 'info', text: 'Moisture sensor C1 needs calibration in dry air & water.' });
    if (esp.c2_cal === false) alerts.push({ type: 'info', text: 'Moisture sensor C2 needs calibration in dry air & water.' });
    if (esp.lc1_cal === false) alerts.push({ type: 'info', text: 'Load Cell 1 requires reference mass calibration.' });
    if (esp.lc2_cal === false) alerts.push({ type: 'info', text: 'Load Cell 2 requires reference mass calibration.' });
  }

  if (alerts.length === 0) {
    alerts.push({ type: 'info', text: 'System running nominal. Real-time telemetry synchronized across microcontrollers.' });
  }

  if (dom.overviewAlertsList) {
    dom.overviewAlertsList.innerHTML = alerts.map(a => `
      <div class="alert-row ${a.type}">
        <span>${a.type === 'fault' ? '⚠' : (a.type === 'warning' ? '⚡' : 'ℹ')}</span>
        <span>${a.text}</span>
      </div>
    `).join('');
  }

  if (dom.overviewAlertsPill) {
    const hasFault = alerts.some(a => a.type === 'fault');
    const hasWarn = alerts.some(a => a.type === 'warning');
    dom.overviewAlertsPill.className = `card-pill ${hasFault ? 'fault' : (hasWarn ? 'warning' : 'ok')}`;
    dom.overviewAlertsPill.textContent = hasFault ? 'FAULT' : (hasWarn ? 'ATTENTION' : 'NORMAL');
  }

  // ML Plain Summary
  if (dom.mlPlainSummary) {
    if (state.mlAnomalyResult && state.mlAnomalyResult.status === 'suspected_anomaly') {
      dom.mlPlainSummary.textContent = `Sensor readings look unusual (${state.mlAnomalyResult.reasons?.join(', ') || 'anomalous reading'}). Check hardware connections.`;
      if (dom.mlInsightPill) { dom.mlInsightPill.textContent = 'ANOMALY DETECTED'; dom.mlInsightPill.className = 'badge-pill sim-badge'; }
    } else if (state.mlForecastResult && state.mlForecastResult.plain_english_summary) {
      dom.mlPlainSummary.textContent = state.mlForecastResult.plain_english_summary;
      if (dom.mlInsightPill) { dom.mlInsightPill.textContent = 'ML ACTIVE'; dom.mlInsightPill.className = 'badge-pill ml-badge'; }
    } else {
      dom.mlPlainSummary.textContent = 'Sensors stable. Telemetry trends within normal operating thresholds.';
      if (dom.mlInsightPill) { dom.mlInsightPill.textContent = 'ML READY'; dom.mlInsightPill.className = 'badge-pill ml-badge'; }
    }
  }

  if (dom.mlInsightProvenance) {
    dom.mlInsightProvenance.textContent = (state.mode === 'simulation')
      ? 'PROVENANCE: SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION'
      : 'PROVENANCE: HARDWARE TELEMETRY STREAM';
  }
}

// ----------------------------------------------------------------------------
// PAGE 2: TECHNICAL OPERATIONS
// ----------------------------------------------------------------------------
function renderTechnicalOperations(unoStatus, espStatus) {
  const uno = state.unoTelemetry;
  const esp = state.esp32Telemetry;
  const now = Date.now();

  // Panel A: Uno Details
  if (dom.opUnoPill) {
    dom.opUnoPill.className = `card-pill ${unoStatus === 'CONNECTED' ? 'ok' : 'uncalibrated'}`;
    dom.opUnoPill.textContent = unoStatus;
  }
  if (dom.opUnoDev) dom.opUnoDev.textContent = uno?.dev || 'UNO-WS01';
  if (dom.opUnoElapsed) {
    const el = state.lastUnoTimestamp ? ((now - state.lastUnoTimestamp) / 1000).toFixed(1) : '—';
    dom.opUnoElapsed.textContent = `${el}s ago`;
  }
  if (dom.opUnoSeqUp) {
    dom.opUnoSeqUp.textContent = `Seq: ${uno?.seq || 0} • Uptime: ${uno?.up || 0}s`;
  }
  if (dom.opUnoDistProx) {
    dom.opUnoDistProx.textContent = `${uno?.dist_cm !== null && uno?.dist_cm !== undefined ? Number(uno.dist_cm).toFixed(1) + ' cm' : '—'} (Prox: ${uno?.prox ? 'YES' : 'NO'})`;
  }
  if (dom.opUnoLidCmd) {
    dom.opUnoLidCmd.textContent = `${uno?.lid_cmd || 'CLOSED'}`;
  }
  if (dom.opUnoFaults) {
    dom.opUnoFaults.textContent = (uno?.faults && uno.faults.length > 0) ? uno.faults.join(', ') : 'None';
  }
  if (dom.opUnoRawPacket) {
    dom.opUnoRawPacket.textContent = uno ? JSON.stringify(uno, null, 2) : 'Waiting for incoming packet...';
  }

  // Panel A: ESP32 Details
  if (dom.opEspPill) {
    dom.opEspPill.className = `card-pill ${espStatus === 'CONNECTED' ? 'ok' : 'uncalibrated'}`;
    dom.opEspPill.textContent = espStatus;
  }
  if (dom.opEspDev) dom.opEspDev.textContent = esp?.dev || 'ESP32-WS01';
  if (dom.opEspElapsed) {
    const el = state.lastEsp32Timestamp ? ((now - state.lastEsp32Timestamp) / 1000).toFixed(1) : '—';
    dom.opEspElapsed.textContent = `${el}s ago`;
  }
  if (dom.opEspSeqUp) {
    dom.opEspSeqUp.textContent = `Seq: ${esp?.seq || 0} • Uptime: ${esp?.up || 0}s`;
  }
  if (dom.opEspChansStatus) {
    dom.opEspChansStatus.textContent = `C1: ${esp?.c1_ok !== false ? 'OK' : 'Fault'} • C2: ${esp?.c2_ok !== false ? 'OK' : 'Fault'} • LC1: ${esp?.lc1_ok !== false ? 'OK' : 'Fault'} • LC2: ${esp?.lc2_ok !== false ? 'OK' : 'Fault'}`;
  }
  if (dom.opEspLidSync) {
    dom.opEspLidSync.textContent = `${esp?.lid_sync_state || (uno?.lid_cmd || 'CLOSED')} (${esp?.lid_sync_fresh !== false ? 'Synchronized' : 'Stale'})`;
  }
  if (dom.opEspRawPacket) {
    dom.opEspRawPacket.textContent = esp ? JSON.stringify(esp, null, 2) : 'Waiting for incoming packet...';
  }

  // Panel B: 4 Channels Diagnostics
  renderSensorChannelDiagnostics(esp);

  // Panel C: Lid Diagnostics
  if (dom.opLidStatePill) {
    dom.opLidStatePill.className = `card-pill ${uno?.lid_cmd === 'OPEN' ? 'ok' : 'neutral'}`;
    dom.opLidStatePill.textContent = uno?.lid_cmd || 'CLOSED';
  }
  if (dom.opLidAngle) {
    dom.opLidAngle.textContent = uno?.lid_cmd === 'OPEN' ? '90° (OPEN)' : '0° (CLOSED)';
  }
  if (dom.opSyncStatusPill) {
    const isCoordinated = (espStatus === 'CONNECTED' && unoStatus === 'CONNECTED');
    dom.opSyncStatusPill.className = `card-pill ${isCoordinated ? 'ok' : 'uncalibrated'}`;
    dom.opSyncStatusPill.textContent = isCoordinated ? 'COORDINATED' : 'LINK PARTIAL';
  }
  if (dom.opSyncUnoState) dom.opSyncUnoState.textContent = uno?.lid_cmd || 'CLOSED';
  if (dom.opSyncEspState) dom.opSyncEspState.textContent = esp?.lid_sync_state || (uno?.lid_cmd || 'CLOSED');

  // Panel F: ML Diagnostics
  renderMLDiagnostics();
}

function renderSensorChannelDiagnostics(esp) {
  // C1
  if (dom.c1Pill) {
    const isCal = esp && esp.c1_cal !== false;
    dom.c1Pill.className = `card-pill ${isCal ? 'ok' : 'uncalibrated'}`;
    dom.c1Pill.textContent = isCal ? 'CALIBRATED' : 'UNCALIBRATED';
  }
  if (dom.c1PctVal) dom.c1PctVal.textContent = (esp && esp.c1_pct !== null && esp.c1_pct !== undefined) ? Number(esp.c1_pct).toFixed(1) : '—';
  if (dom.c1RawVal) dom.c1RawVal.textContent = (esp && esp.c1_raw !== null && esp.c1_raw !== undefined) ? `${esp.c1_raw} ADC` : '—';
  if (dom.c1HealthText) dom.c1HealthText.textContent = (esp && esp.c1_ok !== false) ? 'Healthy' : 'Disconnected / Noise';

  // C2
  if (dom.c2Pill) {
    const isCal = esp && esp.c2_cal !== false;
    dom.c2Pill.className = `card-pill ${isCal ? 'ok' : 'uncalibrated'}`;
    dom.c2Pill.textContent = isCal ? 'CALIBRATED' : 'UNCALIBRATED';
  }
  if (dom.c2PctVal) dom.c2PctVal.textContent = (esp && esp.c2_pct !== null && esp.c2_pct !== undefined) ? Number(esp.c2_pct).toFixed(1) : '—';
  if (dom.c2RawVal) dom.c2RawVal.textContent = (esp && esp.c2_raw !== null && esp.c2_raw !== undefined) ? `${esp.c2_raw} ADC` : '—';
  if (dom.c2HealthText) dom.c2HealthText.textContent = (esp && esp.c2_ok !== false) ? 'Healthy' : 'Disconnected / Noise';

  // LC1
  if (dom.lc1Pill) {
    const isCal = esp && esp.lc1_cal !== false;
    dom.lc1Pill.className = `card-pill ${isCal ? 'ok' : 'uncalibrated'}`;
    dom.lc1Pill.textContent = isCal ? 'CALIBRATED' : 'UNCALIBRATED';
  }
  if (dom.lc1GVal) dom.lc1GVal.textContent = (esp && esp.lc1_g !== null && esp.lc1_g !== undefined) ? Number(esp.lc1_g).toFixed(1) : '—';
  if (dom.lc1RawVal) dom.lc1RawVal.textContent = (esp && esp.lc1_raw !== null && esp.lc1_raw !== undefined) ? `${esp.lc1_raw} counts` : '—';
  if (dom.lc1FactorVal) dom.lc1FactorVal.textContent = (esp && esp.lc1_factor) ? `${Number(esp.lc1_factor).toFixed(2)} counts/g` : '420.0 counts/g (Default)';
  if (dom.lc1TareVal) dom.lc1TareVal.textContent = (esp && esp.lc1_tare !== undefined) ? `${esp.lc1_tare}` : 'Auto-tared';
  if (dom.lc1HealthText) dom.lc1HealthText.textContent = (esp && esp.lc1_ok !== false) ? 'Healthy' : 'HX711 Timeout';

  // LC2
  if (dom.lc2Pill) {
    const isCal = esp && esp.lc2_cal !== false;
    dom.lc2Pill.className = `card-pill ${isCal ? 'ok' : 'uncalibrated'}`;
    dom.lc2Pill.textContent = isCal ? 'CALIBRATED' : 'UNCALIBRATED';
  }
  if (dom.lc2GVal) dom.lc2GVal.textContent = (esp && esp.lc2_g !== null && esp.lc2_g !== undefined) ? Number(esp.lc2_g).toFixed(1) : '—';
  if (dom.lc2RawVal) dom.lc2RawVal.textContent = (esp && esp.lc2_raw !== null && esp.lc2_raw !== undefined) ? `${esp.lc2_raw} counts` : '—';
  if (dom.lc2FactorVal) dom.lc2FactorVal.textContent = (esp && esp.lc2_factor) ? `${Number(esp.lc2_factor).toFixed(2)} counts/g` : '420.0 counts/g (Default)';
  if (dom.lc2TareVal) dom.lc2TareVal.textContent = (esp && esp.lc2_tare !== undefined) ? `${esp.lc2_tare}` : 'Auto-tared';
  if (dom.lc2HealthText) dom.lc2HealthText.textContent = (esp && esp.lc2_ok !== false) ? 'Healthy' : 'HX711 Timeout';
}

function renderMLDiagnostics() {
  if (dom.opMlAnomScore && state.mlAnomalyResult) {
    dom.opMlAnomScore.textContent = `${(state.mlAnomalyResult.anomaly_score * 100).toFixed(1)}%`;
    dom.opMlAnomReasons.textContent = state.mlAnomalyResult.reasons?.join(', ') || 'No anomalous channels detected';
    dom.opMlAnomPill.textContent = state.mlAnomalyResult.status?.toUpperCase() || 'NORMAL';
    dom.opMlAnomPill.className = `card-pill ${state.mlAnomalyResult.status === 'suspected_anomaly' ? 'fault' : 'ok'}`;
  }

  if (dom.opMlFcVal && state.mlForecastResult) {
    const lc1G = state.mlForecastResult.lc1?.forecast_grams || 0;
    const lc2G = state.mlForecastResult.lc2?.forecast_grams || 0;
    dom.opMlFcVal.textContent = (lc1G + lc2G).toFixed(0);
    dom.opMlFcSubtext.textContent = `LC1 (+5m): ${lc1G.toFixed(0)}g • LC2 (+5m): ${lc2G.toFixed(0)}g`;
  }
}

// ============================================================================
// TARGETED COMMAND CONSOLE & CALIBRATION CONTROLS
// ============================================================================
function initCommandControls() {
  // Uno Commands
  if (dom.btnCmdOpen) {
    dom.btnCmdOpen.addEventListener('click', () => sendUnoCommand('open'));
  }
  if (dom.btnCmdClose) {
    dom.btnCmdClose.addEventListener('click', () => sendUnoCommand('close'));
  }
  if (dom.btnCmdUnoStatus) {
    dom.btnCmdUnoStatus.addEventListener('click', () => sendUnoCommand('status'));
  }

  // ESP32 Calibration Commands
  if (dom.btnTareLc1) {
    dom.btnTareLc1.addEventListener('click', () => sendEsp32Command({ cmd: 'tare', channel: 'lc1' }));
  }
  if (dom.btnCalLc1) {
    dom.btnCalLc1.addEventListener('click', () => {
      const refG = parseFloat(dom.inputRefLc1?.value || '500');
      sendEsp32Command({ cmd: 'cal_weight', channel: 'lc1', ref_g: refG });
    });
  }
  if (dom.btnTareLc2) {
    dom.btnTareLc2.addEventListener('click', () => sendEsp32Command({ cmd: 'tare', channel: 'lc2' }));
  }
  if (dom.btnCalLc2) {
    dom.btnCalLc2.addEventListener('click', () => {
      const refG = parseFloat(dom.inputRefLc2?.value || '500');
      sendEsp32Command({ cmd: 'cal_weight', channel: 'lc2', ref_g: refG });
    });
  }
  if (dom.btnCalC1Dry) {
    dom.btnCalC1Dry.addEventListener('click', () => sendEsp32Command({ cmd: 'cal_moist_dry', channel: 'c1' }));
  }
  if (dom.btnCalC1Wet) {
    dom.btnCalC1Wet.addEventListener('click', () => sendEsp32Command({ cmd: 'cal_moist_wet', channel: 'c1' }));
  }
  if (dom.btnCalC2Dry) {
    dom.btnCalC2Dry.addEventListener('click', () => sendEsp32Command({ cmd: 'cal_moist_dry', channel: 'c2' }));
  }
  if (dom.btnCalC2Wet) {
    dom.btnCalC2Wet.addEventListener('click', () => sendEsp32Command({ cmd: 'cal_moist_wet', channel: 'c2' }));
  }

  if (dom.cmdClear) {
    dom.cmdClear.addEventListener('click', () => {
      if (dom.terminalStream) dom.terminalStream.innerHTML = '';
    });
  }

  // Refresh Lid Events
  if (dom.btnRefreshLidOverview) {
    dom.btnRefreshLidOverview.addEventListener('click', fetchLidEvents);
  }
}

async function sendUnoCommand(action) {
  if (state.mode === 'simulation') {
    logTerminal('Actuator commands blocked in Simulation Mode', 'warn');
    return;
  }

  if (dom.unoCmdStatus) dom.unoCmdStatus.textContent = `Status: Sending ${action}...`;

  try {
    const res = await fetch(`${state.backendUrl}/api/cmd/uno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: action, timestamp: Date.now() })
    });
    const data = await res.json();
    if (data.success) {
      if (dom.unoCmdStatus) dom.unoCmdStatus.textContent = `Status: Command '${action}' ACCEPTED by Uno queue`;
      logTerminal(`Uno command '${action}' dispatched successfully`, 'success');
    } else {
      if (dom.unoCmdStatus) dom.unoCmdStatus.textContent = `Status: Failed — ${data.error || 'Server error'}`;
      logTerminal(`Uno command error: ${data.error}`, 'error');
    }
  } catch (err) {
    if (dom.unoCmdStatus) dom.unoCmdStatus.textContent = `Status: Network error`;
    logTerminal(`Uno command fetch failed: ${err.message}`, 'error');
  }
}

async function sendEsp32Command(cmdObj) {
  if (state.mode === 'simulation') {
    logTerminal('Calibration commands blocked in Simulation Mode', 'warn');
    return;
  }

  if (dom.esp32CmdStatus) dom.esp32CmdStatus.textContent = `Status: Dispatching ${cmdObj.cmd} (${cmdObj.channel || ''})...`;

  try {
    const res = await fetch(`${state.backendUrl}/api/cmd/esp32`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmdObj)
    });
    const data = await res.json();
    if (data.success) {
      if (dom.esp32CmdStatus) dom.esp32CmdStatus.textContent = `Status: ${cmdObj.cmd} ACCEPTED and queued for ESP32`;
      logTerminal(`ESP32 command dispatched: ${JSON.stringify(cmdObj)}`, 'success');
    } else {
      if (dom.esp32CmdStatus) dom.esp32CmdStatus.textContent = `Status: Error — ${data.error}`;
      logTerminal(`ESP32 command error: ${data.error}`, 'error');
    }
  } catch (err) {
    if (dom.esp32CmdStatus) dom.esp32CmdStatus.textContent = `Status: Network failed`;
    logTerminal(`ESP32 command failed: ${err.message}`, 'error');
  }
}

// ============================================================================
// LID EVENTS LOGGING
// ============================================================================
async function fetchLidEvents() {
  if (!state.isBackendConnected) return;
  try {
    const res = await fetch(`${state.backendUrl}/api/lid/events?limit=8`);
    if (res.ok) {
      const events = await res.json();
      state.lidEvents = events;
      renderLidEventsTable(events);
    }
  } catch (e) {
    // Silently continue
  }
}

function renderLidEventsTable(events) {
  if (!dom.overviewLidEventsTbody) return;
  if (!events || events.length === 0) {
    dom.overviewLidEventsTbody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state-notice">
          No lid proximity events recorded yet. Connect sensor hardware to monitor proximity detections.
        </td>
      </tr>
    `;
    return;
  }

  dom.overviewLidEventsTbody.innerHTML = events.slice(0, 6).map(ev => {
    const timeStr = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : 'Recent';
    const distStr = ev.distance_cm ? `${Number(ev.distance_cm).toFixed(1)} cm` : '≤ 20.0 cm';
    return `
      <tr>
        <td>${timeStr}</td>
        <td><span class="card-pill ok">${ev.trigger || 'PROXIMITY'}</span></td>
        <td>${distStr}</td>
        <td>${ev.previous_state || 'CLOSED'} → <strong>${ev.new_state || 'OPEN'}</strong></td>
        <td>Servo 0° ↔ 90° Transition</td>
      </tr>
    `;
  }).join('');
}

// ============================================================================
// SYNTHETIC SIMULATION GENERATOR (INDEPENDENT DUAL-MCU STREAMS)
// ============================================================================
const simulationEngine = {
  start: () => startSyntheticSimulation(),
  stop: () => stopSyntheticSimulation(),
  tick: () => generateSyntheticTick()
};

function startSyntheticSimulation() {
  if (state.simIntervalId) clearInterval(state.simIntervalId);

  state.simSessionId = 'SIM-SESS-' + Date.now();
  state.simStartedAt = new Date().toISOString();
  state.simIsPaused = false;

  state.simIntervalId = setInterval(() => {
    if (state.simIsPaused) return;
    generateSyntheticTick();
  }, state.simIntervalMs);
}

function stopSyntheticSimulation() {
  if (state.simIntervalId) {
    clearInterval(state.simIntervalId);
    state.simIntervalId = null;
  }
}

function generateSyntheticTick() {
  state.simSeqUno++;
  state.simSeqEsp++;

  // Apply scenario physics
  const scenario = state.simScenario;

  if (scenario === 'SCENARIO_B') {
    // Bin 1 Accumulation (Biodegradable)
    state.simLc1Weight = Math.min(6500.0, state.simLc1Weight + (Math.random() * 25.0 + 5.0));
    state.simC1Moist = Math.min(85.0, state.simC1Moist + (Math.random() * 0.8));
  } else if (scenario === 'SCENARIO_C') {
    // Bin 2 Accumulation (Non-Biodegradable)
    state.simLc2Weight = Math.min(7200.0, state.simLc2Weight + (Math.random() * 20.0 + 5.0));
    state.simC2Moist = Math.max(8.0, state.simC2Moist - (Math.random() * 0.4));
  }

  // Module A: Uno Packet
  const isProx = (Math.random() > 0.85);
  const unoPacket = {
    v: 1,
    dev: 'UNO-WS01',
    seq: state.simSeqUno,
    up: Math.floor((Date.now() - (state.lastUnoTimestamp || Date.now())) / 1000),
    dist_cm: isProx ? (Math.random() * 8.0 + 5.0) : (Math.random() * 30.0 + 35.0),
    prox: isProx,
    lid_cmd: isProx ? 'OPEN' : 'CLOSED',
    faults: (state.simFaultActive && Math.random() > 0.5) ? ['ULTRASONIC_TIMEOUT'] : [],
    source: "simulation"
  };

  // Module B: ESP32 Packet (4 Channels, 12-Bit ADC)
  const c1Raw = Math.round(3200 - (state.simC1Moist / 100.0) * (3200 - 1400) + (Math.random() * 40 - 20));
  const c2Raw = Math.round(3200 - (state.simC2Moist / 100.0) * (3200 - 1400) + (Math.random() * 40 - 20));
  const lc1Raw = Math.round(100000 + state.simLc1Weight * 420.0 + (Math.random() * 100 - 50));
  const lc2Raw = Math.round(100000 + state.simLc2Weight * 420.0 + (Math.random() * 100 - 50));

  const esp32Packet = {
    v: 1,
    dev: 'ESP32-WS01',
    seq: state.simSeqEsp,
    up: Math.floor((Date.now() - (state.lastEsp32Timestamp || Date.now())) / 1000),
    c1_raw: c1Raw,
    c1_pct: state.simC1Moist,
    c1_ok: !(state.simFaultActive && Math.random() > 0.6),
    c1_cal: scenario !== 'SCENARIO_F',
    c2_raw: c2Raw,
    c2_pct: state.simC2Moist,
    c2_ok: !(state.simFaultActive && Math.random() > 0.7),
    c2_cal: scenario !== 'SCENARIO_F',
    lc1_g: state.simLc1Weight,
    lc1_raw: lc1Raw,
    lc1_ok: !(state.simFaultActive && Math.random() > 0.8),
    lc1_cal: scenario !== 'SCENARIO_F',
    lc1_factor: 420.0,
    lc1_tare: 100000,
    lc2_g: state.simLc2Weight,
    lc2_raw: lc2Raw,
    lc2_ok: !(state.simFaultActive && Math.random() > 0.8),
    lc2_cal: scenario !== 'SCENARIO_F',
    lc2_factor: 420.0,
    lc2_tare: 100000,
    lid_sync_state: unoPacket.lid_cmd,
    lid_sync_fresh: true,
    lcd_detected: true,
    faults: state.simFaultActive ? ['COMM_NOISE'] : [],
    source: 'simulation'
  };

  // Process based on Scenario availability
  if (scenario !== 'SCENARIO_D') {
    processTelemetryPacket(unoPacket, 'Simulated-Uno');
  }
  if (scenario !== 'SCENARIO_E') {
    processTelemetryPacket(esp32Packet, 'Simulated-ESP32');
  }

  // Trigger simulated ML inference
  runClientMLInference(esp32Packet);
}

function runClientMLInference(espPacket) {
  // Simulated ML insights
  const now = Date.now();
  if (now - state.lastMlInferenceTime < 3000) return;
  state.lastMlInferenceTime = now;

  state.mlAnomalyResult = {
    status: (state.simFaultActive || (espPacket.faults && espPacket.faults.length > 0)) ? 'suspected_anomaly' : 'normal',
    anomaly_score: state.simFaultActive ? 0.88 : 0.04,
    reasons: state.simFaultActive ? ['High variance in Load Cell 1 strain gauge', 'Communication jitter'] : []
  };

  state.mlForecastResult = {
    horizon: '5m',
    plain_english_summary: `Predicted 5m accumulation: Compartment A (+${(Math.random()*15+5).toFixed(0)}g), Compartment B (Stable).`,
    lc1: { current_grams: state.simLc1Weight, forecast_grams: state.simLc1Weight + 15.0, projected_delta_grams: 15.0 },
    lc2: { current_grams: state.simLc2Weight, forecast_grams: state.simLc2Weight + 5.0, projected_delta_grams: 5.0 }
  };
}

// ============================================================================
// BACKEND REST POLLING & INITIALIZATION
// ============================================================================
async function pollBackend() {
  if (state.mode === 'simulation') return; // In simulation mode, generator drives state

  try {
    const res = await fetch(`${state.backendUrl}/api/telemetry/combined`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      state.isBackendConnected = true;
      processTelemetryPacket(data, 'REST-Combined');
    }
  } catch (err) {
    state.isBackendConnected = false;
    renderDashboard();
  }
}

function initSimulationControls() {
  if (dom.simScenarioSelect) {
    dom.simScenarioSelect.addEventListener('change', (e) => {
      state.simScenario = e.target.value;
      logTerminal(`Simulation scenario set to: ${state.simScenario}`, 'info');
    });
  }

  if (dom.simSpeedSelect) {
    dom.simSpeedSelect.addEventListener('change', (e) => {
      state.simIntervalMs = parseInt(e.target.value, 10) || 1000;
      if (state.mode === 'simulation') startSyntheticSimulation();
    });
  }

  if (dom.btnSimPause) {
    dom.btnSimPause.addEventListener('click', () => {
      state.simIsPaused = !state.simIsPaused;
      if (dom.simPauseText) dom.simPauseText.textContent = state.simIsPaused ? 'Resume' : 'Pause';
      if (dom.simPauseIcon) dom.simPauseIcon.textContent = state.simIsPaused ? '▶' : '⏸';
      logTerminal(`Simulation ${state.simIsPaused ? 'PAUSED' : 'RESUMED'}`, 'info');
    });
  }

  if (dom.btnSimReset) {
    dom.btnSimReset.addEventListener('click', () => {
      state.simLc1Weight = 350.0;
      state.simLc2Weight = 220.0;
      state.simC1Moist = 65.0;
      state.simC2Moist = 18.0;
      state.simFaultActive = false;
      state.historyData = [];
      logTerminal('Simulation state reset to baseline values', 'info');
    });
  }

  if (dom.btnSimFault) {
    dom.btnSimFault.addEventListener('click', () => {
      state.simFaultActive = !state.simFaultActive;
      if (dom.simFaultText) dom.simFaultText.textContent = state.simFaultActive ? 'Clear Fault' : 'Simulate Fault';
      logTerminal(`Simulated hardware fault: ${state.simFaultActive ? 'INJECTED' : 'CLEARED'}`, state.simFaultActive ? 'warn' : 'info');
    });
  }

  if (dom.modeToggleSwitch) {
    dom.modeToggleSwitch.addEventListener('click', () => {
      const nextMode = (state.mode === 'hardware') ? 'simulation' : 'hardware';
      setMonitoringMode(nextMode);
    });
    dom.modeToggleSwitch.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const nextMode = (state.mode === 'hardware') ? 'simulation' : 'hardware';
        setMonitoringMode(nextMode);
      }
    });
  }
}

// ============================================================================
// APPLICATION LIFECYCLE INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSimulationControls();
  initCommandControls();

  // Initial render
  renderDashboard();

  // Fetch initial lid events
  fetchLidEvents();

  // Start periodic polling of combined telemetry (1Hz)
  setInterval(pollBackend, 1000);

  // Periodic lid events refresh (every 5s)
  setInterval(fetchLidEvents, 5000);

  // Resize listener for SVG charts
  window.addEventListener('resize', () => {
    if (state.activeTab === 'overview') renderCharts();
  });

  logTerminal('Intelligent Waste Segregation Two-Page Dashboard Initialized', 'info');
});
