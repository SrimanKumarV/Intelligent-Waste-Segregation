# Test Plan — Intelligent Solid Waste Segregation System

## Test Stages

### Stage A — Static Checks

| ID | Check | Expected | Method |
|----|-------|----------|--------|
| A1 | Project structure complete | All required files present | Manual review |
| A2 | PlatformIO config valid | Board, framework, libs defined | `pio check` |
| A3 | No conflicting GPIO assignments | All GPIOs unique per pin mapping | Review config.h vs PIN_MAPPING.md |
| A4 | No input-only GPIOs used as outputs | GPIOs 34,35,36,39 are input-only | Review config.h |
| A5 | No flash-connected GPIOs used | GPIOs 6–11 not assigned | Review config.h |
| A6 | Voltage dividers documented | HC-SR04 echo, gas sensor if needed | Review WIRING_GUIDE.md |
| A7 | LED resistors specified | 220Ω for each LED | Review WIRING_GUIDE.md |
| A8 | HX711 not on ordinary ADC pins | Uses dedicated DOUT/SCK GPIO pairs | Review config.h |

### Stage B — Firmware Build

| ID | Check | Expected | Method |
|----|-------|----------|--------|
| B1 | Firmware compiles without errors | Exit code 0 | `pio run` |
| B2 | No critical warnings | No warning related to type mismatch, overflow | Review build log |
| B3 | Flash usage within limits | < 80% of partition | Check build summary |
| B4 | RAM usage within limits | < 80% of available | Check build summary |

### Stage C — Individual Sensor Validation

| ID | Sensor | Test | Expected |
|----|--------|------|----------|
| C1 | Gas sensor | Read in clean air | Raw value < GAS_THRESHOLD_LOW |
| C2 | Gas sensor | Expose to organic waste | Raw value increases |
| C3 | Gas sensor | Disconnect wire | Status = DISCONNECTED |
| C4 | Moisture Bio | Read in dry air | Level = DRY |
| C5 | Moisture Bio | Insert in water | Level = WET |
| C6 | Moisture NonBio | Read in dry air | Level = DRY |
| C7 | Moisture NonBio | Insert in water | Level = WET |
| C8 | Metal Bio | No metal near sensor | metalDetected = false |
| C9 | Metal Bio | Place iron at 1cm | metalDetected = true |
| C10 | Metal NonBio | No metal near sensor | metalDetected = false |
| C11 | Metal NonBio | Place iron at 1cm | metalDetected = true |
| C12 | HX711 Bio | No weight on cell | ~0g after tare |
| C13 | HX711 Bio | Known 500g weight | Reads 495–505g (after calibration) |
| C14 | HX711 NonBio | No weight on cell | ~0g after tare |
| C15 | HX711 NonBio | Known 500g weight | Reads 495–505g |
| C16 | Level Bio | Empty bin | Fill ≈ 0%, distance ≈ bin depth |
| C17 | Level Bio | Object at mid-bin | Fill ≈ 50% |
| C18 | Level NonBio | Empty bin | Fill ≈ 0% |
| C19 | Level NonBio | Object at mid-bin | Fill ≈ 50% |
| C20 | Any sensor | Disconnect | Status ≠ SENSOR_OK, not silent zero |

### Stage D — Load Cell Calibration Verification

| ID | Test | Expected |
|----|------|----------|
| D1 | Tare with empty bin | Weight reads 0g (±5g) |
| D2 | Calibrate with known weight | Factor computed, verified reading |
| D3 | Remove weight after calibration | Returns to ~0g |
| D4 | Test with different known weights | Error < 5% |
| D5 | Repeated readings (10×) | Standard deviation < 10g |

### Stage E — Detection Logic Validation

| ID | Scenario | Expected State |
|----|----------|---------------|
| E1 | All normal readings | STATE_NORMAL, no alerts |
| E2 | Metal in bio bin (single reading) | Score ≥ threshold, NO alert (persistence not met) |
| E3 | Metal in bio bin (sustained) | STATE_POSSIBLE_MISMATCH, alert active |
| E4 | Wet + gas in non-bio bin | STATE_POSSIBLE_MISMATCH |
| E5 | Metal in non-bio bin | STATE_NORMAL (metal is normal here) |
| E6 | Wet item in non-bio, no gas | Score < threshold (wet ≠ biodegradable) |
| E7 | Bin at 80% full | STATE_BIN_NEAR_CAPACITY |
| E8 | Bin at 95% full | STATE_BIN_FULL |
| E9 | Mismatch + bin full simultaneously | Both flags set |
| E10 | Sensor disconnected | STATE_SENSOR_FAULT |
| E11 | Load cell uncalibrated | STATE_CALIBRATION_NEEDED |
| E12 | Remove mismatch condition | Alert clears after persistence decay |

### Stage F — Integrated Hardware Test

| ID | Test | Expected |
|----|------|----------|
| F1 | Both bins empty, all sensors connected | Normal state, green LED on |
| F2 | Drop metal in bio bin | Red LED (bio mismatch) after persistence |
| F3 | Drop wet organic waste in non-bio bin | Red LED (non-bio mismatch) possible |
| F4 | Fill bio bin to 80% | Yellow LED on (steady) |
| F5 | Fill bio bin to 95% | Yellow LED blinking |
| F6 | Disconnect a sensor | Fault LED blinks, green LED off |
| F7 | Send 't' via serial | Load cells tare |
| F8 | Send 'c' via serial | Calibration mode starts |
| F9 | Send 'v' via serial | Output toggles to CSV format |
| F10 | Run for 30 minutes | No crashes, memory stable |

### Stage G — Repeatability

| ID | Test | Method |
|----|------|--------|
| G1 | Metal detection consistency | Insert/remove metal 10 times |
| G2 | Weight measurement repeatability | Measure same weight 10 times |
| G3 | Level sensor consistency | Read same bin level 10 times |
| G4 | False positive rate | Run 100 normal cycles, count false alerts |
| G5 | Recovery time | Remove mismatch, count cycles to clear |

## Pass Criteria

- Stage A: All checks pass
- Stage B: Firmware compiles with no errors, warnings reviewed
- Stage C: All connected sensors respond correctly
- Stage D: Weight error < 5% with calibrated load cell
- Stage E: All detection rules produce expected states
- Stage F: LEDs, serial output, and commands work as specified
- Stage G: False positive rate < 5% over 100 cycles

## Notes

- **Do NOT fabricate test results.** Record actual observations.
- **Disconnected sensors** should report as such, not as zero values.
- **Detection accuracy** depends on calibration quality and environmental conditions.
- These sensors **cannot conclusively identify every waste material.**
