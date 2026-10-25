# Calibration Guide — Intelligent Solid Waste Segregation System

## Overview

This guide covers the calibration procedures for all sensors. Accurate readings require calibration with your specific hardware. **The firmware ships with PLACEHOLDER defaults** that are not suitable for accurate measurements.

---

## 1. Load Cell Calibration (HX711)

### What You Need
- A known reference weight (e.g., 500g kitchen weight, water bottle with known volume)
- Serial monitor open at 115200 baud

### Interactive Calibration (Recommended)

1. **Connect** to the ESP32 via serial monitor
2. **Send** the character `c` (or `C`) to enter calibration mode
3. **Select** which load cell to calibrate (1 = Bio, 2 = NonBio)
4. **Remove** all items from the bin and press any key to tare
5. **Place** the known weight on the load cell
6. **Enter** the weight in grams (e.g., `500`)
7. The firmware calculates and applies the calibration factor
8. **Verify** the reading matches the reference weight

### Manual Calibration

If you prefer to calculate the factor manually:

1. **Tare:** Send `t` to zero both load cells (bins must be empty)
2. **Record raw:** Note the `rawValue` shown in serial output with no weight
3. **Place known weight:** Note the new `rawValue`
4. **Calculate:**
   ```
   calibration_factor = (raw_with_weight - raw_empty) / known_weight_grams
   ```
5. **Update** `config.h`:
   ```cpp
   #define HX711_BIO_CALIBRATION_FACTOR      <your_value>
   #define HX711_NONBIO_CALIBRATION_FACTOR   <your_value>
   ```
6. **Rebuild** and re-upload firmware

### Calibration Tips
- Use the largest reference weight available (reduces percentage error)
- Ensure the load cell is on a flat, stable surface
- Wait 2–3 seconds after placing the weight before reading
- Calibrate at the ambient temperature where the system will operate
- The calibration factor may need adjustment if the temperature changes significantly

### Troubleshooting
| Issue | Likely Cause |
|-------|-------------|
| Weight reads 0 always | HX711 not connected, wrong pins |
| Weight fluctuates wildly | Load cell not mounted stably, electrical noise |
| Weight reads very wrong | Wrong calibration factor, needs re-calibration |
| "TIMEOUT" error | DOUT or SCK wires disconnected or swapped |
| Negative weight | Needs re-taring (send `t`) |

---

## 2. Gas Sensor Calibration (MQ-series)

### Warm-Up Period
- MQ-series sensors require a **warm-up period** (30 seconds minimum, 24–48 hours for first use)
- The firmware enforces a 30-second warm-up during which gas readings are ignored
- First-time use: Let the sensor run continuously for at least 24 hours for stable baseline

### Establishing Baseline
1. Power on the system in **clean air** (no waste nearby)
2. Wait for warm-up to complete
3. Note the `gas_raw` value — this is your baseline
4. Update `GAS_THRESHOLD_LOW` in `config.h` to your baseline + 20%
5. Update `GAS_THRESHOLD_HIGH` to 2× baseline or higher

### Testing Gas Detection
1. Place organic waste (fruit peels, food scraps) near the sensor
2. Wait 2–5 minutes
3. Observe if `gas_raw` increases above `GAS_THRESHOLD_HIGH`
4. Adjust thresholds based on observed readings

### Important Notes
- Gas readings are **qualitative indicators**, not precise gas concentration measurements
- MQ-series sensors detect multiple gases (methane, CO, VOCs, etc.)
- The sensor does NOT prove that waste is biodegradable — it only indicates gas emission
- Environmental conditions (temperature, humidity, ventilation) affect readings

---

## 3. Moisture Sensor Calibration

### Identify Sensor Type
- **Capacitive** (recommended): Lower raw value = more moisture
- **Resistive:** Higher raw value = more moisture

Set `MOISTURE_POLARITY_INVERTED` in `config.h`:
- `true` for capacitive sensors (default)
- `false` for resistive sensors

### Calibration Procedure
1. **Dry reading:** Read the sensor in dry air or dry material
   - Note the raw ADC value (e.g., 3800)
2. **Wet reading:** Insert sensor in wet material or water
   - Note the raw ADC value (e.g., 1200)
3. **Update thresholds in `config.h`:**
   ```cpp
   // For capacitive (inverted polarity):
   #define MOISTURE_THRESHOLD_WET    1500  // Below this = wet
   #define MOISTURE_THRESHOLD_DRY    3000  // Above this = dry
   ```

### Important Notes
- Moisture alone does NOT classify waste type
- Many non-biodegradable items can be wet (wet plastic, wet metal)
- Calibrate separately for each sensor (they may have slightly different ranges)

---

## 4. Metal Sensor Calibration

### Verify Output Polarity
1. Start the system and observe serial output
2. With no metal near the sensor, note the `rawPinState`
3. Place a metallic object near the sensor
4. Check if `metalDetected` correctly shows `DETECTED`

If the polarity is wrong, change `METAL_ACTIVE_LOW` in `config.h`:
- `true` = sensor outputs LOW when metal detected (NPN proximity)
- `false` = sensor outputs HIGH when metal detected

### Test Procedure
| Test | Expected Result |
|------|----------------|
| No object near sensor | metalDetected = None |
| Iron/steel object at 1cm | metalDetected = DETECTED |
| Aluminium at 1cm | May or may not detect (depends on sensor) |
| Plastic at 1cm | metalDetected = None |
| Paper at 1cm | metalDetected = None |

### Limitations
- Inductive proximity sensors detect **ferrous metals** best
- Non-ferrous metals (aluminium, copper) have reduced detection range
- Detection range is typically 1–5cm depending on the sensor and metal type
- The sensor cannot distinguish between different types of metal

---

## 5. Ultrasonic Level Sensor Calibration

### Measure Bin Depth
1. Measure the internal depth of each bin in centimetres
2. This is the distance from the ultrasonic sensor (at the top) to the bottom
3. Update `BIN_DEPTH_CM` in `config.h`

### Verify Distance Readings
1. Place the sensor at the top of an empty bin
2. Check that the serial output shows a distance close to the bin depth
3. Place objects at known heights and verify fill percentage accuracy

### Threshold Adjustment
```cpp
#define BIN_DEPTH_CM           40.0   // Your measured bin depth
#define BIN_LEVEL_NEAR_FULL_PCT 75.0  // 75% → near capacity warning
#define BIN_LEVEL_FULL_PCT      90.0  // 90% → full warning
```

### Troubleshooting
| Issue | Likely Cause |
|-------|-------------|
| Distance always shows -1 | ECHO/TRIG wires wrong, voltage divider missing |
| Erratic readings | Sensor not perpendicular, soft materials absorb sound |
| Distance too short | Object blocking sensor, minimum distance is ~2cm |

---

## Quick Calibration Checklist

- [ ] Load cell Bio: Tared and calibrated with known weight
- [ ] Load cell NonBio: Tared and calibrated with known weight  
- [ ] Gas sensor: Baseline established in clean air
- [ ] Moisture Bio: Wet/dry thresholds verified
- [ ] Moisture NonBio: Wet/dry thresholds verified
- [ ] Metal Bio: Polarity verified with test objects
- [ ] Metal NonBio: Polarity verified with test objects
- [ ] Ultrasonic Bio: Bin depth set, distance verified
- [ ] Ultrasonic NonBio: Bin depth set, distance verified
