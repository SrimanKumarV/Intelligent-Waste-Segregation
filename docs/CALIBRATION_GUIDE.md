# Calibration Guide — Intelligent Waste Segregation Analytics (Arduino Uno)

This guide documents the procedures for calibrating the active physical prototype sensors:
1. **HX711 Load Cell**
2. **Capacitive Soil Moisture Sensor**
3. **HC-SR04 Proximity Sensor & Lid Actuator**

> **IMPORTANT:** The firmware boots with placeholder default calibration parameters. Until calibration is executed, raw values are reported and calibrated metrics are marked `null` or uncalibrated.

---

## 1. Load Cell Calibration (HX711)

### Equipment Required
- Known reference weight (e.g., 500g calibrated weight or a filled water bottle measured on a kitchen scale).
- Serial terminal or Dashboard at 115200 baud.

### Interactive Calibration Workflow
1. Open the Serial Monitor (or the Diagnostic Terminal on the dashboard) at **115200 baud**.
2. Send command `c` to enter calibration mode.
3. **Step 1 — Zero / Tare:** Remove all objects from the weighing platform. Press any key when empty. The system records the tare offset.
4. **Step 2 — Reference Mass:** Place the known reference weight (e.g. 500.0g) onto the center of the platform.
5. Enter the exact weight in grams when prompted (e.g., `500.0`).
6. The firmware computes the calibration factor:
   $$\text{Calibration Factor} = \frac{\text{Raw HX711 Counts}}{\text{Known Mass in Grams}}$$
7. The calibration factor is immediately applied in memory. Note this value and update `HX711_CALIBRATION_FACTOR_DEFAULT` in `include/config.h` if you wish to persist it across reboots.

### Manual Calibration Verification Formula
If calculating manually via serial raw output:
$$\text{Weight (grams)} = \frac{\text{Raw Counts} - \text{Tare Offset}}{\text{Scale Factor}}$$

---

## 2. Capacitive Soil Moisture Sensor Dual-Point Calibration

Capacitive soil moisture sensors do not share universal electrical characteristics; component tolerances cause significant variations in ADC response.

### 2-Point Calibration Procedure
1. Send command `m` via the Serial Monitor / Dashboard.
2. **Endpoint 1 (Dry Air / 0% Moisture):**
   - Hold the clean, dry sensor blade in open air.
   - Press any key when ready.
   - The system samples 10 readings and records `MOISTURE_RAW_AIR` (typical reading: 580–680 ADC on 10-bit Uno).
3. **Endpoint 2 (Water Submerged / 100% Moisture):**
   - Submerge the sensor blade up to the white boundary line in a cup of plain tap water.
   - *Do not immerse the electronic components or solder pins at the top!*
   - Press any key when ready.
   - The system samples 10 readings and records `MOISTURE_RAW_WATER` (typical reading: 260–340 ADC on 10-bit Uno).
4. **Percentage Calculation Formula:**
   $$\text{Moisture \%} = \frac{\text{Air Raw} - \text{Measured Raw}}{\text{Air Raw} - \text{Water Raw}} \times 100\%$$
   *(Clamped between 0.0% and 100.0%)*

---

## 3. Ultrasonic Proximity Sensor & Lid Servo Alignment

### Proximity Threshold Tuning
- In `include/config.h`, `PROXIMITY_THRESHOLD_CM` defaults to `20.0f` cm.
- Measure the normal approach distance for a user's hand or waste basket. If false triggers occur from ambient movement, decrease to `15.0f` cm.
- The firmware requires `PROXIMITY_DEBOUNCE_COUNT = 2` consecutive positive samples to trigger lid opening, eliminating single-cycle acoustic reflection noise.

### Servo Angle Alignment
- **Closed Angle (`LID_SERVO_CLOSED_ANGLE`):** 0°
- **Open Angle (`LID_SERVO_OPEN_ANGLE`):** 90° (or adjust up to 120° depending on your physical lid hinge geometry).
- **Hold Open Timer (`LID_HOLD_OPEN_MS`):** 4000ms (4 seconds). The lid stays open as long as an object remains within proximity and will close 4 seconds after the hand leaves.

---

## 4. Calibration Troubleshooting

| Symptom | Cause | Remedy |
| :--- | :--- | :--- |
| Weight reads `TIMEOUT` | HX711 DOUT/SCK disconnected | Check D2/D3 wiring and 5V power supply. |
| Weight negative after removing item | Normal temperature/tare drift | Send command `t` to re-tare the empty platform. |
| Moisture % reports > 100% or < 0% | Operating outside air/water endpoints | Re-run 2-point calibration with sensor fully dry. |
| Moisture reads 0 or 1023 always | Wire detached or pin shorted | Inspect Pin A0 connection. Valid ADC range is 50–980. |
| Servo vibrates or resets Uno | High current draw during movement | Power servo from external 5V 1A adapter with common GND. |
