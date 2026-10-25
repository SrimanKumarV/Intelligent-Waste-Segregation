# Intelligent Solid Waste Segregation System

An ESP32-based sensor system for monitoring waste bins and detecting possible waste segregation errors using gas, moisture, metal, weight, and fill-level sensors.

## Features

- **Dual-bin monitoring:** Biodegradable and non-biodegradable waste bins
- **9 sensors:** Gas (1), moisture (2), metal (2), load cell/weight (2), ultrasonic level (2)
- **Rule-based mismatch detection** with persistence checking to reduce false alerts
- **5 LED indicators** for system status, mismatch warnings, bin capacity, and sensor faults
- **Serial diagnostics** with human-readable and CSV output modes
- **Interactive calibration** for load cells via serial commands
- **Modular firmware** — sensor acquisition, detection logic, LED control, and output separated

## Hardware Requirements

| Component | Qty | Purpose |
|-----------|-----|---------|
| ESP32 DevKit V1 | 1 | Main controller |
| MQ-series gas sensor | 1 | Gas/VOC detection |
| Capacitive moisture sensor | 2 | Moisture in each bin |
| Inductive proximity sensor | 2 | Metal detection in each bin |
| Load cell (5kg–10kg bar type) | 2 | Weight measurement |
| HX711 amplifier module | 2 | Load cell interface |
| HC-SR04 ultrasonic sensor | 2 | Bin fill level |
| LEDs (Red×3, Green×1, Yellow×1) | 5 | Visual indicators |
| Resistors (220Ω×5, 1kΩ×2, 2kΩ×2) | 9 | Current limiting, voltage dividers |
| Breadboard + jumper wires | - | Prototyping |

See [`docs/WIRING_GUIDE.md`](docs/WIRING_GUIDE.md) for complete assembly instructions.

## Software Requirements

- [PlatformIO](https://platformio.org/) (CLI or VS Code extension)
- USB driver for your ESP32 board (CP2102 or CH340)

## Quick Start

### 1. Install PlatformIO

```bash
# Option A: VS Code Extension
# Install "PlatformIO IDE" from VS Code Extensions marketplace

# Option B: CLI
pip install platformio
```

### 2. Clone / Open Project

Open this directory in VS Code with PlatformIO, or navigate to it in terminal.

### 3. Build Firmware

```bash
pio run
```

### 4. Upload to ESP32

Connect ESP32 via USB, then:

```bash
pio run --target upload
```

### 5. Open Serial Monitor

```bash
pio device monitor
```

Baud rate: **115200**

### 6. Calibrate Sensors

After upload, the system will:
1. Run LED self-test (each LED blinks sequentially)
2. Wait for gas sensor warm-up (30 seconds)
3. Begin monitoring

**Send these serial commands:**
| Command | Action |
|---------|--------|
| `t` | Tare (zero) both load cells |
| `c` | Enter interactive calibration mode |
| `r` | Reset mismatch alert counters |
| `v` | Toggle CSV output mode |
| `h` | Print help |

See [`docs/CALIBRATION_GUIDE.md`](docs/CALIBRATION_GUIDE.md) for detailed calibration procedures.

## Project Structure

```
Intelligent Waste Segretion/
├── platformio.ini              # PlatformIO build configuration
├── README.md                   # This file
├── PROJECT_STATUS.md           # Current progress and blockers
├── IMPLEMENTATION_PLAN.md      # Milestones and acceptance criteria
├── Report.pdf                  # Project report (specification)
├── include/
│   ├── config.h                # Pin mapping, thresholds, all configuration
│   ├── sensor_types.h          # Data structures and enums
│   ├── sensors.h               # Sensor acquisition interface
│   ├── detection.h             # Mismatch detection interface
│   ├── leds.h                  # LED control interface
│   └── serial_output.h         # Serial diagnostics interface
├── src/
│   ├── main.cpp                # Application entry point and main loop
│   ├── sensors.cpp             # Sensor read implementations
│   ├── detection.cpp           # Mismatch detection logic
│   ├── leds.cpp                # LED state management
│   └── serial_output.cpp       # Serial output formatting
├── test/
│   ├── test_detection.cpp      # Host-side unit tests for detection logic
│   └── run_tests.ps1           # Automated test execution script
├── lib/                        # External libraries (managed by PlatformIO)
├── docs/
│   ├── PIN_MAPPING.md          # GPIO assignments and safety notes
│   ├── WIRING_GUIDE.md         # Step-by-step assembly instructions
│   ├── LED_LOGIC.md            # LED state table and behaviour
│   ├── CALIBRATION_GUIDE.md    # Sensor calibration procedures
│   ├── TEST_PLAN.md            # Test stages and test cases
│   └── TEST_RESULTS_TEMPLATE.md # Blank template for recording results
├── simulation/
│   ├── diagram.json            # Wokwi ESP32 circuit schematic
│   ├── README.md               # Simulation execution guide
│   ├── simulate_system.py      # Python batch simulation suite
│   └── dashboard/              # Interactive Digital Twin & Web Serial app
│       ├── index.html
│       ├── styles.css
│       └── app.js
└── wokwi.toml                  # Wokwi IDE configuration
```

## Detection Logic

### Biodegradable Bin
- **Metal detected** → Primary mismatch indicator (non-biodegradable item)
- **Dry material + metal + no gas** → Stronger evidence of mismatch
- **Absence of metal** does NOT prove waste is biodegradable

### Non-Biodegradable Bin
- **High moisture + elevated gas** → Possible biodegradable material
- **Metal detection is NORMAL** in this bin (not an error)
- **Wet item alone** does NOT automatically classify as biodegradable
- **Dry item alone** does NOT automatically classify as non-biodegradable

### Important Limitations
- These sensors **cannot conclusively identify every waste material**
- Evidence scores are **heuristic indicators**, not validated probabilities
- False positives and false negatives are expected
- Persistence checking (3 consecutive cycles) reduces transient false alerts

## Documentation

| Document | Contents |
|----------|----------|
| [Pin Mapping](docs/PIN_MAPPING.md) | GPIO assignments, voltage safety, power requirements |
| [Wiring Guide](docs/WIRING_GUIDE.md) | Component list, step-by-step wiring, safety checklist |
| [LED Logic](docs/LED_LOGIC.md) | LED state table, priority rules, blinking patterns |
| [Calibration Guide](docs/CALIBRATION_GUIDE.md) | Procedures for all sensors |
| [Test Plan](docs/TEST_PLAN.md) | 7 test stages, 40+ test cases |
| [Test Results](docs/TEST_RESULTS_TEMPLATE.md) | Blank template for recording outcomes |

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No serial output | Wrong baud rate or port | Set 115200, check COM port |
| All sensors DISCONNECTED | Wiring issue | Check connections per WIRING_GUIDE |
| Weight always 0 | HX711 not connected | Check DOUT/SCK wires |
| Weight very wrong | Not calibrated | Run calibration (send `c`) |
| Gas sensor reads 0 | Still warming up | Wait 30 seconds |
| Level shows -1 | Ultrasonic not connected | Check TRIG/ECHO + voltage divider |
| ESP32 won't boot | GPIO conflict at boot | Check pin mapping against safe pins |
| LEDs don't light | Missing resistor or wrong pin | Check LED wiring and polarity |

## License

This project is developed as an academic project for educational purposes.
