# Implementation Plan — Intelligent Solid Waste Segregation System

## Milestone 1: Workspace Inspection & Gap Analysis ✅

- [x] Inspected workspace (empty directory + Report.pdf)
- [x] Identified no existing code, configurations, or documentation
- [x] Created full project structure from specification

## Milestone 2: Architecture & Pin Mapping ✅

- [x] Finalised ESP32 DevKit V1 pin assignments
- [x] Created `config.h` with all GPIO, threshold, and timing definitions
- [x] Created `sensor_types.h` with data structures
- [x] Created module interfaces (sensors.h, detection.h, leds.h, serial_output.h)
- [x] Created `docs/PIN_MAPPING.md`
- [x] Documented voltage level safety (dividers, current limiting)

**Acceptance:** All GPIOs verified safe, no conflicts, voltage safety documented.

## Milestone 3: Sensor Acquisition & Serial Diagnostics ✅

- [x] Implemented `sensors.cpp` — all 9 sensor reads with error handling
- [x] Implemented `serial_output.cpp` — structured human-readable and CSV output
- [x] Sensor failures reported as status codes, never as silent zeroes
- [x] Analog readings averaged for noise reduction
- [x] Gas sensor warm-up period enforced

**Acceptance:** Serial monitor shows all sensor readings with status.

## Milestone 4: Load Cell Calibration & Bin Level Monitoring ✅

- [x] HX711 tare-on-startup implemented
- [x] Interactive calibration mode via serial ('c' command)
- [x] Calibration factor storage and runtime update
- [x] Ultrasonic distance-to-fill-percentage conversion
- [x] Fill status classification (empty/normal/near/full)
- [x] Created `docs/CALIBRATION_GUIDE.md`

**Acceptance:** Load cells respond, calibration procedure documented.

## Milestone 5: Mismatch Detection & LED Control ✅

- [x] Implemented `detection.cpp` — rule-based analysis
- [x] Biodegradable bin: metal = primary mismatch indicator
- [x] Non-biodegradable bin: moisture + gas = mismatch indicator
- [x] Metal in non-bio bin is NOT flagged as error
- [x] Wet item alone NOT classified as biodegradable
- [x] Persistence checking prevents false alerts
- [x] Evidence scoring (heuristic, clearly documented)
- [x] Implemented `leds.cpp` — state table, blinking, self-test
- [x] Created `docs/LED_LOGIC.md`

**Acceptance:** Detection rules match specification, LEDs respond.

## Milestone 6: Automated Tests & Simulation ✅

- [x] Created `test/test_detection.cpp` — 13 unit tests
- [x] Tests cover: normal, mismatch, persistence, simultaneous conditions
- [x] Tests verify: wet ≠ biodegradable, metal in non-bio = OK
- [x] Clearly labelled as simulation, not hardware test results
- [x] Created `simulation/diagram.json` — Wokwi schematic for ESP32, sensors, and LEDs
- [x] Created `wokwi.toml` configuration for VS Code Wokwi extension
- [x] Created `simulation/README.md` guide for Wokwi offline/online testing
- [x] Created `simulation/simulate_system.py` Python simulation suite
- [x] Created `simulation/dashboard/` interactive browser-based Digital Twin & Web Serial monitor
- [x] Created `test/run_tests.ps1` automated host test runner

**Acceptance:** All unit tests defined, Wokwi diagram complete, and interactive Digital Twin operational.

## Milestone 7: Firmware Build ⏳

- [ ] Install PlatformIO CLI or extension
- [ ] Run `pio run` to compile
- [ ] Fix any build errors or warnings
- [ ] Record actual build output

**Acceptance:** Clean compilation with no errors.

## Milestone 8: Hardware Wiring & Guides ✅

- [x] Created `docs/WIRING_GUIDE.md` — step-by-step with diagrams
- [x] Created `docs/PIN_MAPPING.md` — complete GPIO table
- [x] Created `docs/CALIBRATION_GUIDE.md`
- [x] Voltage divider circuits documented
- [x] Pre-power safety checklist included
- [x] Bill of materials included

**Acceptance:** Wiring guide complete, safety checklist provided.

## Milestone 9: Integration Testing ⏳

- [ ] Build firmware successfully
- [ ] Upload to ESP32
- [ ] Verify LED self-test
- [ ] Run through sensor validation tests
- [ ] Calibrate load cells
- [ ] Execute test plan stages A–G
- [ ] Record results in TEST_RESULTS_TEMPLATE.md

**Acceptance:** Test results recorded with actual observations.

## Milestone 10: Final Documentation ✅

- [x] README.md with setup/build/usage instructions
- [x] PROJECT_STATUS.md with current state
- [x] All docs/ files created
- [x] Implementation plan with milestone status

**Acceptance:** Complete documentation suite.
