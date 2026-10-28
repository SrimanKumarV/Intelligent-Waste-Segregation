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
- **Data-Driven Operational Dashboard:** Restrained, light environmental aesthetic (Forest green `#15803d`, off-white `#f8fafc`). Shows only genuine sensor readings and honest empty states—no fabricated charts or simulated slider data.
- **Dual Connectivity Modes:** Supports remote gateway monitoring over HTTP as well as direct USB connection in-browser via the Web Serial API.

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

## Project Structure

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
├── backend/
│   ├── server.ps1              # Native PowerShell/.NET HTTP REST & data storage server
│   └── server.js               # Cross-platform Node.js IoT backend alternative
├── gateway/
│   └── serial_gateway.ps1      # USB COM port to HTTP telemetry forwarder
├── simulation/
│   └── dashboard/              # Production light-themed environmental IoT dashboard
│       ├── index.html          # Semantic HTML5 operational dashboard
│       ├── styles.css          # Restrained environmental design (Forest green / Off-white)
│       ├── app.js              # Data-driven client (Web Serial + REST API polling)
│       └── serve.ps1           # Wrapper to launch backend server
├── data/                       # Persistent JSON Lines telemetry & event logs
│   ├── telemetry.jsonl         # Recorded genuine sensor telemetry
│   ├── lid_events.jsonl        # Recorded proximity & lid actuation transitions
│   └── classifications.jsonl  # Recorded verified waste classification events
├── test/
│   ├── test_detection.cpp      # Host-side unit tests for 2-category logic
│   └── run_tests.ps1           # Test runner for schemas, tests, and asset checks
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
