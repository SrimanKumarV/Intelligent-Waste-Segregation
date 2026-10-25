/**
 * Intelligent Solid Waste Segregation System — Digital Twin & Dashboard
 * Mirrors src/detection.cpp, src/leds.cpp, and src/sensors.cpp logic.
 */

// Configuration Constants (matching config.h)
const CONFIG = {
  GAS_THRESHOLD_HIGH: 1500,
  GAS_THRESHOLD_LOW: 800,
  MOISTURE_THRESHOLD_WET: 1500,
  MOISTURE_THRESHOLD_DRY: 3000,
  MOISTURE_POLARITY_INVERTED: true,
  BIN_DEPTH_CM: 40.0,
  BIN_LEVEL_NEAR_FULL_PCT: 75.0,
  BIN_LEVEL_FULL_PCT: 90.0,
  MISMATCH_PERSISTENCE_COUNT: 3,
  EVIDENCE_WEIGHT_METAL: 40,
  EVIDENCE_WEIGHT_MOISTURE: 20,
  EVIDENCE_WEIGHT_GAS: 15,
  MISMATCH_SCORE_THRESHOLD: 30,
  MONITORING_INTERVAL_MS: 2000,
};

// State
let simState = {
  // Gas
  gasRaw: 650,
  gasWarmupComplete: true,
  gasFault: false,

  // Bio Bin
  bioMoistRaw: 3400, // Dry default
  bioMoistFault: false,
  bioMetalDetected: false,
  bioMetalFault: false,
  bioWeightGrams: 150,
  bioWeightFault: false,
  bioDistanceCm: 32.0, // ~20% fill
  bioDistanceFault: false,
  bioPersistence: 0,
  bioMismatchAlert: false,

  // Non-Bio Bin
  nonbioMoistRaw: 3500, // Dry default
  nonbioMoistFault: false,
  nonbioMetalDetected: false,
  nonbioMetalFault: false,
  nonbioWeightGrams: 280,
  nonbioWeightFault: false,
  nonbioDistanceCm: 30.0, // ~25% fill
  nonbioDistanceFault: false,
  nonbioPersistence: 0,
  nonbioMismatchAlert: false,

  // Modes
  csvMode: false,
  cycleCount: 0,
  liveSerialPort: null,
  isLiveConnected: false,
};

// Analysis Output
let lastAnalysis = {
  bioEvidenceScore: 0,
  nonbioEvidenceScore: 0,
  bioMismatchFlag: false,
  nonbioMismatchFlag: false,
  bioFillPct: 20,
  nonbioFillPct: 25,
  bioFull: false,
  nonbioFull: false,
  hasFault: false,
};

// DOM Elements
const elements = {
  // LED Lamps
  ledOk: document.getElementById('led-ok'),
  ledBioMis: document.getElementById('led-bio-mis'),
  ledNonbioMis: document.getElementById('led-nonbio-mis'),
  ledFull: document.getElementById('led-full'),
  ledFault: document.getElementById('led-fault'),

  // Bin 1 (Bio)
  bioFillBar: document.getElementById('bio-fill-bar'),
  bioFillText: document.getElementById('bio-fill-text'),
  bioStatusPill: document.getElementById('bio-status-pill'),
  bioMoistSlider: document.getElementById('bio-moist-slider'),
  bioMoistVal: document.getElementById('bio-moist-val'),
  bioMetalToggle: document.getElementById('bio-metal-toggle'),
  bioWeightSlider: document.getElementById('bio-weight-slider'),
  bioWeightVal: document.getElementById('bio-weight-val'),
  bioFillSlider: document.getElementById('bio-fill-slider'),
  bioDistanceVal: document.getElementById('bio-dist-val'),

  // Bin 2 (Non-Bio)
  nonbioFillBar: document.getElementById('nonbio-fill-bar'),
  nonbioFillText: document.getElementById('nonbio-fill-text'),
  nonbioStatusPill: document.getElementById('nonbio-status-pill'),
  nonbioMoistSlider: document.getElementById('nonbio-moist-slider'),
  nonbioMoistVal: document.getElementById('nonbio-moist-val'),
  nonbioMetalToggle: document.getElementById('nonbio-metal-toggle'),
  nonbioWeightSlider: document.getElementById('nonbio-weight-slider'),
  nonbioWeightVal: document.getElementById('nonbio-weight-val'),
  nonbioFillSlider: document.getElementById('nonbio-fill-slider'),
  nonbioDistanceVal: document.getElementById('nonbio-dist-val'),

  // Gas
  gasSlider: document.getElementById('gas-slider'),
  gasVal: document.getElementById('gas-val'),
  gasStatusText: document.getElementById('gas-status-text'),

  // Evidence Scores
  bioScoreBar: document.getElementById('bio-score-bar'),
  bioScoreVal: document.getElementById('bio-score-val'),
  bioScoreBreakdown: document.getElementById('bio-score-breakdown'),
  nonbioScoreBar: document.getElementById('nonbio-score-bar'),
  nonbioScoreVal: document.getElementById('nonbio-score-val'),
  nonbioScoreBreakdown: document.getElementById('nonbio-score-breakdown'),

  // Terminal & Buttons
  terminal: document.getElementById('terminal'),
  btnConnectSerial: document.getElementById('btn-connect-serial'),
  connectionBadge: document.getElementById('connection-badge'),
};

// Run Detection Engine Cycle (equivalent to detection_analyse() in detection.cpp)
function runDetectionEngine() {
  const analysis = {
    bioEvidenceScore: 0,
    nonbioEvidenceScore: 0,
    bioConditionDetected: false,
    nonbioConditionDetected: false,
    bioMismatchFlag: false,
    nonbioMismatchFlag: false,
    bioFillPct: 0,
    nonbioFillPct: 0,
    bioFull: false,
    nonbioFull: false,
    hasFault: false,
    faultList: [],
  };

  // 1. Gas interpretation
  const gasHigh = simState.gasRaw >= CONFIG.GAS_THRESHOLD_HIGH;

  // 2. Moisture interpretation (inverted capacitive: lower = wetter)
  const isBioWet = CONFIG.MOISTURE_POLARITY_INVERTED
    ? (simState.bioMoistRaw <= CONFIG.MOISTURE_THRESHOLD_WET)
    : (simState.bioMoistRaw >= CONFIG.MOISTURE_THRESHOLD_WET);

  const isNonbioWet = CONFIG.MOISTURE_POLARITY_INVERTED
    ? (simState.nonbioMoistRaw <= CONFIG.MOISTURE_THRESHOLD_WET)
    : (simState.nonbioMoistRaw >= CONFIG.MOISTURE_THRESHOLD_WET);

  // 3. Fill Level & Distance
  // fill % = ((BIN_DEPTH_CM - distance) / BIN_DEPTH_CM) * 100
  analysis.bioFillPct = Math.max(0, Math.min(100, Math.round(((CONFIG.BIN_DEPTH_CM - simState.bioDistanceCm) / CONFIG.BIN_DEPTH_CM) * 100)));
  analysis.nonbioFillPct = Math.max(0, Math.min(100, Math.round(((CONFIG.BIN_DEPTH_CM - simState.nonbioDistanceCm) / CONFIG.BIN_DEPTH_CM) * 100)));

  analysis.bioFull = analysis.bioFillPct >= CONFIG.BIN_LEVEL_FULL_PCT;
  analysis.nonbioFull = analysis.nonbioFillPct >= CONFIG.BIN_LEVEL_FULL_PCT;

  // 4. Fault Detection
  if (simState.gasFault) { analysis.hasFault = true; analysis.faultList.push("Gas sensor disconnected"); }
  if (simState.bioMoistFault) { analysis.hasFault = true; analysis.faultList.push("Bio moisture fault"); }
  if (simState.nonbioMoistFault) { analysis.hasFault = true; analysis.faultList.push("Non-Bio moisture fault"); }
  if (simState.bioWeightFault) { analysis.hasFault = true; analysis.faultList.push("Bio HX711 timeout"); }
  if (simState.nonbioWeightFault) { analysis.hasFault = true; analysis.faultList.push("Non-Bio HX711 timeout"); }
  if (simState.bioDistanceFault) { analysis.hasFault = true; analysis.faultList.push("Bio Ultrasonic timeout"); }
  if (simState.nonbioDistanceFault) { analysis.hasFault = true; analysis.faultList.push("Non-Bio Ultrasonic timeout"); }

  // 5. Biodegradable Bin Mismatch Analysis
  // Metal in bio bin is the PRIMARY mismatch indicator (+40 pts)
  let bioMetalPts = 0;
  let bioMoistPts = 0;
  let bioGasPts = 0;

  if (simState.bioMetalDetected) {
    bioMetalPts = CONFIG.EVIDENCE_WEIGHT_METAL;
    analysis.bioEvidenceScore += bioMetalPts;
    analysis.bioConditionDetected = true;
  }
  // Wet organic matter in bio bin is EXPECTED, so moisture alone gives 0 mismatch points.
  // High gas in bio bin is expected for organic decomposition, so 0 mismatch points.

  // 6. Non-Biodegradable Bin Mismatch Analysis
  // Non-bio bin should contain dry recyclable items (paper, dry plastic, metal).
  // Metal in non-bio is ACCEPTABLE (0 mismatch points).
  let nonbioMetalPts = 0;
  let nonbioMoistPts = 0;
  let nonbioGasPts = 0;

  if (isNonbioWet) {
    nonbioMoistPts = CONFIG.EVIDENCE_WEIGHT_MOISTURE; // +20
    analysis.nonbioEvidenceScore += nonbioMoistPts;
  }

  if (gasHigh) {
    nonbioGasPts = CONFIG.EVIDENCE_WEIGHT_GAS; // +15
    analysis.nonbioEvidenceScore += nonbioGasPts;
  }

  // KEY RULE: Wet item ALONE in non-bio is NOT flagged as bio (20 pts < 30 threshold)
  // Only moisture + gas combined reaches 35 pts (>= 30 threshold)
  if (analysis.nonbioEvidenceScore >= CONFIG.MISMATCH_SCORE_THRESHOLD) {
    analysis.nonbioConditionDetected = true;
  }

  // 7. Persistence Logic
  if (analysis.bioConditionDetected) {
    simState.bioPersistence++;
    if (simState.bioPersistence >= CONFIG.MISMATCH_PERSISTENCE_COUNT) {
      simState.bioMismatchAlert = true;
    }
  } else {
    simState.bioPersistence = Math.max(0, simState.bioPersistence - 1);
    if (simState.bioPersistence === 0) {
      simState.bioMismatchAlert = false;
    }
  }

  if (analysis.nonbioConditionDetected) {
    simState.nonbioPersistence++;
    if (simState.nonbioPersistence >= CONFIG.MISMATCH_PERSISTENCE_COUNT) {
      simState.nonbioMismatchAlert = true;
    }
  } else {
    simState.nonbioPersistence = Math.max(0, simState.nonbioPersistence - 1);
    if (simState.nonbioPersistence === 0) {
      simState.nonbioMismatchAlert = false;
    }
  }

  analysis.bioMismatchFlag = simState.bioMismatchAlert;
  analysis.nonbioMismatchFlag = simState.nonbioMismatchAlert;
  lastAnalysis = analysis;

  // 8. Update UI Elements
  updateUI(analysis, {
    bioMetalPts, bioMoistPts, bioGasPts,
    nonbioMetalPts, nonbioMoistPts, nonbioGasPts,
    isBioWet, isNonbioWet, gasHigh
  });
}

// Update all UI elements and LED indicators
function updateUI(analysis, details) {
  // --- LEDs ---
  // Green: System OK
  const isOk = !analysis.hasFault;
  elements.ledOk.classList.toggle('on', isOk);

  // Red: Bio Mismatch
  elements.ledBioMis.classList.toggle('on', analysis.bioMismatchFlag);

  // Red: Non-Bio Mismatch
  elements.ledNonbioMis.classList.toggle('on', analysis.nonbioMismatchFlag);

  // Amber: Bin Full
  const isAnyFull = analysis.bioFull || analysis.nonbioFull;
  elements.ledFull.classList.toggle('on', isAnyFull);

  // Red: Sensor Fault
  elements.ledFault.classList.toggle('on', analysis.hasFault);
  elements.ledFault.classList.toggle('blinking', analysis.hasFault);

  // --- Bin 1 (Bio) ---
  elements.bioFillBar.style.height = `${analysis.bioFillPct}%`;
  elements.bioFillText.textContent = `${analysis.bioFillPct}%`;
  elements.bioDistanceVal.textContent = `${simState.bioDistanceCm.toFixed(1)} cm`;
  elements.bioWeightVal.textContent = `${simState.bioWeightGrams.toFixed(0)} g`;
  elements.bioMoistVal.textContent = `${simState.bioMoistRaw} (${details.isBioWet ? 'WET' : 'DRY'})`;

  if (analysis.bioMismatchFlag) {
    elements.bioStatusPill.className = 'bin-status-pill mismatch';
    elements.bioStatusPill.textContent = 'MISMATCH: METAL DETECTED!';
  } else if (simState.bioPersistence > 0) {
    elements.bioStatusPill.className = 'bin-status-pill';
    elements.bioStatusPill.textContent = `VERIFYING (${simState.bioPersistence}/${CONFIG.MISMATCH_PERSISTENCE_COUNT})`;
  } else if (analysis.bioFull) {
    elements.bioStatusPill.className = 'bin-status-pill';
    elements.bioStatusPill.style.color = '#fbbf24';
    elements.bioStatusPill.textContent = 'BIN FULL (≥90%)';
  } else {
    elements.bioStatusPill.className = 'bin-status-pill normal';
    elements.bioStatusPill.textContent = 'STATUS: NORMAL';
  }

  // --- Bin 2 (Non-Bio) ---
  elements.nonbioFillBar.style.height = `${analysis.nonbioFillPct}%`;
  elements.nonbioFillText.textContent = `${analysis.nonbioFillPct}%`;
  elements.nonbioDistanceVal.textContent = `${simState.nonbioDistanceCm.toFixed(1)} cm`;
  elements.nonbioWeightVal.textContent = `${simState.nonbioWeightGrams.toFixed(0)} g`;
  elements.nonbioMoistVal.textContent = `${simState.nonbioMoistRaw} (${details.isNonbioWet ? 'WET' : 'DRY'})`;

  if (analysis.nonbioMismatchFlag) {
    elements.nonbioStatusPill.className = 'bin-status-pill mismatch';
    elements.nonbioStatusPill.textContent = 'MISMATCH: ORGANIC / LIQUID!';
  } else if (simState.nonbioPersistence > 0) {
    elements.nonbioStatusPill.className = 'bin-status-pill';
    elements.nonbioStatusPill.textContent = `VERIFYING (${simState.nonbioPersistence}/${CONFIG.MISMATCH_PERSISTENCE_COUNT})`;
  } else if (analysis.nonbioFull) {
    elements.nonbioStatusPill.className = 'bin-status-pill';
    elements.nonbioStatusPill.style.color = '#fbbf24';
    elements.nonbioStatusPill.textContent = 'BIN FULL (≥90%)';
  } else {
    elements.nonbioStatusPill.className = 'bin-status-pill normal';
    elements.nonbioStatusPill.textContent = 'STATUS: NORMAL';
  }

  // --- Gas Telemetry ---
  elements.gasVal.textContent = simState.gasRaw;
  elements.gasStatusText.textContent = details.gasHigh ? 'HIGH (Organic decomposition / volatiles)' : 'NORMAL / CLEAN';
  elements.gasStatusText.style.color = details.gasHigh ? '#f87171' : '#a5f3fc';

  // --- Evidence Scoring Cards ---
  // Bio Bin Score
  elements.bioScoreVal.textContent = `${analysis.bioEvidenceScore} / 100`;
  elements.bioScoreBar.style.width = `${Math.min(100, analysis.bioEvidenceScore)}%`;
  elements.bioScoreBar.style.backgroundColor = analysis.bioEvidenceScore >= CONFIG.MISMATCH_SCORE_THRESHOLD ? '#ef4444' : '#10b981';

  elements.bioScoreBreakdown.innerHTML = `
    <div class="evidence-line"><span>Metal in Bio:</span><span>${details.bioMetalPts ? `+${details.bioMetalPts} [TRIGGER]` : '0'}</span></div>
    <div class="evidence-line"><span>Moisture:</span><span>Expected for bio (0 pts)</span></div>
    <div class="evidence-line"><span>Threshold:</span><span>Score ≥ ${CONFIG.MISMATCH_SCORE_THRESHOLD} (Current: ${analysis.bioEvidenceScore})</span></div>
    <div class="evidence-line"><span>Filter Persistence:</span><span>${simState.bioPersistence} / ${CONFIG.MISMATCH_PERSISTENCE_COUNT}</span></div>
  `;

  // Non-Bio Bin Score
  elements.nonbioScoreVal.textContent = `${analysis.nonbioEvidenceScore} / 100`;
  elements.nonbioScoreBar.style.width = `${Math.min(100, analysis.nonbioEvidenceScore)}%`;
  elements.nonbioScoreBar.style.backgroundColor = analysis.nonbioEvidenceScore >= CONFIG.MISMATCH_SCORE_THRESHOLD ? '#ef4444' : '#3b82f6';

  let nonbioSummary = "Dry & clean";
  if (details.nonbioMoistPts && details.nonbioGasPts) {
    nonbioSummary = "Moisture + Gas = Organic match";
  } else if (details.nonbioMoistPts) {
    nonbioSummary = "Wet item alone (NOT bio, 20 < 30)";
  }

  elements.nonbioScoreBreakdown.innerHTML = `
    <div class="evidence-line"><span>Metal in Non-Bio:</span><span>Acceptable (0 pts)</span></div>
    <div class="evidence-line"><span>Moisture:</span><span>+${details.nonbioMoistPts} pts</span></div>
    <div class="evidence-line"><span>Decomposition Gas:</span><span>+${details.nonbioGasPts} pts</span></div>
    <div class="evidence-line"><span>Classification:</span><span>${nonbioSummary}</span></div>
    <div class="evidence-line"><span>Filter Persistence:</span><span>${simState.nonbioPersistence} / ${CONFIG.MISMATCH_PERSISTENCE_COUNT}</span></div>
  `;
}

// Generate Serial Stream Output (matches serial_output.cpp)
function generateSerialLog() {
  simState.cycleCount++;
  const timestamp = (simState.cycleCount * 2).toFixed(1);

  if (simState.csvMode) {
    // CSV output
    const row = [
      timestamp,
      simState.gasRaw,
      simState.bioMoistRaw,
      simState.bioMetalDetected ? 1 : 0,
      simState.bioWeightGrams.toFixed(1),
      lastAnalysis.bioFillPct,
      simState.nonbioMoistRaw,
      simState.nonbioMetalDetected ? 1 : 0,
      simState.nonbioWeightGrams.toFixed(1),
      lastAnalysis.nonbioFillPct,
      simState.bioMismatchAlert ? 1 : 0,
      simState.nonbioMismatchAlert ? 1 : 0,
      lastAnalysis.bioFull || lastAnalysis.nonbioFull ? 1 : 0,
      lastAnalysis.hasFault ? 1 : 0
    ].join(",");
    logToTerminal(row, "dim");
  } else {
    // Human-readable formatted diagnostic block
    logToTerminal(`┌── Cycle #${simState.cycleCount} ── [${timestamp}s] ──────────────────────────┐`, "dim");
    logToTerminal(`│ GAS: ${simState.gasRaw} (raw) | Status: ${simState.gasRaw >= CONFIG.GAS_THRESHOLD_HIGH ? 'ELEVATED' : 'CLEAN'}`);
    logToTerminal(`│ BIO BIN:    Weight=${simState.bioWeightGrams.toFixed(0)}g | Fill=${lastAnalysis.bioFillPct}% | Metal=${simState.bioMetalDetected ? 'YES ⚠' : 'NO'} | Moist=${simState.bioMoistRaw}`);
    logToTerminal(`│ NON-BIO:    Weight=${simState.nonbioWeightGrams.toFixed(0)}g | Fill=${lastAnalysis.nonbioFillPct}% | Metal=${simState.nonbioMetalDetected ? 'YES' : 'NO'} | Moist=${simState.nonbioMoistRaw}`);
    
    if (simState.bioMismatchAlert) {
      logToTerminal(`│ ⚠ ALERT: MISMATCH IN BIODEGRADABLE BIN (Metal detected)`, "err");
    }
    if (simState.nonbioMismatchAlert) {
      logToTerminal(`│ ⚠ ALERT: MISMATCH IN NON-BIODEGRADABLE BIN (Moisture+Gas)`, "err");
    }
    if (lastAnalysis.bioFull || lastAnalysis.nonbioFull) {
      logToTerminal(`│ ℹ STATUS: BIN AT CAPACITY (Bio:${lastAnalysis.bioFillPct}% NonBio:${lastAnalysis.nonbioFillPct}%)`, "warn");
    }
    if (lastAnalysis.hasFault) {
      logToTerminal(`│ ✖ SENSOR FAULT DETECTED: Check connections`, "err");
    }
    logToTerminal(`└─────────────────────────────────────────────────────┘`, "dim");
  }
}

function logToTerminal(text, type = "normal") {
  const line = document.createElement("div");
  line.className = `log-entry ${type}`;
  line.textContent = text;
  elements.terminal.appendChild(line);
  elements.terminal.scrollTop = elements.terminal.scrollHeight;

  // Limit terminal lines to prevent lag
  while (elements.terminal.children.length > 200) {
    elements.terminal.removeChild(elements.terminal.firstChild);
  }
}

// Preset Scenario Handlers
function applyPreset(name) {
  // Clear active styling
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`preset-${name}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Reset faults
  simState.gasFault = false;
  simState.bioMoistFault = false;
  simState.nonbioMoistFault = false;
  simState.bioWeightFault = false;
  simState.nonbioWeightFault = false;
  simState.bioDistanceFault = false;
  simState.nonbioDistanceFault = false;

  switch (name) {
    case 'clean':
      simState.gasRaw = 550;
      simState.bioMoistRaw = 3600;
      simState.nonbioMoistRaw = 3700;
      simState.bioMetalDetected = false;
      simState.nonbioMetalDetected = false;
      simState.bioWeightGrams = 0;
      simState.nonbioWeightGrams = 0;
      simState.bioDistanceCm = 39.0;
      simState.nonbioDistanceCm = 39.0;
      simState.bioPersistence = 0;
      simState.nonbioPersistence = 0;
      break;

    case 'normal-bio':
      simState.gasRaw = 900;
      simState.bioMoistRaw = 1200; // Wet organic
      simState.nonbioMoistRaw = 3500; // Dry
      simState.bioMetalDetected = false;
      simState.nonbioMetalDetected = false;
      simState.bioWeightGrams = 650;
      simState.bioDistanceCm = 28.0;
      break;

    case 'normal-nonbio':
      simState.gasRaw = 600;
      simState.bioMoistRaw = 3400;
      simState.nonbioMoistRaw = 3600;
      simState.bioMetalDetected = false;
      simState.nonbioMetalDetected = true; // Aluminum can in non-bio is ALLOWED!
      simState.nonbioWeightGrams = 120;
      simState.nonbioDistanceCm = 26.0;
      break;

    case 'mismatch-bio':
      // Metallic can dropped into biodegradable bin!
      simState.bioMetalDetected = true;
      simState.bioWeightGrams += 150;
      logToTerminal(">> SIMULATION EVENT: Metallic can dropped in Biodegradable Bin!", "warn");
      break;

    case 'mismatch-nonbio':
      // Wet food waste placed into non-biodegradable bin!
      simState.nonbioMoistRaw = 1100; // Wet
      simState.gasRaw = 1850;         // High decomposition gas
      simState.nonbioWeightGrams += 400;
      logToTerminal(">> SIMULATION EVENT: Decomposing food waste placed in Non-Biodegradable Bin!", "warn");
      break;

    case 'wet-only-nonbio':
      // A wet plastic bottle (wet but NO decomposition gas)
      simState.nonbioMoistRaw = 1200; // Wet (+20 pts)
      simState.gasRaw = 650;          // Clean air (+0 pts) -> Score 20 < 30. No Mismatch!
      logToTerminal(">> SIMULATION EVENT: Wet plastic bottle placed in Non-Bio bin (Demonstrates Wet != Biodegradable)", "ok");
      break;

    case 'full-bins':
      simState.bioDistanceCm = 3.0; // 92.5% full
      simState.nonbioDistanceCm = 2.5; // 93.7% full
      simState.bioWeightGrams = 4200;
      simState.nonbioWeightGrams = 3800;
      logToTerminal(">> SIMULATION EVENT: Both bins filled to capacity!", "warn");
      break;

    case 'fault':
      simState.gasFault = true;
      simState.bioWeightFault = true;
      logToTerminal(">> SIMULATION EVENT: Simulated hardware sensor line fault / disconnect!", "err");
      break;
  }

  syncControlsToState();
  runDetectionEngine();
}

// Sync Form Controls to simState
function syncControlsToState() {
  elements.gasSlider.value = simState.gasRaw;
  elements.bioMoistSlider.value = simState.bioMoistRaw;
  elements.nonbioMoistSlider.value = simState.nonbioMoistRaw;
  elements.bioWeightSlider.value = simState.bioWeightGrams;
  elements.nonbioWeightSlider.value = simState.nonbioWeightGrams;
  elements.bioMetalToggle.checked = simState.bioMetalDetected;
  elements.nonbioMetalToggle.checked = simState.nonbioMetalDetected;

  // Convert distance back to fill slider (0 - 100%)
  const bioPct = Math.round(((CONFIG.BIN_DEPTH_CM - simState.bioDistanceCm) / CONFIG.BIN_DEPTH_CM) * 100);
  const nonbioPct = Math.round(((CONFIG.BIN_DEPTH_CM - simState.nonbioDistanceCm) / CONFIG.BIN_DEPTH_CM) * 100);
  elements.bioFillSlider.value = Math.max(0, Math.min(100, bioPct));
  elements.nonbioFillSlider.value = Math.max(0, Math.min(100, nonbioPct));
}

// Event Listeners for Sliders & Toggles
function attachEventListeners() {
  elements.gasSlider.addEventListener('input', (e) => {
    simState.gasRaw = parseInt(e.target.value);
    runDetectionEngine();
  });

  elements.bioMoistSlider.addEventListener('input', (e) => {
    simState.bioMoistRaw = parseInt(e.target.value);
    runDetectionEngine();
  });

  elements.nonbioMoistSlider.addEventListener('input', (e) => {
    simState.nonbioMoistRaw = parseInt(e.target.value);
    runDetectionEngine();
  });

  elements.bioMetalToggle.addEventListener('change', (e) => {
    simState.bioMetalDetected = e.target.checked;
    runDetectionEngine();
  });

  elements.nonbioMetalToggle.addEventListener('change', (e) => {
    simState.nonbioMetalDetected = e.target.checked;
    runDetectionEngine();
  });

  elements.bioWeightSlider.addEventListener('input', (e) => {
    simState.bioWeightGrams = parseFloat(e.target.value);
    runDetectionEngine();
  });

  elements.nonbioWeightSlider.addEventListener('input', (e) => {
    simState.nonbioWeightGrams = parseFloat(e.target.value);
    runDetectionEngine();
  });

  elements.bioFillSlider.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value);
    simState.bioDistanceCm = CONFIG.BIN_DEPTH_CM * (1 - (pct / 100));
    runDetectionEngine();
  });

  elements.nonbioFillSlider.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value);
    simState.nonbioDistanceCm = CONFIG.BIN_DEPTH_CM * (1 - (pct / 100));
    runDetectionEngine();
  });

  // Terminal Command Buttons (mimics ESP32 UART commands)
  document.getElementById('cmd-tare').addEventListener('click', () => {
    logToTerminal(">> Command sent: 't' (Tare both load cells)", "ok");
    simState.bioWeightGrams = 0;
    simState.nonbioWeightGrams = 0;
    syncControlsToState();
    runDetectionEngine();
    logToTerminal("Tare complete. Offsets updated.", "ok");
  });

  document.getElementById('cmd-reset').addEventListener('click', () => {
    logToTerminal(">> Command sent: 'r' (Reset mismatch persistence counters)", "ok");
    simState.bioPersistence = 0;
    simState.nonbioPersistence = 0;
    simState.bioMismatchAlert = false;
    simState.nonbioMismatchAlert = false;
    runDetectionEngine();
  });

  document.getElementById('cmd-csv').addEventListener('click', () => {
    simState.csvMode = !simState.csvMode;
    logToTerminal(`>> Command sent: 'v' (CSV Mode: ${simState.csvMode ? 'ENABLED' : 'DISABLED'})`, "ok");
    if (simState.csvMode) {
      logToTerminal("Time(s),Gas,BioMoist,BioMetal,BioWeight,BioFill,NbioMoist,NbioMetal,NbioWeight,NbioFill,BioMis,NbioMis,Full,Fault", "dim");
    }
  });

  document.getElementById('cmd-clear').addEventListener('click', () => {
    elements.terminal.innerHTML = "";
    logToTerminal("Terminal buffer cleared.", "dim");
  });

  // Web Serial API (Optional Live Hardware Connection)
  elements.btnConnectSerial.addEventListener('click', initWebSerialConnection);
}

// Optional Web Serial API Integration for live hardware pairing
async function initWebSerialConnection() {
  if (!("serial" in navigator)) {
    alert("Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera to connect directly to ESP32 over USB.");
    return;
  }

  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    simState.liveSerialPort = port;
    simState.isLiveConnected = true;

    elements.connectionBadge.className = 'badge-mode live';
    elements.connectionBadge.textContent = '● ESP32 HARDWARE LIVE (115200)';
    elements.btnConnectSerial.textContent = 'Disconnect ESP32';
    logToTerminal("✓ CONNECTED TO PHYSICAL ESP32 COM PORT!", "ok");

    readSerialStream(port);
  } catch (err) {
    console.error("Web Serial Error:", err);
    logToTerminal(`Serial connection aborted: ${err.message}`, "err");
  }
}

async function readSerialStream(port) {
  const textDecoder = new TextDecoderStream();
  port.readable.pipeTo(textDecoder.writable);
  const reader = textDecoder.readable.getReader();

  let lineBuffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      lineBuffer += value;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop(); // Keep unfinished tail

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          logToTerminal(`[ESP32] ${trimmed}`);
        }
      }
    }
  } catch (error) {
    logToTerminal(`Serial read error: ${error.message}`, "err");
  } finally {
    reader.releaseLock();
  }
}

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  logToTerminal("╔═══════════════════════════════════════════════════════════╗", "ok");
  logToTerminal("║  Intelligent Solid Waste Segregation — Digital Twin v1.0 ║", "ok");
  logToTerminal("║  Firmware Detection Engine Active (Interval: 2000ms)     ║", "ok");
  logToTerminal("╚═══════════════════════════════════════════════════════════╝", "ok");

  attachEventListeners();
  applyPreset('normal-bio');

  // Background monitoring cycle interval (matches ESP32 2000ms loop)
  setInterval(() => {
    runDetectionEngine();
    generateSerialLog();
  }, CONFIG.MONITORING_INTERVAL_MS);
});
