# Test Plan & Quality Assurance — Intelligent Waste Segregation Analytics

This test plan defines verification stages for the Arduino Uno physical prototype, serial communication bridge, backend telemetry pipeline, and operational dashboard.

---

## 1. Test Architecture Overview

```
[Physical Sensors / Uno Firmware]
       │ (JSON Lines Telemetry via USB)
       ▼
[Serial Gateway Bridge (COM3 @ 115200)]
       │ (HTTP POST /api/telemetry)
       ▼
[IoT Backend Server (localhost:8080)]
       │ (REST API & JSONL Persistence)
       ▼
[Operational IoT Dashboard (Browser)]
```

---

## 2. Test Stages & Test Cases

### Stage A: Hardware Electrical Verification (Pre-Power)
| Test ID | Objective | Procedure | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-HW-01** | Power Rail Isolation | Measure resistance between 5V and GND rail on breadboard before power. | Resistance > 10kΩ (no short circuits). |
| **TC-HW-02** | HX711 Pin Verification | Inspect DOUT connected to D2 and SCK connected to D3. | Firm mechanical connection. |
| **TC-HW-03** | Ultrasonic Pin Verification | Inspect TRIG to D4 and ECHO to D5. | 5V TTL connections confirmed. |
| **TC-HW-04** | Servo Common Ground | Verify external power GND is tied to Arduino GND. | 0Ω continuity between grounds. |

### Stage B: Firmware Compilation & Telemetry
| Test ID | Objective | Procedure | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-FW-01** | PlatformIO Compilation | Execute build for `uno` target. | Clean compilation with zero memory overflow (<32KB Flash, <2KB SRAM). |
| **TC-FW-02** | Startup Banner Emission | Power Uno and monitor serial output at 115200 baud. | Formatted system identification banner and command guide printed. |
| **TC-FW-03** | JSON Lines Schema | Capture continuous telemetry stream. | Every record is valid JSON terminating with `\n`. |
| **TC-FW-04** | Explicit Null Preservation | Observe telemetry before running calibration. | `moist_pct: null` and `weight_g: null` emitted (never fake zeroes). |

### Stage C: Sensor Acquisition & Actuation Logic
| Test ID | Objective | Procedure | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-SN-01** | Moisture Response | Touch damp paper towel to sensor blade. | Raw ADC drops significantly; calibrated % rises. |
| **TC-SN-02** | Moisture Disconnect | Unplug wire from Pin A0. | Telemetry reports `moist_ok: false` and fault flag `MOISTURE_OFFLINE`. |
| **TC-SN-03** | HX711 Response | Apply downward force to load cell platform. | `weight_raw` counts change proportionally. |
| **TC-SN-04** | Tare Operation | Send serial command `t`. | Subsequent empty reading reads 0.0g. |
| **TC-SN-05** | Proximity Detection | Place hand 10cm from HC-SR04 for 2 cycles. | `dist_cm` reads ~10cm, `prox: true`, `lid_cmd: "OPEN"`. |
| **TC-SN-06** | Lid Auto-Close & Cooldown | Remove hand from sensor; wait 4 seconds. | Servo returns to 0° (`lid_cmd: "CLOSED"`), cooldown active for 1.5s. |

### Stage D: Backend & Storage Pipeline
| Test ID | Objective | Procedure | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-BE-01** | Telemetry Ingestion | `POST /api/telemetry` with sample JSON packet. | HTTP 200 returned; record written to `data/telemetry.jsonl`. |
| **TC-BE-02** | Latest Telemetry API | `GET /api/telemetry/latest`. | Returns ingested packet with `received_at` server timestamp. |
| **TC-BE-03** | Device Staleness Detection | Stop sending telemetry for 6 seconds. | `GET /api/health` transitions from `ONLINE` to `STALE`. |
| **TC-BE-04** | Classification Storage | `POST /api/classification` with Biodegradable record. | Record appended to `data/classifications.jsonl`; counts updated. |

### Stage E: Operational Dashboard Integration
| Test ID | Objective | Procedure | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-UI-01** | Zero Simulated Data in Live Mode | Load dashboard in Live Hardware Mode. | Cards display honest "—" / "Awaiting valid sensor reading", zero fake charts. |
| **TC-UI-02** | Live Card Updates | Stream telemetry packet. | Moisture, weight, proximity, and lid cards update instantly. |
| **TC-UI-03** | Dual Categories Display | Verify Biodegradable vs Non-Biodegradable. | Displays exact recorded counts and percentages; empty notice if 0. |
| **TC-UI-04** | Web Serial Direct Connect | Click "Direct USB (Web Serial)" in browser. | Connects directly to Uno COM port and updates dashboard. |

### Stage F: Dual Monitoring Mode & Simulation Engine Verification
| Test ID | Objective | Procedure | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **TC-SIM-01** | Mode Switch Operation | Click toggle switch or press Space/Enter. | Mode transitions between Live Hardware and Simulation smoothly with debounce. |
| **TC-SIM-02** | Persistent Mode Banner | Observe banner in both modes. | Shows `LIVE HARDWARE MODE` (green) or `SIMULATION MODE — SYNTHETIC DATA` (amber/striped). |
| **TC-SIM-03** | Scenario A Execution | Select Scenario A. | Normal cycles, natural proximity events (≤20cm), lid opens 4s then closes. |
| **TC-SIM-04** | Scenario B Fill Curve | Select Scenario B. | Mass accumulates +75–140g per cycle; moisture trends upward; chart updates. |
| **TC-SIM-05** | Scenario C Fault Injection | Select Scenario C / Toggle fault. | Alerts trigger: `HX711_TIMEOUT`, `MOISTURE_OFFLINE`; clears when restored. |
| **TC-SIM-06** | Data Source Separation | Run simulation for 20 cycles and inspect `data/telemetry.jsonl`. | ZERO synthetic records in production log file. Charts use memory buffer. |
| **TC-SIM-07** | Actuator Invalidation | Click Tare, Open, Close buttons in Simulation Mode. | Serial commands intercepted; physical actuators NOT triggered. |
| **TC-SIM-08** | Automated Test Execution | Run `powershell -File test\test_simulation_mode.ps1`. | All 18 automated integration tests pass with 0 failures. |

