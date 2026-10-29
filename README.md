# Intelligent Waste Segregation Analytics

An IoT-integrated Smart Waste Segregation Analytics system built for an **Arduino Uno** physical prototype, featuring real-time sensor acquisition, automatic proximity-driven lid actuation, versioned JSON Lines telemetry, a local IoT backend with persistent storage, and a professional light-themed operational dashboard.

---

## Features

- **Arduino Uno Firmware (ATmega328P):** Memory-efficient, non-blocking sensor loop optimized for 2KB SRAM.
- **Physical Sensor Integration:**
  - **Capacitive Soil Moisture Sensor (Analog A0):** Dual-point calibrated moisture monitoring with raw ADC diagnostic reporting.
  - **Load Cell + HX711 Amplifier (Digital D2/D3):** Precision mass acquisition with tare and reference weight calibration.
  - **HC-SR04 Ultrasonic Sensor (Digital D4/D5):** Non-blocking proximity detection for hands-free automatic lid opening.
  - **Lid Servo Actuator (PWM D6):** Automatic lid opening with debounce, configurable open duration, and anti-flap cooldown.
- **Strict Two Waste Categories:** Focuses exclusively on **Biodegradable Waste** and **Non-Biodegradable Waste**.
- **Real-Time Structured Telemetry:** Emits structured JSON Lines at 115200 baud with sequence numbering, uptime, explicit null handling, and active fault detection.
- **Production IoT Backend & Storage:** Native REST API and persistent JSONL data logging (`data/telemetry.jsonl`, `data/lid_events.jsonl`, `data/classifications.jsonl`).
- **Dual Monitoring Modes:**
  - **Live Hardware Mode:** Connects to real Arduino Uno R3 via Serial Gateway or direct Web Serial. Reports genuine timestamps, alerts on hardware disconnection/staleness, and preserves data authenticity.
  - **Simulation Mode:** Deterministic, realistic synthetic sensor generator for testing when Arduino hardware is offline. Simulates capacitive moisture ADC & %, HX711 mass, HC-SR04 proximity approach, and coherent lid open/hold/close cycles.
  - **Header Toggle Switch:** Compact, accessible switch (`[ LIVE HARDWARE ●──── ]` vs `[ SIMULATION ────● ]`) with clear visual banners and zero duplicate rendering code.
- **Strict Data Provenance & Separation:** Synthetic telemetry carries `source: "simulation"` and is never written to production hardware logs (`data/telemetry.jsonl`) or sent to physical actuators.
- **Dual Connectivity Methods:** Supports remote gateway monitoring over HTTP as well as direct USB connection in-browser via the Web Serial API.

---

## Hardware Specifications

| Component | Arduino Uno Pin | Operating Voltage | Function |
| :--- | :--- | :--- | :--- |
| **Arduino Uno R3** | — | 5.0V (USB / DC) | Central microcontroller (16MHz ATmega328P) |
| **Capacitive Moisture Sensor** | Analog Pin A0 | 5.0V | Soil/waste moisture measurement |
| **HX711 Amplifier (Load Cell)**| D2 (DOUT), D3 (SCK) | 5.0V | Platform mass measurement |
| **HC-SR04 Ultrasonic Sensor** | D4 (TRIG), D5 (ECHO)| 5.0V | Approaching object proximity detection |
| **Lid Servo Motor (SG90/MG90S)**| D6 (PWM) | 5.0V | Automatic lid opening mechanism |
| **Proximity Active LED** | Digital Pin D7 | 5.0V (via 220Ω) | Amber indicator (lid open / proximity) |
| **Fault Indicator LED** | Digital Pin D8 | 5.0V (via 220Ω) | Red indicator (sensor timeout) |
| **System Heartbeat LED** | Digital Pin D13 | 5.0V (onboard) | Periodic 500ms heartbeat blink |

See [`docs/PIN_MAPPING.md`](docs/PIN_MAPPING.md) and [`docs/WIRING_GUIDE.md`](docs/WIRING_GUIDE.md) for full schematics and electrical safety rules.

---

## Quick Start Guide

### 1. Build and Upload Firmware
With PlatformIO installed and your Arduino Uno connected via USB:
```bash
# Build firmware for Arduino Uno
pio run -e uno

# Upload to connected Arduino Uno
pio run -e uno --target upload
```

### 2. Start the IoT Backend & Operational Dashboard
Launch the unified server using PowerShell (native on Windows, zero dependencies):
```powershell
powershell -ExecutionPolicy Bypass -File backend\server.ps1 -Port 8080
```
Open your browser to: **[http://localhost:8080/](http://localhost:8080/)**

*(Alternatively, run using Node.js: `node backend/server.js`)*

### 3. Connect Telemetry
You have two options for connecting hardware telemetry to the dashboard:

#### Option A: Direct Web Serial (No Gateway Required)
1. Open the dashboard in Google Chrome, Microsoft Edge, or Opera.
2. Click the **"Direct USB (Web Serial)"** button in the header.
3. Select your Arduino Uno USB COM port from the prompt.
4. The dashboard immediately starts streaming live physical sensor readings.

#### Option B: Dedicated Serial Gateway Bridge
Run the gateway in a second terminal window to forward USB serial packets to the backend:
```powershell
powershell -ExecutionPolicy Bypass -File gateway\serial_gateway.ps1 -ComPort COM3 -BaudRate 115200
```

---

## Monitoring Modes (Live Hardware vs. Simulation)

The system includes a compact mode switch in the dashboard header:

`Monitoring Mode: [ LIVE HARDWARE ●──── ]` vs `[ SIMULATION ────● ]`

### 1. Live Hardware Mode
- Displays genuine sensor readings received from the Arduino Uno via the backend gateway or direct Web Serial.
- Displays last received hardware timestamp and active hardware faults.
- Connection states:
  - **Online (`green`):** Valid hardware packet received within 5 seconds.
  - **Stale (`amber`):** No packet received within 5–15 seconds.
  - **Disconnected (`red`):** Hardware offline (>15 seconds). Displays message: `"Hardware disconnected — connect the Arduino or switch to Simulation Mode."`
- Never substitutes fake readings when hardware is disconnected.

### 2. Simulation Mode (Synthetic Telemetry)
- Generates deterministic, physically grounded sensor readings when hardware is unavailable.
- Displays persistent banner: **`SIMULATION MODE — SYNTHETIC DATA`**.
- Three Scenarios:
  - **Scenario A: Normal Operation:** Continuous background cycles, natural visitor approaches (distance drops ≤ 20cm), automatic lid opening for 4 seconds, and closing.
  - **Scenario B: Bin Filling:** Progressive accumulation of waste mass (+75–140g per cycle) and rising organic moisture curve.
  - **Scenario C: Hardware Unavailable:** Simulates communications/sensor timeout to test alerting and error handling without hardware.
- Simulation Controls:
  - **Scenario Selector:** Instant scenario switching.
  - **Update Interval:** Adjustable between 0.5s, 1.0s, and 2.0s.
  - **Pause / Resume:** Halts or resumes synthetic ticks.
  - **Restart Simulation:** Re-initializes state variables to initial values.
  - **Simulate Fault:** Injects simulated `HX711_TIMEOUT` and `MOISTURE_OFFLINE` conditions.
- **Strict Data Integrity:**
  - Synthetic packets carry `source: "simulation"` and `dev: "SIM-WS01"`.
  - Synthetic records are **never** written to `data/telemetry.jsonl`.
  - Serial commands are intercepted and **never** sent to physical actuators during simulation.

---

## Interactive Serial Commands

Open the Serial Monitor or use the Dashboard Diagnostic Console at 115200 baud:

| Command | Action |
| :--- | :--- |
| `t` | Tare HX711 load cell (zero point) |
| `c` | Interactive load cell calibration with a known reference weight in grams |
| `m` | Dual-point moisture calibration (Air Raw 0% vs Water Raw 100%) |
| `o` | Force lid actuator to OPEN position (90°) |
| `x` | Force lid actuator to CLOSED position (0°) |
| `h` | Print serial command menu |

See [`docs/CALIBRATION_GUIDE.md`](docs/CALIBRATION_GUIDE.md) for detailed sensor tuning instructions.

---

## Telemetry Protocol (JSON Lines)

The Arduino Uno emits UTF-8 JSON Lines over UART at 115200 baud:
```json
{
  "v": 1,
  "dev": "UNO-WS01",
  "seq": 142,
  "up": 284,
  "moist_raw": 345,
  "moist_pct": 78.5,
  "moist_ok": true,
  "moist_cal": true,
  "weight_g": 245.0,
  "weight_raw": 102900,
  "weight_ok": true,
  "weight_cal": true,
  "dist_cm": 14.1,
  "prox": true,
  "lid_cmd": "OPEN",
  "faults": []
}
```
*Note: Uncalibrated or disconnected sensors explicitly emit `null` rather than simulated or fabricated zeroes.*  
See [`docs/TELEMETRY_PROTOCOL.md`](docs/TELEMETRY_PROTOCOL.md) for full protocol specifications.

---

## Sensor-Based Machine Learning Pipeline

A complete numerical IoT machine learning system designed to operate on physical sensor values (capacitive moisture ADC/%, HX711 mass in grams, HC-SR04 ultrasonic distance, proximity state, and lid transitions) without requiring camera hardware or image classification.

> [!IMPORTANT]
> **Synthetic Model Provenance:**
> Initial models are trained and validated on physics-grounded synthetic telemetry (`data/synthetic/`). All evaluation metrics carry the provenance label:
> `SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION`.
> Synthetic data never contaminates production hardware logs (`data/telemetry.jsonl`).

### 1. Machine Learning Architecture

```
                  ┌────────────────────────────────────────┐
                  │    Arduino Uno R3 Physical Sensors     │
                  │ (Moisture A0, HX711 D2/D3, HC-SR04 D4/D5)│
                  └──────────────────┬─────────────────────┘
                                     │ (UART 115200 baud JSONL)
                                     ▼
┌───────────────────────────┐    ┌────────────────────────────────────────┐
│  Synthetic Telemetry      │    │  Serial Gateway / Backend Ingestion    │
│  Engine & Scenarios       │    │  (server.ps1 / server.js on :8080)     │
│  (ml/synthetic_data.py)   │    └──────────────────┬─────────────────────┘
└─────────────┬─────────────┘                       │
              │ (source: "simulation")              │ (source: "hardware")
              ▼                                     ▼
    ┌─────────────────────────────────────────────────────────┐
    │     FastAPI ML Inference Microservice (:8000)           │
    │     - Model A: Isolation Forest Anomaly Detector        │
    │     - Model B: Random Forest Weight Forecaster (+5/15m) │
    │     - Model C: Prototype Category Classifier            │
    └───────────────────────────┬─────────────────────────────┘
                                │
                                ▼
    ┌─────────────────────────────────────────────────────────┐
    │  Operational Web Dashboard (simulation/dashboard/)     │
    │  Real-Time Anomaly Score • Horizon Projections • CI     │
    └─────────────────────────────────────────────────────────┘
```

### 2. Implemented Models

| Model | Algorithm | Input Features | Output | Calibrated Performance (Held-Out Test) |
| :--- | :--- | :--- | :--- | :--- |
| **Model A: Sensor Anomaly Detector** | **Isolation Forest** (`contamination=0.06`, `n_jobs=1`) | Moisture ADC & %, mass & counts, distance, rate of change ($\Delta w, \Delta m$), rolling mean & std (w=5), missingness flags, fault bits | Normalized anomaly score `[0.0 - 1.0]`, status (`normal` / `suspected_anomaly`), interpretable diagnostic reasons | **F1: 62.6%** (Precision: 65.2%, Recall: 60.2%) on synthetic fault sessions |
| **Model B: Waste Mass Forecaster** | **Multi-Horizon Random Forest Regressor** (`max_depth=10`, `n_jobs=1`) | Multivariate sensor state, proximity flag, lid state, moving statistics, net accumulation rate | Predicted cumulative mass (grams) for **+5 min**, **+15 min**, **+30 min** with physical non-negative/capacity bounds `[0 – 10,000g]` and 95% confidence intervals | **+5m Horizon:** **808.7g MAE** vs 1069.7g Baseline (-261.0g MAE improvement ✓)<br>**+15m Horizon:** **1193.1g MAE** vs 1219.1g Baseline (-26.0g MAE improvement ✓)<br>**+30m Horizon:** 2237.4g MAE vs 1327.5g Baseline (baseline preferred over extended horizons) |
| **Model C: Category Classifier (Experimental)** | **Random Forest Classifier** | Dual-point moisture profile, mass step delta | Weak synthetic profile label (`BIODEGRADABLE`, `NON_BIODEGRADABLE`, `UNCLASSIFIED`) | *Experimental prototype only — transparently marked as not representing real-world material recognition* |

---

## Machine Learning Execution Workflow (Windows PowerShell)

Follow these exact steps in separate Windows PowerShell terminal windows:

### Step 1: Install Python Dependencies
Open PowerShell in the project directory:
```powershell
python -m pip install -r requirements.txt
```

### Step 2: Generate Multi-Scenario Synthetic Telemetry Dataset
Generates $\ge 24,000$ temporally correlated records partitioned by session across 6 scenarios:
```powershell
python ml\generate_data.py --records 24000 --seed 42
```
*Outputs:*
- `data/synthetic/sensor_readings.csv` (24,200 records)
- `data/synthetic/sensor_readings.jsonl`
- `data/synthetic/dataset_metadata.json` (Sensor specifications, fault rates, partition splits)

### Step 3: Train and Evaluate Models on Chronological Holdouts
Fits the models on training sessions (70%), optimizes the decision threshold on validation sessions (15%), and benchmarks against chronological test sessions (15%):
```powershell
python -u ml\train.py --data data\synthetic\sensor_readings.csv --models-dir models --seed 42
```
*Outputs:*
- `models/anomaly_detector.joblib`
- `models/weight_forecaster.joblib`
- `models/category_classifier.joblib`
- `models/model_metadata.json`

### Step 4: Run Automated Verification Tests
Run the combined test runner or pytest:
```powershell
# Option A: Full test suite (Firmware protocol + Assets + Simulation + ML)
powershell -ExecutionPolicy Bypass -File test\run_tests.ps1

# Option B: Dedicated Python ML and physics test suite
python -m pytest test\test_ml.py -v
```

### Step 5: Start the Python ML Inference Service (Terminal 1)
```powershell
# Terminal 1: Starts FastAPI on port 8000
python ml\service.py
```
*Endpoints active:*
- `GET  /api/ml/health` — Microservice readiness and model loading status
- `GET  /api/ml/status` — Feature schemas, version, and training sample counts
- `GET  /api/ml/metrics` — Chronological test evaluation metrics vs baseline
- `POST /api/ml/anomaly` — Real-time single-packet anomaly inference
- `POST /api/ml/forecast?horizon=5m` — Multi-horizon mass forecast with physical bounds

### Step 6: Start IoT Backend Server (Terminal 2)
```powershell
# Terminal 2: Starts unified backend & dashboard server on port 8080
powershell -ExecutionPolicy Bypass -File backend\server.ps1 -Port 8080
```
*(Alternatively: `node backend/server.js`)*

### Step 7: Open Operational Dashboard
Open your browser to: **[http://localhost:8080/](http://localhost:8080/)**

1. Locate the **Sensor Machine Learning Analytics** section below the Live Sensor Telemetry grid.
2. In the header, toggle **Monitoring Mode** to **`SIMULATION`**.
3. Observe synthetic sensor values streaming, the anomaly score dynamically updating, and the mass forecaster projecting +5m, +15m, or +30m future bin fill weights.
4. Toggle between `[ +5m ]`, `[ +15m ]`, and `[ +30m ]` on the forecaster card to inspect confidence intervals.
5. In the Simulation Controls panel, click **"Simulate Fault"** or switch to **Scenario C** to observe immediate real-time anomaly detection triggers (`SUSPECTED ANOMALY`, score rising to `1.0`, diagnostic alert rows generated).
6. Switch back to **`LIVE HARDWARE`** mode to monitor physical Arduino Uno readings.

---

```
Intelligent Waste Segretion/
├── platformio.ini              # PlatformIO config targeting Arduino Uno (atmega328p)
├── README.md                   # System documentation & quickstart
├── PROJECT_STATUS.md           # Implementation audit & verification status
├── include/
│   ├── config.h                # Arduino Uno pin assignments, calibration defaults, timing
│   ├── sensor_types.h          # Data structures for 2 waste categories & telemetry
│   ├── sensors.h               # Active sensor reading and lid state machine interface
│   ├── detection.h             # Two-category waste evaluation interface
│   ├── leds.h                  # Hardware LED status indicators
│   └── serial_output.h         # JSON Lines protocol and command handler interface
├── src/
│   ├── main.cpp                # Application entry point and non-blocking 1Hz loop
│   ├── sensors.cpp             # Moisture, HX711, ultrasonic, and lid servo logic
│   ├── detection.cpp           # Two-category evaluation logic
│   ├── leds.cpp                # Diagnostic LED driver implementation
│   └── serial_output.cpp       # Zero-allocation JSON Lines emitter and commands
├── ml/                         # Sensor Machine Learning Pipeline & Microservice
│   ├── __init__.py             # Python package identifier
│   ├── synthetic_data.py       # Physics-grounded sensor generator & scenario engine
│   ├── generate_data.py        # 24k multi-scenario dataset generator (session splits)
│   ├── features.py             # Dual batch and streaming online feature extraction
│   ├── anomaly_detector.py     # Model A: Isolation Forest sensor anomaly detector
│   ├── weight_forecaster.py    # Model B: Multi-horizon mass forecaster (+5m/15m/30m)
│   ├── category_classifier.py  # Model C: Prototype category classifier
│   ├── train.py                # Model training, validation, and serialization pipeline
│   └── service.py              # FastAPI real-time inference microservice (:8000)
├── models/                     # Serialized Model Artifacts & Evaluation Metadata
│   ├── anomaly_detector.joblib # Trained Isolation Forest model
│   ├── weight_forecaster.joblib# Trained Multi-Horizon Random Forest model
│   ├── category_classifier.joblib # Trained category classifier
│   └── model_metadata.json     # Feature schema, hyperparameters, and test metrics
├── backend/
│   ├── server.ps1              # Native PowerShell/.NET HTTP REST & data storage server
│   └── server.js               # Cross-platform Node.js IoT backend alternative
├── gateway/
│   └── serial_gateway.ps1      # USB COM port to HTTP telemetry forwarder
├── simulation/
│   └── dashboard/              # Production light-themed environmental IoT dashboard
│       ├── index.html          # Semantic HTML5 dashboard with ML cards & horizon controls
│       ├── styles.css          # Restrained environmental design & ML status styling
│       ├── app.js              # Data-driven client with real-time ML inference
│       └── serve.ps1           # Wrapper to launch backend server
├── data/                       # Persistent JSON Lines telemetry & event logs
│   ├── telemetry.jsonl         # Recorded genuine sensor telemetry (Hardware only)
│   ├── lid_events.jsonl        # Recorded proximity & lid actuation transitions
│   ├── classifications.jsonl  # Recorded verified waste classification events
│   └── synthetic/              # Generated synthetic datasets (Isolated from hardware)
│       ├── sensor_readings.csv # Multi-scenario tabular records (24,200 samples)
│       ├── sensor_readings.jsonl # Streaming format records
│       └── dataset_metadata.json # Physical specifications, calibration, and splits
├── test/
│   ├── test_detection.cpp      # Host-side unit tests for 2-category logic
│   ├── test_simulation_mode.ps1# Hardware/simulation isolation integration tests
│   ├── test_static_assets.ps1  # Dashboard static files integrity check
│   ├── test_ml.py              # Pytest suite for synthetic physics, ML, and API
│   └── run_tests.ps1           # Unified automated test runner
└── docs/
    ├── PIN_MAPPING.md          # Complete Arduino Uno pin mapping & electrical characteristics
    ├── WIRING_GUIDE.md         # Breadboard wiring and assembly instructions
    ├── CALIBRATION_GUIDE.md    # Dual-point moisture and load-cell calibration workflow
    ├── TELEMETRY_PROTOCOL.md   # Versioned JSON Lines protocol specification
    └── TEST_PLAN.md            # Hardware, firmware, backend, and frontend test plan
```

---

## License

Developed as an academic engineering project for educational and research purposes.
