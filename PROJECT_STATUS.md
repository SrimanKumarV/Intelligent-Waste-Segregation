# Project Status — Intelligent Solid Waste Segregation Analytics

**Last Updated:** October 28, 2026  
**Firmware Version:** 2.0.0-UNO  
**Microcontroller Target:** Arduino Uno R3 (Microchip ATmega328P, 5V Logic)  
**Supported Categories:** Biodegradable Waste & Non-Biodegradable Waste (Strict 2-Class Model)  

---

## 1. Project Overview

The project has been refactored from a multi-sensor ESP32 proof-of-concept into a functional, professional, remotely accessible IoT Smart Waste Segregation Analytics system centered on an **Arduino Uno** physical prototype with genuine sensor measurements, automatic proximity-driven lid opening, and zero synthetic/fabricated dashboard data.

---

## 2. Completed Implementation Tasks ✅

### A. Microcontroller & Hardware Alignment
- [x] Refactored `platformio.ini` with `[env:uno]` as default target (ATmega328P, 16MHz, 5V).
- [x] Aligned pin mapping and logic levels for 5.0V TTL operation (`docs/PIN_MAPPING.md`).
- [x] Streamlined sensor suite to the 3 active prototype sensors + 1 actuator:
  - 1× Capacitive Soil Moisture Sensor (Analog Pin A0, 10-bit ADC 0–1023)
  - 1× Load Cell + HX711 Amplifier (Digital Pins D2 DOUT, D3 SCK)
  - 1× HC-SR04 Ultrasonic Proximity Sensor for Automatic Lid Opening (Digital Pins D4 TRIG, D5 ECHO)
  - 1× Lid Servo Actuator (PWM Pin D6, 0° Closed, 90° Open)
  - 3× Diagnostic LEDs (D13 Heartbeat, D7 Proximity Active, D8 Sensor Fault)
- [x] Removed unsupported legacy ESP32 multi-sensor assignments (gas, metal, dual fill-level).

### B. Firmware & Telemetry Architecture
- [x] Non-blocking sensor acquisition loop and proximity debounce (`src/sensors.cpp`).
- [x] Automatic lid state machine (`CLOSED` ➔ `OBJECT_DETECTED` ➔ `OPEN` ➔ `HOLD_TIMER` ➔ `CLOSED` ➔ `COOLDOWN`).
- [x] Dual-point moisture calibration (Air Raw 0% vs Water Raw 100%) with explicit uncalibrated status.
- [x] HX711 tare and reference mass calibration routines.
- [x] Zero-heap-allocation JSON Lines telemetry serializer (`src/serial_output.cpp`) optimized for Uno 2KB SRAM.
- [x] Strict physical measurement truth: uncalibrated and missing values are emitted as explicit `null` (never fake zeroes).
- [x] Non-blocking serial command processor supporting `'t'`, `'c'`, `'m'`, `'o'`, `'x'`, `'h'`.

### C. Backend & Data Pipeline
- [x] Production IoT Backend Server (`backend/server.ps1` and `backend/server.js`) listening on port 8080.
- [x] Persistent JSONL storage engine (`data/telemetry.jsonl`, `data/lid_events.jsonl`, `data/classifications.jsonl`).
- [x] Full REST API endpoints:
  - `GET /api/health` — Device connectivity, staleness tracking, active fault bitmask.
  - `GET /api/telemetry/latest` — Latest genuine sensor measurements with server receipt timestamp.
  - `GET /api/telemetry/history` — Time-series measurements for charting.
  - `GET /api/lid/events` — Genuine proximity and lid actuation timeline.
  - `GET /api/categories` — Real verified 2-category statistics (Biodegradable vs Non-Biodegradable).
  - `POST /api/telemetry` — Ingestion endpoint for gateway or USB serial.
  - `POST /api/classification` — Verified waste segregation event logging.
- [x] Serial Gateway bridge (`gateway/serial_gateway.ps1`) for forwarding Arduino Uno USB telemetry to backend.

### D. Operational IoT Dashboard
- [x] Professional light environmental monitoring aesthetic (Forest green `#15803d`, off-white `#f8fafc`, charcoal text).
- [x] Removed ALL simulation sliders, artificial preset scenarios, and fake continuous loops.
- [x] Live physical sensor cards (Moisture, Weight, Proximity, Lid Actuator) with explicit empty and uncalibrated states.
- [x] Two-Category analytics cards displaying strictly verified recorded events.
- [x] Real-time lid activity log table.
- [x] SVG historical analytics charts (Weight vs Time & Moisture vs Time) with honest empty states.
- [x] Direct USB Web Serial connection support (direct browser-to-Uno connection via Chrome/Edge).

### E. Documentation & Protocol
- [x] Updated `docs/PIN_MAPPING.md`, `docs/WIRING_GUIDE.md`, `docs/CALIBRATION_GUIDE.md`, and `docs/TEST_PLAN.md`.
- [x] Created `docs/TELEMETRY_PROTOCOL.md` specifying JSON Lines schema and fault codes.

---

## 3. Pending Physical Steps (Requires Connected Hardware) ⏳

The software, firmware, telemetry pipeline, backend, and dashboard are fully implemented. The following tasks require physical hardware:

1. **Connect Arduino Uno:** Plug the Arduino Uno into a USB port on your PC.
2. **Wire Sensors:** Complete breadboard wiring according to [`docs/WIRING_GUIDE.md`](docs/WIRING_GUIDE.md).
3. **Upload Firmware:** Run `pio run --target upload -e uno` via PlatformIO CLI or VS Code.
4. **Execute Calibration:**
   - Run moisture 2-point calibration (send `m` in serial terminal).
   - Run load cell calibration with a known reference weight (send `c`).
5. **Start Gateway / Backend:**
   - Launch backend: `powershell -ExecutionPolicy Bypass -File backend\server.ps1`
   - Launch gateway: `powershell -ExecutionPolicy Bypass -File gateway\serial_gateway.ps1 -ComPort COMx`
   - Access dashboard at `http://localhost:8080/`.
