# Telemetry Protocol Specification — Version 1.0
**Project:** Intelligent Solid Waste Segregation Analytics  
**Hardware Target:** Arduino Uno (ATmega328P)  
**Transport:** UART Serial (USB) at 115200 baud / HTTP Ingestion  
**Encoding:** UTF-8 JSON Lines (Newline-delimited JSON)  

---

## 1. Design Principles

1. **Deterministic & Memory-Safe:** Formatted on the Arduino Uno without dynamic heap allocations or string concatenation, eliminating SRAM fragmentation risks on 2KB devices.
2. **Strict Physical Authenticity:** Explicit `null` is used for uncalibrated, disconnected, or missing measurements. A valid measurement of `0` is mathematically and semantically distinct from missing data.
3. **Structured Event Separation:** Raw sensor measurements, calibrated conversions, actuator commands, and verified physical states are strictly separated.
4. **Sequence Tracking:** Monotonically increasing sequence numbers allow the gateway and backend to detect dropped serial packets or communication glitches.

---

## 2. Telemetry Schema Definition

Each telemetry record is a single line terminating with `\r\n` or `\n`.

### Example: Calibrated Healthy Sensor Packet
```json
{
  "v": 1,
  "dev": "UNO-WS01",
  "seq": 452,
  "up": 452,
  "moist_raw": 340,
  "moist_pct": 84.8,
  "moist_ok": true,
  "moist_cal": true,
  "weight_g": 240.5,
  "weight_raw": 101010,
  "weight_ok": true,
  "weight_cal": true,
  "dist_cm": 14.2,
  "prox": true,
  "lid_cmd": "OPEN",
  "faults": []
}
```

### Example: Uncalibrated / Warning State Packet
```json
{
  "v": 1,
  "dev": "UNO-WS01",
  "seq": 4,
  "up": 4,
  "moist_raw": 618,
  "moist_pct": null,
  "moist_ok": true,
  "moist_cal": false,
  "weight_g": null,
  "weight_raw": 0,
  "weight_ok": false,
  "weight_cal": false,
  "dist_cm": 42.0,
  "prox": false,
  "lid_cmd": "CLOSED",
  "faults": ["CALIBRATION_REQUIRED"]
}
```

---

## 3. Field Specifications

| Field | Type | Description | Valid Range / Format | Nullable? |
| :--- | :--- | :--- | :--- | :--- |
| `v` | Integer | Protocol specification version | `1` | No |
| `dev` | String | Configured device identifier | `^[A-Z0-9_-]{3,16}$` (e.g. `"UNO-WS01"`) | No |
| `seq` | Integer | Rolling sequence number | `1` to `4294967295` | No |
| `up` | Integer | Device uptime in seconds | `0` to `4294967295` | No |
| `moist_raw` | Integer | Raw 10-bit ADC reading | `0` to `1023` | No |
| `moist_pct` | Float | Calibrated moisture percentage | `0.0` to `100.0` | **Yes** (null if uncalibrated/error) |
| `moist_ok` | Boolean | Moisture sensor hardware health | `true` if reading within 50–980 | No |
| `moist_cal` | Boolean | Dual-point calibration status | `true` if 2-point calibration valid | No |
| `weight_g` | Float | Calibrated mass in grams | `0.0` to `10000.0` | **Yes** (null if uncalibrated/error) |
| `weight_raw` | Long | Raw 24-bit counts from HX711 | Signed 32-bit integer | No |
| `weight_ok` | Boolean | HX711 communication health | `true` if HX711 responds within 500ms | No |
| `weight_cal` | Boolean | Weight calibration status | `true` if reference mass calibrated | No |
| `dist_cm` | Float | Distance to approaching object | `2.0` to `200.0` | **Yes** (null if echo timeout) |
| `prox` | Boolean | Proximity trigger status | `true` if `dist_cm <= PROXIMITY_THRESHOLD_CM` | No |
| `lid_cmd` | String | Commanded lid actuator state | `"CLOSED"`, `"OPENING"`, `"OPEN"`, `"CLOSING"` | No |
| `faults` | Array | List of active fault strings | `[]` or string codes listed below | No |

---

## 4. Fault Codes

- `"MOISTURE_OFFLINE"`: Sensor ADC < 50 (short) or > 980 (open circuit).
- `"HX711_TIMEOUT"`: HX711 DOUT pin failed to go LOW within timeout.
- `"ULTRASONIC_TIMEOUT"`: No echo pulse returned within 15ms window.
- `"CALIBRATION_REQUIRED"`: Sensor operational but factory or user calibration not established.

---

## 5. Serial Commands (Host to Arduino)

Commands are sent as single ASCII characters terminated by optional `\r` or `\n`:

| Character | Command Action | Expected Response |
| :--- | :--- | :--- |
| `t` | Tare HX711 load cell | `[CMD] Tare complete.` |
| `c` | Interactive load cell calibration | Guided prompt for reference weight in grams |
| `m` | Interactive moisture 2-point calibration | Guided prompt for dry air and water readings |
| `o` | Force lid actuator to OPEN position | Commanded state updates to `OPEN` |
| `x` | Force lid actuator to CLOSED position | Commanded state updates to `CLOSED` |
| `h` | Print serial help menu | Plaintext command list |

---

## 6. Backend Ingestion Specification

The backend accepts telemetry via HTTP:
- **Endpoint:** `POST /api/telemetry`
- **Headers:** `Content-Type: application/json`
- **Body:** JSON telemetry packet matching schema above.
- **Backend Enriched Fields:** The server attaches `received_at` (ISO 8601 UTC timestamp) and appends to `data/telemetry.jsonl`.
