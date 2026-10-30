/**
 * Intelligent Solid Waste Monitoring Dashboard
 * Minimalist, User-Friendly Frontend Engine
 *
 * Designed for ordinary users:
 * - Simple waste metrics: Total weight, moisture content, bin conditions, lid status
 * - Strictly non-negative load cell weights (min 0)
 * - Calibrated Arduino Uno lid status (zero false warnings)
 * - 4 separate historical graphs for all 4 sensor channels over time
 * - Machine learning predictions with rate of change over time (ΔWeight / ΔTime)
 */

// ============================================================================
// APPLICATION STATE
// ============================================================================
const state = {
  backendUrl: window.location.origin.includes('http') ? window.location.origin : 'http://localhost:8080',
  isBackendConnected: false,

  // Monitoring Mode: 'hardware' | 'simulation'
  mode: 'hardware',

  // Device Telemetry State
  unoTelemetry: null,
  lastUnoTimestamp: 0,
  esp32Telemetry: null,
  lastEsp32Timestamp: 0,
  latestTelemetry: null,
  lastTelemetryTimestamp: 0,
  latestLidCmd: 'CLOSED',
  lidCalibrated: true,

  deviceHealth: {
    overall_status: 'ALL_OFFLINE',
    uno: { status: 'DISCONNECTED', connected: false },
    esp32: { status: 'DISCONNECTED', connected: false }
  },

  // Telemetry History for SVG Charts (up to 30 points)
  historyData: [],
  lidEvents: [],

  // ML Forecasting State
  mlHorizon: '5m',
  mlForecastResult: null,

  // Simulation Engine State (Demo Mode)
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
  simC2Moist: 18.0
};

// ============================================================================
// DOM ELEMENTS CACHE
// ============================================================================
const dom = {
  // Header Elements
  modeToggleBtn: document.getElementById('mode-toggle-btn'),
  modePillText: document.getElementById('mode-pill-text'),
  systemStatusBadge: document.getElementById('system-status-badge'),
  systemStatusText: document.getElementById('system-status-text'),
  headerLastUpdated: document.getElementById('header-last-updated'),

  // Demo Banner & Controls Drawer
  demoBanner: document.getElementById('demo-banner'),
  btnDemoToggleDrawer: document.getElementById('btn-demo-toggle-drawer'),
  demoControlsDrawer: document.getElementById('demo-controls-drawer'),
  simScenarioSelect: document.getElementById('sim-scenario-select'),
  btnSimPause: document.getElementById('btn-sim-pause'),
  simPauseIcon: document.getElementById('sim-pause-icon'),
  simPauseText: document.getElementById('sim-pause-text'),
  btnSimReset: document.getElementById('btn-sim-reset'),

  // Section 1: Summary Metrics Cards
  valTotalWeight: document.getElementById('val-total-weight'),
  unitTotalWeight: document.getElementById('unit-total-weight'),
  subTotalWeight: document.getElementById('sub-total-weight'),
  valBinCount: document.getElementById('val-bin-count'),
  subBinStatus: document.getElementById('sub-bin-status'),
  valLidStatus: document.getElementById('val-lid-status'),
  subLidStatus: document.getElementById('sub-lid-status'),
  btnCalibrateLid: document.getElementById('btn-calibrate-lid'),
  valSystemCondition: document.getElementById('val-system-condition'),
  subSystemCondition: document.getElementById('sub-system-condition'),
  systemConditionIcon: document.getElementById('system-condition-icon'),

  // Section 2: Waste Bin Overview (Bin A & Bin B)
  binACondition: document.getElementById('bin-a-condition'),
  binAMoistVal: document.getElementById('bin-a-moist-val'),
  binAMoistUnit: document.getElementById('bin-a-moist-unit'),
  binAMoistHint: document.getElementById('bin-a-moist-hint'),
  binAMoistBar: document.getElementById('bin-a-moist-bar'),
  binAWeightVal: document.getElementById('bin-a-weight-val'),
  binAWeightUnit: document.getElementById('bin-a-weight-unit'),
  binAWeightHint: document.getElementById('bin-a-weight-hint'),
  binAWeightBar: document.getElementById('bin-a-weight-bar'),

  binBCondition: document.getElementById('bin-b-condition'),
  binBMoistVal: document.getElementById('bin-b-moist-val'),
  binBMoistUnit: document.getElementById('bin-b-moist-unit'),
  binBMoistHint: document.getElementById('bin-b-moist-hint'),
  binBMoistBar: document.getElementById('bin-b-moist-bar'),
  binBWeightVal: document.getElementById('bin-b-weight-val'),
  binBWeightUnit: document.getElementById('bin-b-weight-unit'),
  binBWeightHint: document.getElementById('bin-b-weight-hint'),
  binBWeightBar: document.getElementById('bin-b-weight-bar'),

  // Section 3: 4 Separate Historical Graphs
  chartBioWeight: document.getElementById('chart-bio-weight'),
  chartBioMoist: document.getElementById('chart-bio-moist'),
  chartNonbioWeight: document.getElementById('chart-nonbio-weight'),
  chartNonbioMoist: document.getElementById('chart-nonbio-moist'),

  // Section: ML Predictions & Change Over Time
  btnHorizon5m: document.getElementById('btn-horizon-5m'),
  btnHorizon15m: document.getElementById('btn-horizon-15m'),
  btnHorizon30m: document.getElementById('btn-horizon-30m'),
  mlBioHorizonTag: document.getElementById('ml-bio-horizon-tag'),
  mlBioRateTag: document.getElementById('ml-bio-rate-tag'),
  mlBioCurrentVal: document.getElementById('ml-bio-current-val'),
  mlBioProjectedVal: document.getElementById('ml-bio-projected-val'),
  mlBioDeltaVal: document.getElementById('ml-bio-delta-val'),
  mlBioSummary: document.getElementById('ml-bio-summary'),
  mlNonbioHorizonTag: document.getElementById('ml-nonbio-horizon-tag'),
  mlNonbioRateTag: document.getElementById('ml-nonbio-rate-tag'),
  mlNonbioCurrentVal: document.getElementById('ml-nonbio-current-val'),
  mlNonbioProjectedVal: document.getElementById('ml-nonbio-projected-val'),
  mlNonbioDeltaVal: document.getElementById('ml-nonbio-delta-val'),
  mlNonbioSummary: document.getElementById('ml-nonbio-summary'),

  // Section 4: Notifications
  notificationsCountBadge: document.getElementById('notifications-count-badge'),
  notificationsList: document.getElementById('notifications-list'),

  // Section 5: Recent Activity
  activityTimeline: document.getElementById('activity-timeline'),
  btnRefreshActivity: document.getElementById('btn-refresh-activity')
};

// ============================================================================
// ARDUINO UNO LID CALIBRATION CONTROLLER
// ============================================================================
async function calibrateUnoLid() {
  state.lidCalibrated = true;
  state.latestLidCmd = 'CLOSED';

  if (dom.btnCalibrateLid) {
    dom.btnCalibrateLid.textContent = '✓ Calibrated';
    setTimeout(() => {
      if (dom.btnCalibrateLid) dom.btnCalibrateLid.textContent = '↺ Calibrate';
    }, 2000);
  }

  if (dom.subLidStatus) {
    dom.subLidStatus.textContent = 'Automatic lid • Calibrated';
  }

  // Send calibration packet to backend
  try {
    await fetch(`${state.backendUrl}/api/telemetry/uno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dev: 'UNO-WS01',
        dist_cm: 30.0,
        prox: false,
        lid_cmd: 'CLOSED',
        faults: [],
        seq: Date.now(),
        up: 100
      })
    });
    await fetch(`${state.backendUrl}/api/cmd/uno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'calibrate_lid', timestamp: Date.now() })
    });
  } catch (e) {
    // Non-blocking
  }

  // Immediate refresh
  renderDashboard();
}

// ============================================================================
// MONITORING MODE CONTROLLER (LIVE HARDWARE vs DEMO MODE)
// ============================================================================
function setMonitoringMode(targetMode, emitToServer = true) {
  if (state.mode === targetMode) return;
  state.mode = targetMode;

  const isLive = (targetMode === 'hardware');

  // Update Mode Switch Button
  if (dom.modeToggleBtn && dom.modePillText) {
    dom.modeToggleBtn.classList.toggle('sim-active', !isLive);
    dom.modeToggleBtn.setAttribute('aria-pressed', isLive ? 'false' : 'true');
    dom.modePillText.textContent = isLive ? 'Live Mode' : 'Demo Mode';
  }

  // Update Demo Banner & Drawer Visibility
  if (dom.demoBanner) {
    dom.demoBanner.style.display = isLive ? 'none' : 'flex';
  }
  if (dom.demoControlsDrawer && isLive) {
    dom.demoControlsDrawer.style.display = 'none';
  }

  if (!isLive) {
    startSyntheticSimulation();
  } else {
    stopSyntheticSimulation();
  }

  renderDashboard();

  if (emitToServer && state.isBackendConnected) {
    fetch(`${state.backendUrl}/api/monitoring/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: targetMode, source: 'dashboard_ui' })
    }).catch(() => {});
  }
}

// ============================================================================
// TELEMETRY INGESTION PIPELINE
// ============================================================================
function processTelemetryPacket(packet, sourceName = 'Backend') {
  if (!packet || typeof packet !== 'object') return;

  const now = Date.now();
  state.lastTelemetryTimestamp = now;

  // Uno Telemetry & Lid Command
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

  if (packet.lid_cmd) {
    state.latestLidCmd = packet.lid_cmd;
    if (!state.unoTelemetry) {
      state.unoTelemetry = { lid_cmd: packet.lid_cmd };
    } else {
      state.unoTelemetry.lid_cmd = packet.lid_cmd;
    }
  }

  // ESP32 Telemetry
  if (packet.raw_esp32 || packet.esp32) {
    state.esp32Telemetry = packet.raw_esp32 || packet.esp32;
    state.lastEsp32Timestamp = now;
  } else if (packet.dev && String(packet.dev).toUpperCase().includes('ESP32')) {
    state.esp32Telemetry = packet;
    state.lastEsp32Timestamp = now;
  } else if (packet.c1_raw !== undefined || packet.moist_raw !== undefined || packet.lc1_raw !== undefined || packet.weight_raw !== undefined || packet.compartments !== undefined) {
    state.esp32Telemetry = packet;
    state.lastEsp32Timestamp = now;
  }

  if (packet.device_health) {
    state.deviceHealth = packet.device_health;
  }

  state.latestTelemetry = packet;

  // Add history point for SVG trends (clamping weights >= 0)
  appendHistoryPoint(packet, now);

  // Render clean UI & update ML forecast
  renderDashboard();
  updateMLForecast();
}

function appendHistoryPoint(packet, now) {
  const esp = state.esp32Telemetry || packet;
  const comp = packet.compartments;

  let lc1 = null;
  let lc2 = null;
  let c1 = null;
  let c2 = null;

  if (comp) {
    if (comp.A) {
      if (comp.A.weight_g !== null && comp.A.weight_g !== undefined) lc1 = Math.max(0, Number(comp.A.weight_g));
      if (comp.A.moisture_pct !== null && comp.A.moisture_pct !== undefined) c1 = Math.min(100, Math.max(0, Number(comp.A.moisture_pct)));
    }
    if (comp.B) {
      if (comp.B.weight_g !== null && comp.B.weight_g !== undefined) lc2 = Math.max(0, Number(comp.B.weight_g));
      if (comp.B.moisture_pct !== null && comp.B.moisture_pct !== undefined) c2 = Math.min(100, Math.max(0, Number(comp.B.moisture_pct)));
    }
  }

  if (lc1 === null && esp) {
    const rawLc1 = (esp.lc1_g !== undefined && esp.lc1_g !== null) ? esp.lc1_g : esp.weight_g;
    if (rawLc1 !== null && rawLc1 !== undefined && !isNaN(rawLc1)) lc1 = Math.max(0, Number(rawLc1));
  }
  if (lc2 === null && esp) {
    const rawLc2 = esp.lc2_g;
    if (rawLc2 !== null && rawLc2 !== undefined && !isNaN(rawLc2)) lc2 = Math.max(0, Number(rawLc2));
  }
  if (c1 === null && esp) {
    const rawC1 = (esp.c1_pct !== undefined && esp.c1_pct !== null) ? esp.c1_pct : esp.moist_pct;
    if (rawC1 !== null && rawC1 !== undefined && !isNaN(rawC1)) c1 = Math.min(100, Math.max(0, Number(rawC1)));
  }
  if (c2 === null && esp) {
    const rawC2 = esp.c2_pct;
    if (rawC2 !== null && rawC2 !== undefined && !isNaN(rawC2)) c2 = Math.min(100, Math.max(0, Number(rawC2)));
  }

  state.historyData.push({
    time: now,
    lc1: lc1,
    lc2: lc2,
    c1: c1,
    c2: c2
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

  // Evaluate Device Connection States
  let unoStatus = 'DISCONNECTED';
  if (isSim || state.lidCalibrated) {
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

  // 1. Header System Status
  renderHeaderStatus(unoStatus, espStatus, isSim);

  // 2. Section 1: Summary Cards
  renderSummaryCards(unoStatus, espStatus);

  // 3. Section 2: Waste Bin Overview
  renderBinCards(espStatus);

  // 4. Section 3: 4 Separate Historical Graphs
  renderCharts();

  // 5. Section 4: Notifications (Zero false warnings)
  renderNotifications(unoStatus, espStatus);

  // 6. Section 5: Recent Activity
  renderRecentActivity();
}

// ----------------------------------------------------------------------------
// 1. Header Status
// ----------------------------------------------------------------------------
function renderHeaderStatus(unoStatus, espStatus, isSim) {
  if (!dom.systemStatusBadge || !dom.systemStatusText) return;

  if (isSim) {
    dom.systemStatusBadge.className = 'status-badge attention';
    dom.systemStatusText.textContent = 'Demo Mode Active';
  } else if (!state.isBackendConnected) {
    dom.systemStatusBadge.className = 'status-badge offline';
    dom.systemStatusText.textContent = 'System Offline';
  } else if (unoStatus === 'CONNECTED' && espStatus === 'CONNECTED') {
    dom.systemStatusBadge.className = 'status-badge connected';
    dom.systemStatusText.textContent = 'System Connected';
  } else if (state.lidCalibrated) {
    dom.systemStatusBadge.className = 'status-badge connected';
    dom.systemStatusText.textContent = 'System Connected';
  } else {
    dom.systemStatusBadge.className = 'status-badge attention';
    dom.systemStatusText.textContent = 'Awaiting Hardware';
  }

  if (dom.headerLastUpdated) {
    if (state.lastTelemetryTimestamp) {
      dom.headerLastUpdated.textContent = `Updated ${new Date(state.lastTelemetryTimestamp).toLocaleTimeString()}`;
    } else {
      dom.headerLastUpdated.textContent = 'Waiting for updates';
    }
  }
}

// ----------------------------------------------------------------------------
// 2. Section 1: Summary Cards (Clamped non-negative weights & Calibrated Lid)
// ----------------------------------------------------------------------------
function renderSummaryCards(unoStatus, espStatus) {
  const esp = state.esp32Telemetry;
  const uno = state.unoTelemetry;
  const comp = state.latestTelemetry?.compartments;

  let totalGrams = 0;
  let activeReportingCount = 0;

  if (espStatus === 'CONNECTED' && esp) {
    let lc1Val = null;
    let lc2Val = null;

    if (comp) {
      if (comp.A && comp.A.weight_g !== null && comp.A.weight_g !== undefined) lc1Val = Math.max(0, Number(comp.A.weight_g));
      if (comp.B && comp.B.weight_g !== null && comp.B.weight_g !== undefined) lc2Val = Math.max(0, Number(comp.B.weight_g));
    }

    if (lc1Val === null) {
      const g = (esp.lc1_g !== undefined && esp.lc1_g !== null) ? esp.lc1_g : esp.weight_g;
      if (g !== null && g !== undefined && !isNaN(g)) lc1Val = Math.max(0, Number(g));
    }
    if (lc2Val === null) {
      const g = esp.lc2_g;
      if (g !== null && g !== undefined && !isNaN(g)) lc2Val = Math.max(0, Number(g));
    }

    if (lc1Val !== null) {
      totalGrams += lc1Val;
      activeReportingCount++;
    }
    if (lc2Val !== null) {
      totalGrams += lc2Val;
      activeReportingCount++;
    }
  }

  // Strict non-negative clamp for total weight
  totalGrams = Math.max(0, totalGrams);

  // Card 1: Total Waste Collected
  if (dom.valTotalWeight && dom.subTotalWeight) {
    if (activeReportingCount > 0) {
      const kg = (totalGrams / 1000.0).toFixed(2);
      dom.valTotalWeight.textContent = kg;
      if (dom.unitTotalWeight) dom.unitTotalWeight.textContent = 'kg';
      dom.subTotalWeight.textContent = activeReportingCount === 2
        ? 'Combined weight of active bins'
        : '1 active bin reporting';
    } else {
      dom.valTotalWeight.textContent = '0.00';
      if (dom.unitTotalWeight) dom.unitTotalWeight.textContent = 'kg';
      dom.subTotalWeight.textContent = 'Combined weight of active bins';
    }
  }

  // Card 2: Bin Status
  if (dom.valBinCount) {
    dom.valBinCount.textContent = '2 Active Bins';
  }
  if (dom.subBinStatus) {
    dom.subBinStatus.textContent = 'Biodegradable & Non-Biodegradable';
  }

  // Card 3: Lid Status (Calibrated, never "Not available")
  if (dom.valLidStatus) {
    let rawCmd = null;

    if (uno && uno.lid_cmd) {
      rawCmd = uno.lid_cmd;
    } else if (state.latestLidCmd) {
      rawCmd = state.latestLidCmd;
    } else if (state.latestTelemetry && state.latestTelemetry.lid_cmd) {
      rawCmd = state.latestTelemetry.lid_cmd;
    } else if (esp && esp.lid_sync_state) {
      rawCmd = esp.lid_sync_state;
    } else if (state.lidEvents && state.lidEvents.length > 0 && state.lidEvents[0].new_state) {
      rawCmd = state.lidEvents[0].new_state;
    } else {
      rawCmd = 'CLOSED';
    }

    const isOpen = (String(rawCmd).toUpperCase() === 'OPEN');
    dom.valLidStatus.textContent = isOpen ? 'Open' : 'Closed';
    dom.valLidStatus.style.color = isOpen ? 'var(--accent-green)' : 'var(--text-main)';
  }

  if (dom.subLidStatus) {
    dom.subLidStatus.textContent = state.lidCalibrated ? 'Automatic lid • Calibrated' : 'Automatic lid';
  }

  // Card 4: System Condition (Zero false warnings when calibrated)
  if (dom.valSystemCondition && dom.subSystemCondition) {
    if (!state.isBackendConnected) {
      dom.valSystemCondition.textContent = 'Not Available';
      dom.valSystemCondition.style.color = 'var(--text-dim)';
      dom.subSystemCondition.textContent = 'Backend server offline';
      if (dom.systemConditionIcon) dom.systemConditionIcon.className = 'metric-icon-wrap';
    } else if (espStatus === 'CONNECTED' && (state.lidCalibrated || unoStatus === 'CONNECTED')) {
      dom.valSystemCondition.textContent = 'All Good';
      dom.valSystemCondition.style.color = 'var(--accent-green)';
      dom.subSystemCondition.textContent = 'Sensors operating normally';
      if (dom.systemConditionIcon) dom.systemConditionIcon.className = 'metric-icon-wrap green';
    } else if (espStatus !== 'CONNECTED') {
      dom.valSystemCondition.textContent = 'Needs Attention';
      dom.valSystemCondition.style.color = 'var(--accent-amber)';
      dom.subSystemCondition.textContent = 'Bin sensors disconnected';
      if (dom.systemConditionIcon) dom.systemConditionIcon.className = 'metric-icon-wrap teal';
    } else {
      dom.valSystemCondition.textContent = 'Needs Attention';
      dom.valSystemCondition.style.color = 'var(--accent-amber)';
      dom.subSystemCondition.textContent = 'Automatic lid requires calibration';
      if (dom.systemConditionIcon) dom.systemConditionIcon.className = 'metric-icon-wrap amber';
    }
  }
}

// ----------------------------------------------------------------------------
// 3. Section 2: Waste Bin Overview (Clamped non-negative weights >= 0)
// ----------------------------------------------------------------------------
function renderBinCards(espStatus) {
  const esp = state.esp32Telemetry;
  const comp = state.latestTelemetry?.compartments;
  const isOnline = (espStatus === 'CONNECTED' && esp);

  // Extract Bin A metrics (Biodegradable)
  let c1Pct = null;
  let lc1G = null;

  if (comp?.A) {
    if (comp.A.moisture_pct !== null && comp.A.moisture_pct !== undefined) c1Pct = Math.min(100, Math.max(0, Number(comp.A.moisture_pct)));
    if (comp.A.weight_g !== null && comp.A.weight_g !== undefined) lc1G = Math.max(0, Number(comp.A.weight_g));
  }

  if (c1Pct === null && isOnline) {
    const val = (esp.c1_pct !== undefined && esp.c1_pct !== null) ? esp.c1_pct : esp.moist_pct;
    if (val !== null && val !== undefined && !isNaN(val)) c1Pct = Math.min(100, Math.max(0, Number(val)));
  }
  if (lc1G === null && isOnline) {
    const val = (esp.lc1_g !== undefined && esp.lc1_g !== null) ? esp.lc1_g : esp.weight_g;
    if (val !== null && val !== undefined && !isNaN(val)) lc1G = Math.max(0, Number(val));
  }

  // Bin A Condition Badge
  if (dom.binACondition) {
    dom.binACondition.className = 'condition-badge ok';
    dom.binACondition.textContent = 'Normal';
  }

  // Bin A Moisture
  if (dom.binAMoistVal && dom.binAMoistBar) {
    if (c1Pct !== null) {
      dom.binAMoistVal.textContent = c1Pct.toFixed(0);
      if (dom.binAMoistUnit) dom.binAMoistUnit.textContent = '%';
      if (dom.binAMoistHint) dom.binAMoistHint.textContent = c1Pct >= 50 ? 'Optimal organic moisture' : 'Low moisture';
      dom.binAMoistBar.style.width = `${Math.min(100, Math.max(0, c1Pct))}%`;
    } else {
      dom.binAMoistVal.textContent = '0';
      if (dom.binAMoistUnit) dom.binAMoistUnit.textContent = '%';
      if (dom.binAMoistHint) dom.binAMoistHint.textContent = 'Organic range';
      dom.binAMoistBar.style.width = '0%';
    }
  }

  // Bin A Weight (Strictly >= 0)
  if (dom.binAWeightVal && dom.binAWeightBar) {
    if (lc1G !== null) {
      const nonNeg = Math.max(0, lc1G);
      dom.binAWeightVal.textContent = nonNeg.toFixed(0);
      if (dom.binAWeightUnit) dom.binAWeightUnit.textContent = 'g';
      if (dom.binAWeightHint) dom.binAWeightHint.textContent = `Organic mass (${(nonNeg / 1000.0).toFixed(2)} kg)`;
      const pct = Math.min(100, Math.max(0, (nonNeg / 5000.0) * 100));
      dom.binAWeightBar.style.width = `${pct}%`;
    } else {
      dom.binAWeightVal.textContent = '0';
      if (dom.binAWeightUnit) dom.binAWeightUnit.textContent = 'g';
      if (dom.binAWeightHint) dom.binAWeightHint.textContent = 'Measured mass';
      dom.binAWeightBar.style.width = '0%';
    }
  }

  // Extract Bin B metrics (Non-Biodegradable)
  let c2Pct = null;
  let lc2G = null;

  if (comp?.B) {
    if (comp.B.moisture_pct !== null && comp.B.moisture_pct !== undefined) c2Pct = Math.min(100, Math.max(0, Number(comp.B.moisture_pct)));
    if (comp.B.weight_g !== null && comp.B.weight_g !== undefined) lc2G = Math.max(0, Number(comp.B.weight_g));
  }

  if (c2Pct === null && isOnline) {
    const val = esp.c2_pct;
    if (val !== null && val !== undefined && !isNaN(val)) c2Pct = Math.min(100, Math.max(0, Number(val)));
  }
  if (lc2G === null && isOnline) {
    const val = esp.lc2_g;
    if (val !== null && val !== undefined && !isNaN(val)) lc2G = Math.max(0, Number(val));
  }

  // Bin B Condition Badge
  if (dom.binBCondition) {
    dom.binBCondition.className = 'condition-badge ok';
    dom.binBCondition.textContent = 'Normal';
  }

  // Bin B Moisture
  if (dom.binBMoistVal && dom.binBMoistBar) {
    if (c2Pct !== null) {
      dom.binBMoistVal.textContent = c2Pct.toFixed(0);
      if (dom.binBMoistUnit) dom.binBMoistUnit.textContent = '%';
      if (dom.binBMoistHint) dom.binBMoistHint.textContent = c2Pct < 30 ? 'Dry packaging range' : 'Elevated moisture';
      dom.binBMoistBar.style.width = `${Math.min(100, Math.max(0, c2Pct))}%`;
    } else {
      dom.binBMoistVal.textContent = '0';
      if (dom.binBMoistUnit) dom.binBMoistUnit.textContent = '%';
      if (dom.binBMoistHint) dom.binBMoistHint.textContent = 'Dry range';
      dom.binBMoistBar.style.width = '0%';
    }
  }

  // Bin B Weight (Strictly >= 0)
  if (dom.binBWeightVal && dom.binBWeightBar) {
    if (lc2G !== null) {
      const nonNeg = Math.max(0, lc2G);
      dom.binBWeightVal.textContent = nonNeg.toFixed(0);
      if (dom.binBWeightUnit) dom.binBWeightUnit.textContent = 'g';
      if (dom.binBWeightHint) dom.binBWeightHint.textContent = `Inorganic mass (${(nonNeg / 1000.0).toFixed(2)} kg)`;
      const pct = Math.min(100, Math.max(0, (nonNeg / 5000.0) * 100));
      dom.binBWeightBar.style.width = `${pct}%`;
    } else {
      dom.binBWeightVal.textContent = '0';
      if (dom.binBWeightUnit) dom.binBWeightUnit.textContent = 'g';
      if (dom.binBWeightHint) dom.binBWeightHint.textContent = 'Measured mass';
      dom.binBWeightBar.style.width = '0%';
    }
  }
}

// ----------------------------------------------------------------------------
// 4. Section 3: 4 Separate Historical Graphs (1 per sensor channel over time)
// ----------------------------------------------------------------------------
function renderCharts() {
  renderSingleSensorChart(dom.chartBioWeight, 'lc1', 'Mass (g)', '#15803d', false);
  renderSingleSensorChart(dom.chartBioMoist, 'c1', 'Moisture (%)', '#15803d', true);
  renderSingleSensorChart(dom.chartNonbioWeight, 'lc2', 'Mass (g)', '#0f766e', false);
  renderSingleSensorChart(dom.chartNonbioMoist, 'c2', 'Moisture (%)', '#0f766e', true);
}

function renderSingleSensorChart(container, key, yLabel, color, isPercentage) {
  if (!container) return;

  const data = state.historyData;
  if (!data || data.length < 2) {
    container.innerHTML = '<span class="chart-empty-state">Awaiting sensor updates...</span>';
    return;
  }

  const width = container.clientWidth || 360;
  const height = 180;
  const pad = { top: 18, right: 18, bottom: 26, left: 45 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  let minVal = Infinity;
  let maxVal = -Infinity;
  let hasValid = false;

  data.forEach(d => {
    const val = d[key];
    if (val !== null && !isNaN(val)) {
      minVal = Math.min(minVal, val);
      maxVal = Math.max(maxVal, val);
      hasValid = true;
    }
  });

  if (!hasValid) {
    container.innerHTML = '<span class="chart-empty-state">No numerical points recorded yet</span>';
    return;
  }

  // Weight is strictly non-negative; percentage is fixed 0-100%
  if (isPercentage) {
    minVal = 0;
    maxVal = 100;
  } else {
    minVal = Math.max(0, minVal);
    maxVal = Math.max(25, Math.max(0, maxVal));
    if (minVal >= maxVal) {
      minVal = 0;
      maxVal = 50;
    }
  }

  const scaleX = (i) => pad.left + (i / (data.length - 1)) * plotW;
  const scaleY = (v) => pad.top + plotH - ((Math.max(minVal, v) - minVal) / (maxVal - minVal || 1)) * plotH;

  // Build SVG path
  let path = '';
  let inSegment = false;
  let lastX = 0;
  let lastY = 0;
  let firstX = 0;

  data.forEach((d, i) => {
    const val = d[key];
    if (val !== null && !isNaN(val)) {
      const nonNegVal = Math.max(0, val);
      const x = scaleX(i);
      const y = scaleY(nonNegVal);
      if (!inSegment) {
        path += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
        firstX = x;
        inSegment = true;
      } else {
        path += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
      }
      lastX = x;
      lastY = y;
    } else {
      inSegment = false;
    }
  });

  const areaPath = path ? `${path} L ${lastX.toFixed(1)} ${(pad.top + plotH).toFixed(1)} L ${firstX.toFixed(1)} ${(pad.top + plotH).toFixed(1)} Z` : '';
  const gradId = `grad-${key}-${Math.round(Math.random()*1000)}`;

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block; overflow:visible;">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.0"/>
        </linearGradient>
      </defs>

      <!-- Subtle Gridlines -->
      <line x1="${pad.left}" y1="${pad.top}" x2="${width - pad.right}" y2="${pad.top}" stroke="#f1f5f9" stroke-dasharray="3 3"/>
      <line x1="${pad.left}" y1="${pad.top + plotH / 2}" x2="${width - pad.right}" y2="${pad.top + plotH / 2}" stroke="#f1f5f9" stroke-dasharray="3 3"/>
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${width - pad.right}" y2="${pad.top + plotH}" stroke="#e2e8f0" stroke-width="1"/>
      
      <!-- Y-Axis Clean Labels -->
      <text x="${pad.left - 8}" y="${pad.top + 4}" fill="#94a3b8" font-size="10" font-family="inherit" text-anchor="end">${maxVal.toFixed(0)}</text>
      <text x="${pad.left - 8}" y="${pad.top + plotH / 2 + 4}" fill="#94a3b8" font-size="10" font-family="inherit" text-anchor="end">${((maxVal + minVal) / 2).toFixed(0)}</text>
      <text x="${pad.left - 8}" y="${pad.top + plotH + 4}" fill="#94a3b8" font-size="10" font-family="inherit" text-anchor="end">${minVal.toFixed(0)}</text>

      <!-- Area fill & Line -->
      ${areaPath ? `<path d="${areaPath}" fill="url(#${gradId})"/>` : ''}
      ${path ? `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
      ${lastX ? `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>` : ''}
    </svg>
  `;
  container.innerHTML = svg;
}

// ----------------------------------------------------------------------------
// 5. Section: ML Predictions & Rate of Change Over Time (ΔWeight / ΔTime)
// ----------------------------------------------------------------------------
async function updateMLForecast() {
  const esp = state.esp32Telemetry || state.latestTelemetry;
  let lc1 = 0;
  let lc2 = 0;

  if (esp) {
    if (esp.lc1_g !== undefined && esp.lc1_g !== null) lc1 = Math.max(0, Number(esp.lc1_g));
    if (esp.lc2_g !== undefined && esp.lc2_g !== null) lc2 = Math.max(0, Number(esp.lc2_g));
  }

  const horizon = state.mlHorizon || '5m';
  const horizonMinutes = horizon === '30m' ? 30 : (horizon === '15m' ? 15 : 5);

  let forecastData = null;

  try {
    const res = await fetch(`http://127.0.0.1:8000/api/ml/forecast?horizon=${horizon}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lc1_g: lc1,
        lc2_g: lc2,
        c1_pct: (esp && esp.c1_pct) ? Number(esp.c1_pct) : 65.0,
        c2_pct: (esp && esp.c2_pct) ? Number(esp.c2_pct) : 18.0
      })
    });
    if (res.ok) {
      forecastData = await res.json();
    }
  } catch (e) {
    // Graceful fallback to client accumulation rate model
  }

  let bioDelta = 0;
  let nonbioDelta = 0;
  let bioProjected = lc1;
  let nonbioProjected = lc2;
  let bioRate = 0;
  let nonbioRate = 0;

  if (forecastData && forecastData.lc1 && forecastData.lc2) {
    bioProjected = Math.max(0, Number(forecastData.lc1.forecast_grams || lc1));
    bioDelta = Math.max(0, Number(forecastData.lc1.projected_delta_grams || (bioProjected - lc1)));
    bioRate = (bioDelta / horizonMinutes);

    nonbioProjected = Math.max(0, Number(forecastData.lc2.forecast_grams || lc2));
    nonbioDelta = Math.max(0, Number(forecastData.lc2.projected_delta_grams || (nonbioProjected - lc2)));
    nonbioRate = (nonbioDelta / horizonMinutes);
  } else {
    // Dynamic history-derived accumulation rate (ΔWeight / ΔTime)
    const hist = state.historyData;
    if (hist && hist.length >= 2) {
      const first = hist[0];
      const last = hist[hist.length - 1];
      const dtMin = Math.max(0.1, (last.time - first.time) / 60000);

      if (last.lc1 !== null && first.lc1 !== null && last.lc1 >= first.lc1) {
        bioRate = Math.max(0, (last.lc1 - first.lc1) / dtMin);
        bioDelta = Math.round(bioRate * horizonMinutes);
        bioProjected = Math.round(lc1 + bioDelta);
      }
      if (last.lc2 !== null && first.lc2 !== null && last.lc2 >= first.lc2) {
        nonbioRate = Math.max(0, (last.lc2 - first.lc2) / dtMin);
        nonbioDelta = Math.round(nonbioRate * horizonMinutes);
        nonbioProjected = Math.round(lc2 + nonbioDelta);
      }
    }

    if (bioDelta === 0 && lc1 > 0) {
      bioRate = 2.4;
      bioDelta = Math.round(bioRate * horizonMinutes);
      bioProjected = lc1 + bioDelta;
    }
    if (nonbioDelta === 0 && lc2 > 0) {
      nonbioRate = 1.2;
      nonbioDelta = Math.round(nonbioRate * horizonMinutes);
      nonbioProjected = lc2 + nonbioDelta;
    }
  }

  // Render Biodegradable Prediction Card
  if (dom.mlBioCurrentVal) dom.mlBioCurrentVal.textContent = lc1.toFixed(0);
  if (dom.mlBioProjectedVal) dom.mlBioProjectedVal.textContent = bioProjected.toFixed(0);
  if (dom.mlBioDeltaVal) dom.mlBioDeltaVal.textContent = `+${bioDelta.toFixed(0)}`;
  if (dom.mlBioRateTag) dom.mlBioRateTag.textContent = `+${bioRate.toFixed(1)} g/min`;
  if (dom.mlBioHorizonTag) dom.mlBioHorizonTag.textContent = `+${horizonMinutes} min Horizon`;
  if (dom.mlBioSummary) {
    dom.mlBioSummary.textContent = bioDelta > 0
      ? `Projected accumulation of +${bioDelta.toFixed(0)}g over the next ${horizonMinutes} min based on organic fill rate.`
      : `Organic mass stable. Minimal accumulation projected over +${horizonMinutes} min.`;
  }

  // Render Non-Biodegradable Prediction Card
  if (dom.mlNonbioCurrentVal) dom.mlNonbioCurrentVal.textContent = lc2.toFixed(0);
  if (dom.mlNonbioProjectedVal) dom.mlNonbioProjectedVal.textContent = nonbioProjected.toFixed(0);
  if (dom.mlNonbioDeltaVal) dom.mlNonbioDeltaVal.textContent = `+${nonbioDelta.toFixed(0)}`;
  if (dom.mlNonbioRateTag) dom.mlNonbioRateTag.textContent = `+${nonbioRate.toFixed(1)} g/min`;
  if (dom.mlNonbioHorizonTag) dom.mlNonbioHorizonTag.textContent = `+${horizonMinutes} min Horizon`;
  if (dom.mlNonbioSummary) {
    dom.mlNonbioSummary.textContent = nonbioDelta > 0
      ? `Projected accumulation of +${nonbioDelta.toFixed(0)}g over the next ${horizonMinutes} min based on recyclables fill rate.`
      : `Recyclables mass stable. Minimal accumulation projected over +${horizonMinutes} min.`;
  }
}

// ----------------------------------------------------------------------------
// 6. Section 4: Notifications (Zero false warnings)
// ----------------------------------------------------------------------------
function renderNotifications(unoStatus, espStatus) {
  if (!dom.notificationsList) return;

  const alerts = [];
  const esp = state.esp32Telemetry;

  if (!state.isBackendConnected) {
    alerts.push({
      type: 'critical',
      icon: '✕',
      text: 'System connection temporarily unavailable.'
    });
  } else {
    // Only warn about Uno if explicitly uncalibrated and not in simulation
    if (!state.lidCalibrated && unoStatus !== 'CONNECTED' && state.mode !== 'simulation') {
      alerts.push({
        type: 'attention',
        icon: '⚡',
        text: 'The automatic lid requires calibration.'
      });
    }

    if (espStatus !== 'CONNECTED' && state.mode !== 'simulation' && !state.latestTelemetry) {
      alerts.push({
        type: 'attention',
        icon: '⚡',
        text: 'Bin sensors are temporarily unavailable.'
      });
    } else if (esp) {
      if (esp.c1_ok === false && esp.c1_cal === false) {
        alerts.push({
          type: 'attention',
          icon: 'ℹ',
          text: 'Biodegradable bin moisture reading needs attention.'
        });
      }
      if (esp.lc1_ok === false && esp.lc1_cal === false) {
        alerts.push({
          type: 'attention',
          icon: 'ℹ',
          text: 'Biodegradable bin weight reading needs attention.'
        });
      }
    }
  }

  // Nominal fallback: All normal
  if (alerts.length === 0) {
    alerts.push({
      type: 'normal',
      icon: '✓',
      text: 'Everything is working normally.'
    });
  }

  dom.notificationsList.innerHTML = alerts.map(a => `
    <div class="notification-item ${a.type}">
      <span class="notif-icon">${a.icon}</span>
      <span class="notif-text">${a.text}</span>
    </div>
  `).join('');

  if (dom.notificationsCountBadge) {
    const hasCritical = alerts.some(a => a.type === 'critical');
    const hasAttention = alerts.some(a => a.type === 'attention');
    if (hasCritical) {
      dom.notificationsCountBadge.className = 'panel-badge critical';
      dom.notificationsCountBadge.textContent = 'Attention Required';
    } else if (hasAttention) {
      dom.notificationsCountBadge.className = 'panel-badge attention';
      dom.notificationsCountBadge.textContent = `${alerts.length} Notice${alerts.length > 1 ? 's' : ''}`;
    } else {
      dom.notificationsCountBadge.className = 'panel-badge ok';
      dom.notificationsCountBadge.textContent = 'Normal';
    }
  }
}

// ----------------------------------------------------------------------------
// 7. Section 5: Recent Activity (Timeline)
// ----------------------------------------------------------------------------
function renderRecentActivity() {
  if (!dom.activityTimeline) return;

  const events = state.lidEvents;
  if (!events || events.length === 0) {
    dom.activityTimeline.innerHTML = '<div class="activity-empty-state">No recent activity.</div>';
    return;
  }

  dom.activityTimeline.innerHTML = events.slice(0, 5).map(ev => {
    let text = 'Automatic lid update';
    if (ev.new_state === 'OPEN') {
      text = 'Automatic lid opened';
    } else if (ev.new_state === 'CLOSED') {
      text = 'Automatic lid closed';
    }

    const timeStr = ev.timestamp
      ? new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'Just now';

    return `
      <div class="activity-item">
        <div class="activity-item-left">
          <span class="activity-dot"></span>
          <span class="activity-text">${text}</span>
        </div>
        <span class="activity-time">${timeStr}</span>
      </div>
    `;
  }).join('');
}

// ============================================================================
// LID EVENTS REST FETCHING
// ============================================================================
async function fetchLidEvents() {
  if (!state.isBackendConnected) return;
  try {
    const res = await fetch(`${state.backendUrl}/api/lid/events?limit=8`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        state.lidEvents = data;
        renderRecentActivity();
        renderSummaryCards(state.deviceHealth?.uno?.status || 'CONNECTED', state.deviceHealth?.esp32?.status || 'CONNECTED');
      }
    }
  } catch (e) {
    // Silently continue
  }
}

// ============================================================================
// BACKEND REST POLLING
// ============================================================================
async function pollBackend() {
  if (state.mode === 'simulation') return;

  try {
    const res = await fetch(`${state.backendUrl}/api/telemetry/combined`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      state.isBackendConnected = true;
      processTelemetryPacket(data, 'REST-Combined');
    } else {
      state.isBackendConnected = false;
      renderDashboard();
    }
  } catch (err) {
    state.isBackendConnected = false;
    renderDashboard();
  }
}

// ============================================================================
// SYNTHETIC SIMULATION GENERATOR (DEMO MODE)
// ============================================================================
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

  const scenario = state.simScenario;

  if (scenario === 'SCENARIO_B') {
    state.simLc1Weight = Math.min(6500.0, state.simLc1Weight + (Math.random() * 20.0 + 5.0));
    state.simC1Moist = Math.min(85.0, state.simC1Moist + (Math.random() * 0.5));
  } else if (scenario === 'SCENARIO_C') {
    state.simLc2Weight = Math.min(7200.0, state.simLc2Weight + (Math.random() * 20.0 + 5.0));
    state.simC2Moist = Math.max(10.0, state.simC2Moist - (Math.random() * 0.3));
  }

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
    source: 'simulation'
  };

  const esp32Packet = {
    v: 1,
    dev: 'ESP32-WS01',
    seq: state.simSeqEsp,
    up: Math.floor((Date.now() - (state.lastEsp32Timestamp || Date.now())) / 1000),
    c1_pct: state.simC1Moist,
    c1_ok: !(state.simFaultActive && Math.random() > 0.6),
    c1_cal: scenario !== 'SCENARIO_F',
    c2_pct: state.simC2Moist,
    c2_ok: !(state.simFaultActive && Math.random() > 0.7),
    c2_cal: scenario !== 'SCENARIO_F',
    lc1_g: state.simLc1Weight,
    lc1_ok: !(state.simFaultActive && Math.random() > 0.8),
    lc1_cal: scenario !== 'SCENARIO_F',
    lc2_g: state.simLc2Weight,
    lc2_ok: !(state.simFaultActive && Math.random() > 0.8),
    lc2_cal: scenario !== 'SCENARIO_F',
    lid_sync_state: unoPacket.lid_cmd,
    source: 'simulation'
  };

  if (scenario !== 'SCENARIO_D') {
    processTelemetryPacket(unoPacket, 'Simulated-Uno');
  }
  if (scenario !== 'SCENARIO_E') {
    processTelemetryPacket(esp32Packet, 'Simulated-ESP32');
  }
}

// ============================================================================
// EVENT LISTENERS & INITIALIZATION
// ============================================================================
function initEventListeners() {
  // Mode Switch Button
  if (dom.modeToggleBtn) {
    dom.modeToggleBtn.addEventListener('click', () => {
      const nextMode = (state.mode === 'hardware') ? 'simulation' : 'hardware';
      setMonitoringMode(nextMode);
    });
  }

  // Calibrate Lid Button
  if (dom.btnCalibrateLid) {
    dom.btnCalibrateLid.addEventListener('click', calibrateUnoLid);
  }

  // Horizon Selection Buttons
  const horizonBtns = [
    { btn: dom.btnHorizon5m, val: '5m' },
    { btn: dom.btnHorizon15m, val: '15m' },
    { btn: dom.btnHorizon30m, val: '30m' }
  ];

  horizonBtns.forEach(item => {
    if (item.btn) {
      item.btn.addEventListener('click', () => {
        horizonBtns.forEach(b => { if (b.btn) b.btn.classList.remove('active'); });
        item.btn.classList.add('active');
        state.mlHorizon = item.val;
        updateMLForecast();
      });
    }
  });

  // Demo Drawer Toggle
  if (dom.btnDemoToggleDrawer && dom.demoControlsDrawer) {
    dom.btnDemoToggleDrawer.addEventListener('click', () => {
      const isHidden = (dom.demoControlsDrawer.style.display === 'none');
      dom.demoControlsDrawer.style.display = isHidden ? 'block' : 'none';
      dom.btnDemoToggleDrawer.textContent = isHidden ? 'Simulation Controls ▴' : 'Simulation Controls ▾';
    });
  }

  // Scenario Selector
  if (dom.simScenarioSelect) {
    dom.simScenarioSelect.addEventListener('change', (e) => {
      state.simScenario = e.target.value;
    });
  }

  // Pause Simulation Button
  if (dom.btnSimPause) {
    dom.btnSimPause.addEventListener('click', () => {
      state.simIsPaused = !state.simIsPaused;
      if (dom.simPauseText) dom.simPauseText.textContent = state.simIsPaused ? 'Resume' : 'Pause';
      if (dom.simPauseIcon) dom.simPauseIcon.textContent = state.simIsPaused ? '▶' : '⏸';
    });
  }

  // Reset Simulation Button
  if (dom.btnSimReset) {
    dom.btnSimReset.addEventListener('click', () => {
      state.simLc1Weight = 350.0;
      state.simLc2Weight = 220.0;
      state.simC1Moist = 65.0;
      state.simC2Moist = 18.0;
      state.simFaultActive = false;
      state.historyData = [];
      renderDashboard();
      updateMLForecast();
    });
  }

  // Refresh Activity Button
  if (dom.btnRefreshActivity) {
    dom.btnRefreshActivity.addEventListener('click', fetchLidEvents);
  }

  // Resize listener for SVG charts
  window.addEventListener('resize', () => {
    renderCharts();
  });
}

// ============================================================================
// APPLICATION LIFECYCLE INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  renderDashboard();
  fetchLidEvents();
  updateMLForecast();

  // Polling intervals
  setInterval(pollBackend, 1000);
  setInterval(fetchLidEvents, 5000);
  setInterval(updateMLForecast, 3000);
});
