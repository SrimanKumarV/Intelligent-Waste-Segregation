# Intelligent Solid Waste Segregation Analytics

An advanced IoT Smart Waste Segregation Analytics architecture distributed across two microcontrollers: **Module A (Arduino Uno)** and **Module B (ESP32 DevKit V1)**, featuring real-time four-channel sensor acquisition, autonomous proximity-driven lid actuation, dual 16x2 I2C LCD displays, an IoT backend with native persistent storage, a retrained Machine Learning inference pipeline, and a modern, professional **Two-Page Environmental Dashboard**.

---

## 1. System Architecture

```
+---------------------------------------------------------------------------------------+
|                                    LAPTOP HOST                                        |
|                                                                                       |
|   +------------------------------------+    +-------------------------------------+   |
|   |         TWO-PAGE DASHBOARD         |    |      FAST ML MICROSERVICE           |   |
|   |  - Page 1: Overview Dashboard      |    |  - Real-Time Anomaly Detector       |   |
|   |  - Page 2: Technical Operations    |<-->|  - Dual Load-Cell Forecaster (5/15) |   |
|   |  - Mode Switch (Live vs Sim)       |    |  - 2-Class Category Classifier      |   |
|   +-----------------+------------------+    +------------------+------------------+   |
|                     |                                          |                      |
|                     v                                          v                      |
|   +------------------------------------+    +-------------------------------------+   |
|   |      IOT BACKEND REST SERVER       |<-->|    MULTI-DEVICE SERIAL GATEWAY      |   |
|   |  - Native PowerShell (server.ps1)  |    |  - Dual COM Reader (Uno & ESP32)    |   |
|   |  - Combined Telemetry Normalizer   |    |  - Cross-Device Lid Sync Bridge     |   |
|   |  - Persistent JSONL Engine         |    |  - Actuator Command Router          |   |
|   +------------------------------------+    +------------------+------------------+   |
|                                                                |                      |
+----------------------------------------------------------------+----------------------+
                                                                 | USB Serial (115200)
                              +----------------------------------+------------------+
                              |                                                     |
                              v                                                     v
          +--------------------------------------+             +--------------------------------------+
          |       MODULE A: ARDUINO UNO          |             |       MODULE B: ESP32 DEV-KIT V1     |
          |       (5.0V TTL Logic Level)         |             |        (3.3V Logic Level Hub)        |
          |                                      |             |                                      |
          |  [HC-SR04 Proximity Sensor] (D4/D5)  |             |  [Capacitive Moisture C1] (GPIO 34)  |
          |  [Automatic Lid Servo PWM]  (D6)     |             |  [Capacitive Moisture C2] (GPIO 35)  |
          |  [Diagnostic Status LEDs]   (D7/D8)  |             |  [HX711 Load Cell 1]   (GPIO 16/4)   |
          |  [Modular 16x2 I2C LCD]     (A4/A5)  |             |  [HX711 Load Cell 2]   (GPIO 17/18)  |
          |  [Autonomous State Machine]          |             |  [Preferences NVS Persistence]       |
          |  [Lid Priority Display Engine]       |             |  [Modular 16x2 I2C LCD] (GPIO 21/22) |
          +--------------------------------------+             +--------------------------------------+
                              |                                                     |
                              +-----------------------+-----------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |      THREE PHYSICAL COMPARTMENTS      |
                                  |                                       |
                                  |  - Compartment A: Biodegradable       |
                                  |    (Moisture C1 & Load Cell 1)        |
                                  |                                       |
                                  |  - Compartment B: Non-Biodegradable   |
                                  |    (Moisture C2 & Load Cell 2)        |
                                  |                                       |
                                  |  - Compartment C: Reserved Future Use |
                                  |    (Clean, No sensors, Unconfigured)  |
                                  +---------------------------------------+
```

---

## 2. Hardware Responsibilities & Pin Mapping

### Module A — Arduino Uno R3 (Lid Control & Proximity)
*Autonomous operation: The Uno independently runs the proximity loop and servo state machine. Disconnecting the host, ESP32, or ML service never prevents automatic lid opening.*

| Peripheral | Pins | Logic Level | Function |
| :--- | :--- | :--- | :--- |
| **HC-SR04 Ultrasonic** | D4 (TRIG), D5 (ECHO) | 5.0V TTL | Proximity detection (threshold $\le 20.0\text{ cm}$) |
| **Automatic Lid Servo** | D6 (PWM) | 5.0V TTL | 0° (Closed) ↔ 90° (Open) actuation |
| **Proximity LED** | D7 (via 220Ω) | 5.0V TTL | Amber indicator (active approach) |
| **Fault LED** | D8 (via 220Ω) | 5.0V TTL | Red indicator (sensor timeout) |
| **Heartbeat LED** | D13 (onboard) | 5.0V TTL | 500ms heartbeat pulse |
| **Modular 16x2 LCD** | A4 (SDA), A5 (SCL) | 5.0V TTL | Address `0x27`; shows Commanded Lid State & Distance |
| **USB Telemetry** | D0 (RX), D1 (TX) | 5.0V TTL | Serial output at 115200 baud |

### Module B — ESP32 DevKit V1 (4-Channel Sensor Hub)
*High-resolution measurement hub: Ingests 4 independent physical sensor channels, manages calibration in NVS, and rotates telemetry screens on its connected LCD.*

| Sensor Channel | Assigned Pin | Logic Level | Target Compartment | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Moisture C1** | GPIO 34 (ADC1_CH6) | 3.3V Max | Compartment A (Biodegradable) | Independent 12-bit ADC (0–4095) |
| **Moisture C2** | GPIO 35 (ADC1_CH7) | 3.3V Max | Compartment B (Non-Biodegradable)| Independent 12-bit ADC (0–4095) |
| **Load Cell 1 (LC1)**| GPIO 16 (DOUT), 4 (SCK) | 3.3V | Compartment A (Biodegradable Mass) | Dedicated HX711 strain gauge amplifier |
| **Load Cell 2 (LC2)**| GPIO 17 (DOUT), 18 (SCK)| 3.3V | Compartment B (Non-Biodegradable Mass)| Independent second HX711 amplifier |
| **Modular 16x2 LCD** | GPIO 21 (SDA), 22 (SCL)| 3.3V | System Display | Address `0x27`; 4-page rotating telemetry |
| **Status LED** | GPIO 2 (onboard blue) | 3.3V | Diagnostic | Blink on command ACK & telemetry pulse |

---

## 3. Bin Compartment Configuration

The physical waste bin incorporates **three compartments**:

1. **Compartment A — Biodegradable Waste (Active):**
   - **Sensors:** Capacitive Moisture Sensor C1 + Load Cell 1.
   - **Dashboard Display:** Moisture %, Mass (g), Plain-language moisture hint, 5m ML trend forecast.
   - **Total Weight Inclusion:** Fully included in total mass calculations.
2. **Compartment B — Non-Biodegradable Waste (Active):**
   - **Sensors:** Capacitive Moisture Sensor C2 + Load Cell 2.
   - **Dashboard Display:** Moisture %, Mass (g), Plain-language moisture hint, 5m ML trend forecast.
   - **Total Weight Inclusion:** Fully included in total mass calculations.
3. **Compartment C — Reserved / Future Use (Strictly Inactive):**
   - **Sensors:** None assigned.
   - **Dashboard Display:** Displays `NOT CONFIGURED` and `Reserved for future hardware expansion`.
   - **Truthful Operation:** Zero values are never fabricated. Excluded from mass totals. Excluded from category classification training.

---

## 4. Two-Page Operational Dashboard

The web dashboard is organized into two distinct views:

### Page 1: Overview Dashboard
*Designed for everyday monitoring with clean, accessible environmental metrics:*
- **Summary Metrics Strip:** Total measured waste (sum of valid LC1 + LC2, labeled partial if one is offline), Commanded Lid state, Hardware links online (X / 2), and active diagnostics count.
- **Microcontroller Health Cards:** Separate cards for Arduino Uno (Proximity & Lid) and ESP32 (Sensors), showing connection state, distance, and freshness.
- **Three Compartment Cards:** Visual status for Compartment A, Compartment B, and the neutral Reserved Compartment C.
- **Live Historical Charts:** Responsive SVG charts for mass measurements (LC1 vs LC2) and moisture readings (C1 vs C2) without drawing misleading lines across null gaps.
- **Plain-English Alerts & ML Insights:** Straightforward status notices and predictive summaries.

### Page 2: Technical Operations
*Designed for engineering, diagnostics, calibration, and maintenance:*
- **Panel A: Device Management:** Detailed transport metrics, time elapsed since last packet, uptime, sequence counters, and raw JSON telemetry inspector for both microcontrollers.
- **Panel B: Four-Channel Diagnostics:** Raw 12-bit ADC counts, calibrated moisture percentages, raw HX711 strain gauge counts, tare offsets, calibration factors, and channel health indicators for C1, C2, LC1, and LC2.
- **Panel C: Autonomous Lid Diagnostics:** Ultrasonic distance, 20.0 cm proximity threshold, 2-cycle debounce, hold open timer (4000ms), cooldown timer (1500ms), and cross-device lid synchronization status.
- **Panel D: Targeted Command Console & Calibration Workflows:**
  - **Arduino Uno Controls:** Force Lid Open (`'o'`), Force Lid Close (`'x'`), Request Uno Status (`'s'`). Only enabled in Live Hardware Mode; safely disabled in Simulation Mode.
  - **ESP32 Calibration Workflows:** Tare LC1, Calibrate LC1 with known reference mass, Tare LC2, Calibrate LC2 with known reference mass, Record C1 Dry/Wet references, Record C2 Dry/Wet references. All settings persist directly to ESP32 Preferences (NVS).
- **Panel E & F: LCD & ML Diagnostics:** Loaded model versions, training timestamps, isolation forest anomaly attribution, dual load cell forecast benchmarks (+5m, +15m, +30m with transparent persistence comparisons), and experimental category classifier confidence.

---

## 5. Quick Start & Execution Guide (Windows PowerShell)

All commands are fully validated for native Windows PowerShell 5.1.

### Step 1: Start the IoT Backend Server
```powershell
powershell -ExecutionPolicy Bypass -File backend\server.ps1 -Port 8080
```
Open your browser to: **[http://localhost:8080/](http://localhost:8080/)**

*(Optional Node.js alternative: `node backend/server.js`)*

### Step 2: Start the Machine Learning Inference Service (Optional)
```powershell
python -m uvicorn ml.service:app --host 127.0.0.1 --port 8000
```

### Step 3: Connect Hardware Telemetry via Serial Gateway
If physical hardware is connected via USB:
```powershell
# For both Arduino Uno and ESP32 connected:
powershell -ExecutionPolicy Bypass -File gateway\serial_gateway.ps1 -UnoPort COM3 -Esp32Port COM4

# For Arduino Uno only:
powershell -ExecutionPolicy Bypass -File gateway\serial_gateway.ps1 -UnoPort COM3
```

### Step 4: Run the Complete Automated Test Suite
```powershell
powershell -ExecutionPolicy Bypass -File test\run_tests.ps1
```

---

## 6. Sensor Calibration Instructions

Calibration can be performed either through the **Technical Operations** dashboard page (Panel D) or via direct serial command frames:

### Load Cell 1 (Compartment A Mass)
1. Ensure the Compartment A bin is empty. Click **"Tare LC1"** (or send `{"cmd":"tare","channel":"lc1"}`).
2. Place a known 500g test weight on Compartment A. Enter `500` in **Ref g** and click **"Calibrate LC1"** (or send `{"cmd":"cal_weight","channel":"lc1","ref_g":500}`).
3. The new calibration factor is calculated and stored in ESP32 NVS.

### Load Cell 2 (Compartment B Mass)
- Perform the identical 2-step sequence using the dedicated **LC2** controls. Do NOT copy the LC1 factor to LC2.

### Capacitive Moisture Sensor C1 (Compartment A Moisture)
1. Clean the C1 blade and hold it suspended in dry air. Click **"Set Dry Air Ref (0%)"** (or send `{"cmd":"cal_moist_dry","channel":"c1"}`).
2. Submerge the lower capacitive blade into clean water. Click **"Set Wet Water Ref (100%)"** (or send `{"cmd":"cal_moist_wet","channel":"c1"}`).
3. Stored in ESP32 NVS and marked calibrated.

### Capacitive Moisture Sensor C2 (Compartment B Moisture)
- Perform the identical dry/wet sequence using the dedicated **C2** controls.

---

## 7. Dual LCD Display Operation & Synchronization

### Arduino Uno LCD (0x27 I2C Backpack)
- **Screen 0 (Priority):** Shows `LID: OPEN` / `LID: CLOSED`, along with current ultrasonic distance `D: XXcm` and proximity detection `Px: YES/NO`.
- **Screen 1 (Diagnostic):** Toggles automatically every 4 seconds if an active ultrasonic timeout fault occurs.

### ESP32 LCD (0x27 I2C Backpack)
Rotates through 4 dedicated pages every 3.5 seconds:
- **Page 1:** `C1: 58% LC1: 380g` (Compartment A: Biodegradable status).
- **Page 2:** `C2: 14% LC2: 210g` (Compartment B: Non-Biodegradable status).
- **Page 3:** `CALIB: OK / NVS` (Hardware health and NVS calibration status).
- **Page 4:** `LID: OPEN (SYNC)` (Synchronized Uno lid command state).

### Cross-Device Synchronization
- When the Uno lid state changes, the Serial Gateway (`gateway/serial_gateway.ps1`) automatically relays `{"cmd":"sync_lid","state":"OPEN"}` into the ESP32 UART.
- If updates cease for $>5000\text{ ms}$, the ESP32 LCD displays `LID: STALE` to prevent showing outdated actuator states.

---

## 8. Machine Learning Model Diagnostics

All models operate on the 4-channel reproducible feature schema and are evaluated with session-based chronological splits:

- **Model A: Anomaly Detector (`IsolationForest`):** Normalizes 12-bit moisture ADC readings and HX711 strain gauge counts. Detects channel disconnections, extreme electrical noise, and sensor timeout faults with channel-specific attribution.
- **Model B: Multi-Horizon Weight Forecaster (`RandomForestRegressor`):** Forecasts mass accumulation independently for LC1 and LC2 at +5m, +15m, and +30m horizons. Compares predictions transparently against a persistence baseline.
  - *Benchmark:* +5m MAE is 306.8g (vs Baseline 513.5g — beats baseline). As documented in the dashboard, the +30m horizon degrades relative to persistence and is labeled transparently.
- **Model C: Category Classifier (`RandomForestClassifier`):** Strictly classifies waste into **Biodegradable** vs **Non-Biodegradable**. Compartment C is explicitly excluded. Labeled as synthetic prototype rules rather than chemical validation.
