# ARCHITECTURE AUDIT REPORT: MULTI-MICROCONTROLLER RECONCILIATION
**Project:** Intelligent Waste Segregation Analytics  
**Date:** October 29, 2026  
**Auditor:** Senior IoT Systems Architect & Embedded Firmware Engineer

---

## 1. Executive Summary & Hardware Reconciliation

The local repository was audited against its commit history and GitHub repository state (`origin/main`). While initial documentation and prototype code concentrated all sensors onto a single Arduino Uno R3, the hardware team's **actual intended arrangement** partitions responsibilities across two dedicated physical microcontrollers:

| Microcontroller | Role & Dedicated Sensors | Telemetry Fields | Connection Transport |
| :--- | :--- | :--- | :--- |
| **Module A: Arduino Uno** (ATmega328P, 5V TTL) | **Proximity Detection & Autonomous Lid Actuator**<br>• HC-SR04 Ultrasonic (TRIG: D4, ECHO: D5)<br>• Servo Lid Actuator (PWM: D6)<br>• Proximity Indicator LED (D7)<br>• Heartbeat LED (D13) | `v`, `dev`: "UNO-WS01", `seq`, `up`, `dist_cm`, `prox`, `lid_cmd`, `faults` | USB Serial UART (e.g. `COM3` @ 115200 baud) |
| **Module B: ESP32** (DevKit V1, 3.3V Logic) | **Waste Properties Acquisition (Moisture & Mass)**<br>• Capacitive Moisture Sensor (12-bit ADC, GPIO 34 / A0)<br>• HX711 Load Cell Amplifier (DOUT: GPIO 16, SCK: GPIO 4)<br>• Diagnostic Fault LED (GPIO 2) | `v`, `dev`: "ESP32-WS01", `seq`, `up`, `moist_raw`, `moist_pct`, `moist_ok`, `moist_cal`, `weight_g`, `weight_raw`, `weight_ok`, `weight_cal`, `faults` | USB Serial UART (e.g. `COM4` @ 115200 baud) or Wi-Fi HTTP POST to `/api/telemetry/esp32` |
| **Laptop Host** | **Telemetry Ingestion, Normalization, Backend, ML & Dashboard**<br>• Backend server (`backend/server.ps1` / `server.js` @ port 8080)<br>• FastAPI ML Inference Microservice (`ml/service.py` @ port 8000)<br>• Real-time unified operational dashboard (`simulation/dashboard/`) | Normalized Composite Telemetry: `uno`, `esp32`, `combined`, `device_health` | Localhost HTTP / REST API |

---

## 2. Detailed Findings by Subsystem

### A. Firmware & Hardware
1. **Arduino Uno Firmware (`src/`):**
   - The ultrasonic ping and lid state machine (with non-blocking hold-open of 4s and cooldown of 1.5s) are completely decoupled from host software.
   - **Adaptation:** Streamline Uno firmware so it operates as a dedicated proximity & lid controller. Emit `UNO-WS01` telemetry with `dist_cm`, `prox`, `lid_cmd`, and `faults`. Retain full autonomous servo control in hardware loop.
2. **ESP32 Firmware:**
   - PlatformIO currently contains `[env:esp32dev]`.
   - ESP32 uses a 12-bit SAR ADC (`0–4095`) rather than ATmega328P 10-bit ADC (`0–1023`). Capacitive moisture sensors on 3.3V produce inverted voltage (lower ADC = wetter).
   - **Adaptation:** Create dedicated ESP32 firmware (`firmware/esp32/esp32_sensors.ino` and dual PlatformIO target) sampling 12-bit moisture and HX711, emitting `ESP32-WS01` JSON Lines packets.

### B. Backend Communications & Data Normalization
1. **Current Backend (`backend/server.ps1` & `backend/server.js`):**
   - Assumes a single `$global:latestTelemetry` object. A packet without moisture/weight currently sets those fields to null or overwrites existing values.
   - Assumes a single `$global:lastReceivedTime` and single device health status.
2. **Required Architecture:**
   - Maintain independent state stores:
     - `latestUnoTelemetry` & `lastUnoReceivedTime`
     - `latestEsp32Telemetry` & `lastEsp32ReceivedTime`
     - `deviceHealth` tracking per-device status (`CONNECTED`, `STALE`, `DISCONNECTED`, `NOT_CONFIGURED`, `ERROR`).
   - Implement ingestion endpoints:
     - `POST /api/telemetry/uno`
     - `POST /api/telemetry/esp32`
     - `POST /api/telemetry` (discriminating by payload `dev` ID)
     - `GET /api/devices/status` (independent device health summary)
     - `GET /api/telemetry/combined` (composite object with separate timestamps and freshness flags)
   - Dual-device serial gateway: Update `gateway/serial_gateway.ps1` to accept `-UnoPort` and `-Esp32Port`.

### C. Dashboard & Monitoring
1. **Current Dashboard:**
   - Single connection badge and health item displaying Arduino Uno only.
   - Sensor cards assume all telemetry arrives simultaneously.
2. **Required Architecture:**
   - Header strip with dual health indicators: **Arduino Uno (Lid/Ultrasonic)** and **ESP32 (Moisture/Weight)**.
   - Moisture & Weight cards listen to ESP32 stream, displaying ESP32 12-bit ADC (`0–4095`) and load cell readings.
   - Proximity & Lid cards listen to Uno stream.
   - If ESP32 disconnects, Uno cards and lid status remain live; if Uno disconnects, ESP32 cards remain live.
   - Stale data indicators displayed when individual stream exceeds sampling timeout.

### D. Simulation Engine & Synthetic Dataset
1. **Existing Synthetic Generator (`ml/synthetic_data.py`):**
   - Modeled a single device (`SIM-WS01`) using Uno 10-bit ADC formulas.
2. **Required Architecture:**
   - Model two independent simulated streams: `UNO-WS01` (ultrasonic, proximity, servo state machine) and `ESP32-WS01` (12-bit moisture ADC, HX711 load cell).
   - Simulate independent communication faults, dropped packets, and one-device offline scenarios.
   - Regenerate >= 24,000 records partitioned by session across diverse scenarios.

### E. Machine Learning Pipeline
1. **Feature Extraction (`ml/features.py`):**
   - Incorporate per-device latency and connectivity features: `uno_connected`, `esp32_connected`, `time_since_uno_s`, `time_since_esp32_s`, normalized 12-bit moisture.
2. **Models & Retraining (`ml/train.py`, `ml/service.py`):**
   - Retrain Isolation Forest Anomaly Detector and Random Forest Weight Forecaster on the regenerated two-device dataset.
   - Benchmark against Persistence Baseline and evaluate held-out test sessions.
