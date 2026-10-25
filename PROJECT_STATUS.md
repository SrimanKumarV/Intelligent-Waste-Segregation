# Project Status — Intelligent Solid Waste Segregation System

**Last Updated:** 2026-10-25  
**Firmware Version:** 1.0.0

---

## Project Overview

An ESP32-based sensor system that monitors two waste bins (biodegradable and non-biodegradable) using gas, moisture, metal, weight, and fill-level sensors. The system detects possible waste segregation errors and provides visual LED warnings and serial diagnostic output.

---

## Completed Tasks ✅

### Firmware
- [x] PlatformIO project configuration
- [x] Hardware pin mapping and configuration (`config.h`)
- [x] Data type definitions (`sensor_types.h`)
- [x] Sensor acquisition module — reads all 9 sensors (`sensors.cpp`)
- [x] Waste mismatch detection module — rule-based analysis (`detection.cpp`)
- [x] LED indication system — state table with blinking (`leds.cpp`)
- [x] Serial output module — human-readable + CSV formats (`serial_output.cpp`)
- [x] Main application — monitoring loop with serial commands (`main.cpp`)
- [x] Interactive load cell calibration via serial
- [x] Gas sensor warm-up enforcement
- [x] Error handling for disconnected/timed-out sensors

### Testing & Simulation
- [x] 13 host-side unit tests for detection logic (`test/test_detection.cpp`)
- [x] Tests cover: normal operation, mismatch scenarios, persistence, simultaneous conditions
- [x] Automated host test runner script (`test/run_tests.ps1`)
- [x] Wokwi ESP32 circuit schematic with sensors, potentiometers, and LEDs (`simulation/diagram.json`)
- [x] Wokwi integration configuration (`wokwi.toml`)
- [x] Python simulation test suite (`simulation/simulate_system.py`)
- [x] Standalone interactive browser Digital Twin & Web Serial dashboard (`simulation/dashboard/`)

### Documentation
- [x] Pin mapping with GPIO safety analysis
- [x] Step-by-step wiring guide with diagrams
- [x] LED state table and logic documentation
- [x] Sensor calibration guide
- [x] Test plan (7 stages, 40+ test cases)
- [x] Test results template
- [x] Implementation plan with milestones
- [x] README with build/upload/usage instructions

---

## Pending Tasks ⏳

### Must Do (Before First Hardware Test)
- [ ] **Install PlatformIO** CLI or VS Code extension
- [ ] **Compile firmware** with `pio run` and fix any build issues
- [ ] **Assemble hardware** following WIRING_GUIDE.md
- [ ] **Verify wiring** with pre-power checklist
- [ ] **Upload firmware** to ESP32
- [ ] **Calibrate load cells** using interactive serial mode
- [ ] **Establish gas sensor baseline** in clean air
- [ ] **Verify moisture sensor polarity** with wet/dry tests
- [ ] **Verify metal sensor polarity** with metallic objects

### Should Do (After Basic Verification)
- [ ] Run complete test plan (Stages A–G)
- [ ] Record test results in template
- [ ] Tune detection thresholds based on actual sensor behaviour
- [ ] Long-running stability test (30+ minutes)

### Nice to Have (Future Enhancements)
- [x] Standalone Web Dashboard & Digital Twin (Completed: `simulation/dashboard/index.html`)
- [ ] ESP32 on-chip WebServer / WiFi AP mode for direct wireless telemetry
- [ ] MQTT data publishing to cloud (ThingsBoard / Adafruit IO)
- [ ] Data logging to microSD card SPI module
- [ ] Low-power sleep / battery management
- [ ] 3D printable physical bin lid & sensor enclosure design

---

## Assumptions

| Assumption | Impact if Wrong | Mitigation |
|-----------|----------------|------------|
| ESP32 DevKit V1 (30-pin) | Pin mapping may differ | Review config.h for your board variant |
| MQ-series gas sensor with analog output | Interface code may need changes | config.h has configurable thresholds |
| Capacitive moisture sensors | Polarity setting in config.h | Toggle MOISTURE_POLARITY_INVERTED |
| NPN inductive proximity metal sensors | Active-low logic | Toggle METAL_ACTIVE_LOW in config.h |
| HC-SR04 ultrasonic sensors (5V) | Voltage divider needed | Documented in wiring guide |
| Bar-type load cells with HX711 | Calibration factor varies | Interactive calibration procedure |
| Bin depth ~40cm | Fill % calculation | Configurable BIN_DEPTH_CM |

---

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Firmware not yet compiled (no PlatformIO on this machine) | Medium | Pending user action |
| Report.pdf could not be read programmatically (encrypted/compressed) | Low | Working from detailed specifications |
| Calibration factors are placeholders | High | Must calibrate before trusting weight readings |
| Gas sensor baseline unknown | Medium | Must establish after 24h burn-in |

---

## Next Steps

1. **Install PlatformIO** on your development machine
2. **Compile the firmware** — run `pio run` in the project directory
3. **Fix any build errors** (if any)
4. **Assemble the circuit** following `docs/WIRING_GUIDE.md`
5. **Upload firmware** — run `pio run --target upload`
6. **Open serial monitor** — `pio device monitor`
7. **Calibrate sensors** following `docs/CALIBRATION_GUIDE.md`
8. **Run tests** following `docs/TEST_PLAN.md`
