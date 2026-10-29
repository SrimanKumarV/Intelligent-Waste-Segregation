# Telemetry Protocol Specification (v2.2)

> **Format:** Versioned UTF-8 JSON Lines (`application/x-ndjson`)  
> **Physical Transport:** UART USB Serial @ 115200 baud, 8-N-1  
> **REST Integration:** Native HTTP REST API (`http://localhost:8080/api/telemetry`)  

---

## 1. Module A: Arduino Uno Telemetry Stream

*Emission Rate:* 1.0 Hz periodic, plus immediate dispatch on lid state transition.  
*Device ID:* `UNO-WS01`

```json
{
  "v": 1,
  "dev": "UNO-WS01",
  "seq": 142,
  "up": 142,
  "dist_cm": 15.2,
  "prox": true,
  "lid_cmd": "OPEN",
  "faults": []
}
```

### Fields:
- `v` *(integer)*: Protocol version (1).
- `dev` *(string)*: Device identifier (`UNO-WS01`).
- `seq` *(integer)*: Monotonically increasing sequence number since boot.
- `up` *(integer)*: Device uptime in seconds.
- `dist_cm` *(float | null)*: Measured distance from HC-SR04 ultrasonic sensor (5.0 to 400.0 cm). If timed out or out of range, emitted as explicit `null`.
- `prox` *(boolean)*: Proximity detection flag (`true` when `dist_cm` $\le 20.0\text{ cm}$).
- `lid_cmd` *(string)*: Commanded servo state (`CLOSED`, `OPEN`, `HOLD_OPEN`, `COOLDOWN`).
- `faults` *(array of string)*: Active fault flags (`ULTRASONIC_TIMEOUT`).

---

## 2. Module B: ESP32 Sensor Hub Telemetry Stream

*Emission Rate:* 1.0 Hz periodic.  
*Device ID:* `ESP32-WS01`

```json
{
  "v": 1,
  "dev": "ESP32-WS01",
  "seq": 88,
  "up": 88,
  "c1_raw": 2150,
  "c1_pct": 58.3,
  "c1_ok": true,
  "c1_cal": true,
  "c2_raw": 3120,
  "c2_pct": 14.2,
  "c2_ok": true,
  "c2_cal": true,
  "lc1_g": 380.5,
  "lc1_raw": 259810,
  "lc1_ok": true,
  "lc1_cal": true,
  "lc2_g": 210.0,
  "lc2_raw": 188200,
  "lc2_ok": true,
  "lc2_cal": true,
  "lid_sync_state": "OPEN",
  "lid_sync_fresh": true,
  "lcd_detected": true,
  "faults": []
}
```

### Channel Fields:
- **C1 (Capacitive Moisture 1 — Compartment A: Biodegradable):**
  - `c1_raw` *(integer)*: Raw 12-bit ADC reading (0–4095).
  - `c1_pct` *(float | null)*: Calibrated moisture percentage (0.0%–100.0%). `null` if uncalibrated.
  - `c1_ok` *(boolean)*: Channel hardware health flag.
  - `c1_cal` *(boolean)*: True if 2-point calibration is stored and valid.
- **C2 (Capacitive Moisture 2 — Compartment B: Non-Biodegradable):**
  - Independent `c2_raw`, `c2_pct`, `c2_ok`, `c2_cal`.
- **LC1 (Load Cell 1 — Compartment A Mass):**
  - `lc1_g` *(float | null)*: Net calibrated mass in grams. `null` if uncalibrated or timed out.
  - `lc1_raw` *(integer)*: Raw HX711 24-bit strain gauge counts.
  - `lc1_ok` *(boolean)*: True if HX711 is responding within 300ms timeout.
  - `lc1_cal` *(boolean)*: True if calibration factor is loaded from NVS.
- **LC2 (Load Cell 2 — Compartment B Mass):**
  - Independent `lc2_g`, `lc2_raw`, `lc2_ok`, `lc2_cal`.
- **Cross-Device Coordination:**
  - `lid_sync_state` *(string)*: Latest synchronized lid position from Uno.
  - `lid_sync_fresh` *(boolean)*: False if updates have not arrived in >5000ms.
  - `lcd_detected` *(boolean)*: True if physical I2C LCD acknowledged on bus.

---

## 3. Host Combined Telemetry Representation

Available at `GET /api/telemetry/combined`:

```json
{
  "uno": { ... },
  "esp32": { ... },
  "channels": {
    "c1": { "raw": 2150, "pct": 58.3, "ok": true, "calibrated": true, "bin": "A" },
    "c2": { "raw": 3120, "pct": 14.2, "ok": true, "calibrated": true, "bin": "B" },
    "lc1": { "raw": 259810, "grams": 380.5, "ok": true, "calibrated": true, "bin": "A" },
    "lc2": { "raw": 188200, "grams": 210.0, "ok": true, "calibrated": true, "bin": "B" }
  },
  "compartments": {
    "A": { "category": "BIODEGRADABLE", "moisture_pct": 58.3, "weight_g": 380.5, "status": "ACTIVE" },
    "B": { "category": "NON_BIODEGRADABLE", "moisture_pct": 14.2, "weight_g": 210.0, "status": "ACTIVE" },
    "C": { "category": null, "moisture_pct": null, "weight_g": null, "status": "NOT_CONFIGURED" }
  },
  "total_measured_weight_g": 590.5,
  "total_weight_status": "FULL_SUM",
  "lid_state": "OPEN",
  "device_health": {
    "overall_status": "ALL_ONLINE",
    "uno": { "status": "CONNECTED", "connected": true, "seconds_since_last_packet": 0.4 },
    "esp32": { "status": "CONNECTED", "connected": true, "seconds_since_last_packet": 0.2 }
  }
}
```

---

## 4. Cross-Device Lid Synchronization Protocol

When Module A triggers a lid transition, the Serial Gateway sends an unambiguous, versioned JSON command frame directly to Module B:

```json
{"cmd":"sync_lid","state":"OPEN","seq":142,"ts":1793262000000}
```

If the gateway connection drops or updates halt for $>5000\text{ ms}$, Module B automatically displays:
```
LINE 1: LID: STALE / UNK
LINE 2: ESP32 RUNNING
```
*Never fabricate lid state on ESP32 when updates stop.*
