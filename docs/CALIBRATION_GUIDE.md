# Sensor Calibration Guide — Four Independent Channels (ESP32)

This guide documents the independent calibration workflows for the four physical sensor channels on **Module B (ESP32 Multi-Sensor Hub)**.

All calibration parameters are persisted directly into the ESP32 Non-Volatile Storage (Preferences / NVS) so they survive device reboots without manual re-entry.

---

## 1. Overview of the 4 Channels

| Channel | Sensor Type | Connected Compartment | Pin | Default Reference | Valid Range |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C1** | Capacitive Soil Moisture | Compartment A (Biodegradable) | GPIO 34 | Air: 3200 ADC, Water: 1400 ADC | 200 – 3950 ADC |
| **C2** | Capacitive Soil Moisture | Compartment B (Non-Biodegradable)| GPIO 35 | Air: 3200 ADC, Water: 1400 ADC | 200 – 3950 ADC |
| **LC1** | HX711 Strain Gauge Load Cell | Compartment A (Biodegradable Mass) | DOUT 16, SCK 4 | Factor: 420.0 counts/g | 2.0g – 10,000g |
| **LC2** | HX711 Strain Gauge Load Cell | Compartment B (Non-Biodegradable Mass) | DOUT 17, SCK 18| Factor: 420.0 counts/g | 2.0g – 10,000g |

> [!IMPORTANT]
> **Channel Independence:** Never copy calibration parameters from C1 to C2 or from LC1 to LC2. Each sensor has unique physical strain tolerances, trace capacitances, and manufacturing variances.

---

## 2. Calibration Workflows via Technical Operations Dashboard

The easiest way to calibrate all four channels is through **Page 2: Technical Operations** on the dashboard (`http://localhost:8080/` -> **Technical Operations** -> **Panel D**).

### A. Load Cell 1 (LC1) Calibration Procedure
1. **Tare Empty Scale:**
   - Ensure the Compartment A waste bin platform is completely empty and clean.
   - Click the **"Tare LC1"** button.
   - The ESP32 captures 10 readings, sets the zero tare offset, and saves it to NVS.
   - The status line will confirm: `Status: tare (lc1) COMPLETED`.
2. **Span Calibration with Reference Mass:**
   - Place a known certified mass on Compartment A (e.g., 500.0g test weight).
   - Enter `500` in the **Ref g** input field.
   - Click **"Calibrate LC1"**.
   - The ESP32 computes:  
     $$\text{Calibration Factor} = \frac{\text{Raw Counts} - \text{Tare Offset}}{\text{Known Mass (g)}}$$
   - The factor is saved to NVS and `isLc1Calibrated` is set to `true`.

### B. Load Cell 2 (LC2) Calibration Procedure
- Follow the identical 2-step workflow using the **"Tare LC2"** and **"Calibrate LC2"** controls for Compartment B.
- Do NOT copy the LC1 factor to LC2.

### C. Moisture Sensor C1 Calibration Procedure
1. **Dry Air Reference (0% Point):**
   - Clean and completely dry the C1 capacitive probe blade with a clean microfiber cloth.
   - Hold the probe suspended in ambient room air.
   - Click **"Set Dry Air Ref (0%)"** under C1.
   - The ESP32 records the baseline voltage (typically ~3000–3400 ADC counts).
2. **Wet Water Reference (100% Point):**
   - Submerge the lower white capacitive trace blade into a cup of tap water (do not submerge the onboard electronics or top header).
   - Click **"Set Wet Water Ref (100%)"** under C1.
   - The ESP32 records the saturated water voltage (typically ~1300–1600 ADC counts).
   - If $\text{Air Raw} > \text{Water Raw}$, calibration is stored in NVS and marked valid.

### D. Moisture Sensor C2 Calibration Procedure
- Follow the identical dry and wet sequence using the **"Set Dry Air Ref (0%)"** and **"Set Wet Water Ref (100%)"** buttons under C2.

---

## 3. Serial JSON Command Protocol (Direct CLI Calibration)

When interacting directly with the ESP32 over USB Serial at 115200 baud, send structured JSON command frames:

```json
// Tare Load Cell 1
{"cmd":"tare","channel":"lc1"}

// Calibrate Load Cell 1 with 500g known mass
{"cmd":"cal_weight","channel":"lc1","ref_g":500.0}

// Tare Load Cell 2
{"cmd":"tare","channel":"lc2"}

// Calibrate Load Cell 2 with 500g known mass
{"cmd":"cal_weight","channel":"lc2","ref_g":500.0}

// Record Dry Reference for C1
{"cmd":"cal_moist_dry","channel":"c1"}

// Record Wet Reference for C1
{"cmd":"cal_moist_wet","channel":"c1"}

// Record Dry Reference for C2
{"cmd":"cal_moist_dry","channel":"c2"}

// Record Wet Reference for C2
{"cmd":"cal_moist_wet","channel":"c2"}

// Query Diagnostics and Stored Calibration Status
{"cmd":"status"}
```

### Expected Acknowledgments (ACK):
```json
{"ack":"tare","channel":"lc1","status":"COMPLETED"}
{"ack":"cal_weight","channel":"lc1","factor":422.35,"status":"COMPLETED"}
{"ack":"cal_moist_dry","channel":"c1","raw":3210,"status":"COMPLETED"}
{"ack":"cal_moist_wet","channel":"c1","raw":1420,"status":"COMPLETED"}
```

---

## 4. Uncalibrated vs Calibrated Display Rules

1. **Explicit Nulls:** If a sensor is uncalibrated, disconnected, or timed out, the firmware and backend emit explicit `null` values for calibrated percentage and mass.
2. **Never Fabricate Zeroes:** The dashboard will display `—` (dash) and `UNCALIBRATED` rather than showing `0%` or `0.0g`.
3. **Weight Totals:** Uncalibrated load cells are excluded from total measured mass calculations, and the dashboard clearly displays `kg (Partial)` or `Weight data unavailable`.
