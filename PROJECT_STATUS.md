# Project Status — Intelligent Solid Waste Segregation Analytics

**Last Updated:** October 29, 2026  
**System Architecture:** Multi-Microcontroller IoT System (Module A: Arduino Uno & Module B: ESP32 DevKit V1)  
**Dashboard:** Two-Page Operational Experience (Overview & Technical Operations)  
**Sensors:** 4 Independent Channels (C1, C2, LC1, LC2) across 2 Active Compartments + 1 Reserved Future Use  
**Firmware Targets:** `2.1.0-UNO` (ATmega328P) & `2.2.0-ESP32` (DevKit V1)  
**Displays:** Dual Modular I2C 16x2 Character LCDs on Uno (0x27) and ESP32 (0x27)  

---

## 1. Project Overview

The project implements a distributed, dual-microcontroller smart waste segregation system:
1. **Module A (Arduino Uno):** Autonomously controls proximity detection (HC-SR04) and automatic lid opening/closing servo actuation. Operates completely independently from the host and ESP32 to guarantee safety and responsiveness. Drives its own connected 16x2 I2C LCD.
2. **Module B (ESP32 DevKit V1):** High-resolution multi-channel sensor hub reading 4 independent physical sensor channels (Capacitive Moisture C1 and C2 on ADC1; Load Cell 1 and Load Cell 2 via dual HX711 interfaces). Manages Preferences/NVS persistent calibration and displays 4-page rotating telemetry on its connected 16x2 I2C LCD.
3. **Host Backend & Gateway:** Bridges dual USB serial COM ports, coordinates cross-device lid synchronization from Uno to ESP32 LCD, ingests telemetry, exposes REST endpoints, and logs genuine data.
4. **Machine Learning Pipeline:** Real-time multi-channel anomaly detection (Isolation Forest + rule-based attribution), independent dual load cell waste mass forecasting (+5m, +15m, +30m with persistence baseline comparison), and experimental 2-class category classification (Biodegradable vs Non-Biodegradable; Compartment C explicitly excluded).
5. **Two-Page Dashboard:**
   - **Page 1: Overview Dashboard:** High-level environmental metrics, dual-device health, 3 compartment cards (Bio, Non-Bio, Reserved), simple trends, plain-English alerts, and accessible ML insights.
   - **Page 2: Technical Operations:** Detailed microcontroller management, 4-channel raw/calibrated telemetry, lid state machine diagnostics, targeted command console with non-blocking calibration workflows, LCD diagnostics, and transparent ML evaluation benchmarks.

---

## 2. Completed Implementation Matrix ✅

### Phase 1 & 2: System Architecture & Three Compartments
- [x] Clear architectural division: Uno owns ultrasonic proximity and autonomous lid servo; ESP32 owns C1, C2, Load Cell 1, and Load Cell 2.
- [x] Compartment A assigned to Biodegradable Waste (Moisture C1 on GPIO 34, Load Cell 1 on GPIO 16/4).
- [x] Compartment B assigned to Non-Biodegradable Waste (Moisture C2 on GPIO 35, Load Cell 2 on GPIO 17/18).
- [x] Compartment C configured as `RESERVED_FUTURE_USE` (neutral indicator, excluded from mass totals, zero fake data suppressed).

### Phase 3 & 4: Four Independent Sensor Channels & Calibration
- [x] Independent pin assignments, raw ADC reads, and calibration parameters for C1 (GPIO 34) and C2 (GPIO 35) on ESP32 ADC1.
- [x] Independent HX711 instances, DOUT/SCK pins, tare offsets, and calibration factors for Load Cell 1 and Load Cell 2.
- [x] Non-Volatile Storage (Preferences/NVS) persistence on ESP32.
- [x] Non-blocking calibration commands for empty-scale tare, reference mass calibration, and dry/wet moisture references.
- [x] Explicit null preservation: uncalibrated or disconnected sensors emit `null` instead of fabricated zeroes.

### Phase 5 & 6: Two-Page Dashboard & Modular LCD Implementation
- [x] Single-page application architecture with seamless tab navigation (`Overview` vs `Technical Operations`).
- [x] Overview page with total measured weight, lid actuator state, microcontroller health cards, 3 compartment cards, simple SVG charts, plain-English alerts, and ML insights.
- [x] Technical Operations page with device management panels, 4-channel diagnostic meters, lid state machine parameters, targeted command console, and ML model benchmarks.
- [x] Modular I2C LCD driver on Arduino Uno (`src/lcd_display.cpp`, `include/lcd_display.h`) with non-blocking I2C presence ping and priority lid state display.
- [x] Modular I2C LCD driver on ESP32 (`firmware/esp32/esp32_sensors.ino`) with 4-page rotating display and synchronized lid state.
- [x] Cross-device lid synchronization via Host Serial Gateway (`gateway/serial_gateway.ps1`) with 5000ms staleness timeout.

### Phase 7 & 8: Firmware, Backend & Data Normalization
- [x] Root `platformio.ini` configured with independent build environments: `[env:uno]` (default) and `[env:esp32dev]`.
- [x] Removed blocking legacy calibration routines from Uno firmware (`src/serial_output.cpp`), returning guidance to route calibration commands to ESP32.
- [x] Updated Native PowerShell backend (`backend/server.ps1`) and Node.js backend (`backend/server.js`) with 4-channel telemetry schema, `/api/cmd/uno`, `/api/cmd/esp32`, `/api/compartments`, and device health.
- [x] Validated ASCII syntax for native Windows PowerShell 5.1 compatibility.

### Phase 9 & 10: Multi-MCU Synthetic Simulation & Retrained ML Pipeline
- [x] Simulation Mode generates 2 independent streams (Simulated Uno and Simulated ESP32) with 6 scenarios (A–F).
- [x] Physical actuators completely isolated during simulation. Compartment C remains reserved and inactive.
- [x] Retrained 4-channel reproducible dataset (`data/synthetic/sensor_readings.csv`, `data/synthetic/sensor_readings.jsonl`).
- [x] Channel-attributed Anomaly Detector (`ml/anomaly_detector.py`).
- [x] Independent dual load-cell Weight Forecaster (`ml/weight_forecaster.py`) evaluating LC1 and LC2 against persistence baselines.
- [x] Strict 2-class Category Classifier (`ml/category_classifier.py`) excluding Compartment C.
- [x] Fast ML microservice (`ml/service.py`) with honest fallback status.

---

## 3. Verification & Automated Test Results

| Test Suite | Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **Asset Integrity Test** | `powershell -ExecutionPolicy Bypass -File test/test_static_assets.ps1` | **PASS (100%)** | Validated `index.html`, `app.js`, `styles.css` |
| **Simulation Mode Test** | `powershell -ExecutionPolicy Bypass -File test/test_simulation_mode.ps1` | **PASS (18/18)** | 0 failures; validated mode isolation & API endpoints |
| **Sensor ML Suite** | `python -m pytest test/test_ml.py` | **PASS (11/11)** | All model features, pipelines & synthetic physics verified |
| **End-to-End Suite** | `powershell -ExecutionPolicy Bypass -File test/run_tests.ps1` | **PASS (ALL)** | Complete integration checks passed |
