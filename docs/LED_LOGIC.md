# LED Logic — Intelligent Solid Waste Segregation System

## LED Hardware Configuration

| LED # | Colour | GPIO | Resistor | Function |
|-------|--------|------|----------|----------|
| 1 | Green | GPIO 2 | 220Ω | System OK / heartbeat |
| 2 | Red | GPIO 13 | 220Ω | Biodegradable bin mismatch warning |
| 3 | Red | GPIO 15 | 220Ω | Non-biodegradable bin mismatch warning |
| 4 | Yellow/Amber | GPIO 33 | 220Ω | Bin full / near capacity |
| 5 | Red | GPIO 32 | 220Ω | Sensor fault / calibration needed |

## State Table

| System Condition | LED 1 (Green) | LED 2 (Red) | LED 3 (Red) | LED 4 (Yellow) | LED 5 (Red) |
|---|---|---|---|---|---|
| **Normal operation** | ON | OFF | OFF | OFF | OFF |
| **Gas sensor warming up** | ON | OFF | OFF | OFF | OFF |
| **Bio bin: possible mismatch** | ON | **ON** | OFF | OFF | OFF |
| **NonBio bin: possible mismatch** | ON | OFF | **ON** | OFF | OFF |
| **Both bins: mismatch** | ON | **ON** | **ON** | OFF | OFF |
| **Any bin: near capacity** | ON | — | — | **ON (steady)** | OFF |
| **Any bin: FULL** | ON | — | — | **BLINK** | OFF |
| **Sensor fault** | **OFF** | — | — | — | **BLINK** |
| **Calibration needed** | ON | — | — | — | **BLINK** |
| **Mismatch + Full bin** | ON | **ON** | — | **BLINK** | OFF |
| **Mismatch + Sensor fault** | **OFF** | **ON** | — | — | **BLINK** |

> **Note:** "—" means the LED follows its own condition independently. Multiple conditions can be active simultaneously because each condition maps to a separate LED.

## Behaviour Details

### LED 1 — System OK (Green, GPIO 2)
- **ON:** System is running normally, no sensor faults detected
- **OFF:** One or more sensor faults detected (draws attention to fault LED)

### LED 2 — Bio Mismatch (Red, GPIO 13)
- **ON:** Possible non-biodegradable item detected in the biodegradable bin
- **OFF:** No mismatch evidence in biodegradable bin
- Requires `MISMATCH_PERSISTENCE_COUNT` (default: 3) consecutive detections before activating
- This prevents false alerts from momentary sensor noise

### LED 3 — NonBio Mismatch (Red, GPIO 15)
- **ON:** Possible biodegradable material detected in the non-biodegradable bin
- **OFF:** No mismatch evidence in non-biodegradable bin
- Same persistence requirement as LED 2

### LED 4 — Bin Full (Yellow, GPIO 33)
- **Steady ON:** At least one bin is ≥75% full (nearing capacity)
- **Blinking:** At least one bin is ≥90% full (requires emptying)
- **OFF:** Both bins are below 75% capacity
- Blink interval: 500ms (configurable via `LED_BLINK_INTERVAL_MS`)

### LED 5 — Sensor Fault (Red, GPIO 32)
- **Blinking:** At least one sensor is disconnected, timed out, or a load cell needs calibration
- **OFF:** All sensors responding normally
- Blink interval: 500ms

## Priority Rules

1. Each LED operates independently — one condition does NOT erase another
2. The System OK LED (LED 1) turns OFF only when there is a sensor fault
3. Mismatch LEDs (2, 3) are independent of fill level LEDs (4)
4. The fault LED (5) blinks for both sensor faults AND calibration issues

## Startup Self-Test

On power-up, all LEDs are tested sequentially:
1. Each LED turns ON for 300ms, then OFF
2. After individual testing, all LEDs turn ON together for 500ms
3. All LEDs turn OFF before normal operation begins

This allows visual verification that all LEDs are functional and correctly wired.

## Customisation

All LED behaviour can be modified in [`config.h`](file:///d:/Intelligent Waste Segretion/include/config.h):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `LED_BLINK_INTERVAL_MS` | 500 | Blink speed for fault/full indicators |
| `MISMATCH_PERSISTENCE_COUNT` | 3 | Cycles before mismatch LED activates |
| `BIN_LEVEL_NEAR_FULL_PCT` | 75% | Threshold for steady bin-full LED |
| `BIN_LEVEL_FULL_PCT` | 90% | Threshold for blinking bin-full LED |
