# Wiring Guide — Intelligent Solid Waste Segregation System

> ⚠ **SAFETY FIRST**  
> - Disconnect ALL power before making or changing connections  
> - Never hot-swap sensor wires  
> - Double-check all connections before applying power  
> - ESP32 GPIOs are 3.3V — do NOT apply 5V directly to any GPIO pin

## Required Components

| # | Component | Quantity | Notes |
|---|-----------|----------|-------|
| 1 | ESP32 DevKit V1 | 1 | 30-pin or 38-pin |
| 2 | MQ-series gas sensor module | 1 | MQ-2, MQ-4, or MQ-135 |
| 3 | Soil moisture sensor module | 2 | Capacitive (preferred) or resistive |
| 4 | Inductive proximity / metal detector module | 2 | NPN output type recommended |
| 5 | Load cell (bar type, 5kg or 10kg) | 2 | Match to expected bin weight |
| 6 | HX711 load cell amplifier module | 2 | Includes ADC |
| 7 | HC-SR04 ultrasonic sensor | 2 | 5V type |
| 8 | LED (Red) | 3 | For mismatch and fault indicators |
| 9 | LED (Green) | 1 | System OK indicator |
| 10 | LED (Yellow/Amber) | 1 | Bin full indicator |
| 11 | Resistor 220Ω | 5 | Current limiting for LEDs |
| 12 | Resistor 1kΩ | 2 | Voltage divider for HC-SR04 echo |
| 13 | Resistor 2kΩ | 2 | Voltage divider for HC-SR04 echo |
| 14 | Breadboard (full size) | 1–2 | |
| 15 | Jumper wires (M-M, M-F) | ~50 | Assorted colours recommended |
| 16 | Waste bin (small) | 2 | Biodegradable + Non-biodegradable |
| 17 | USB cable (micro-USB or USB-C) | 1 | For ESP32 programming and power |
| 18 | 5V/2A power supply (optional) | 1 | If USB power is insufficient |

## Step-by-Step Assembly

### Step 1: Place ESP32 on Breadboard

1. Insert the ESP32 DevKit across the centre channel of the breadboard
2. Ensure pins are accessible on both sides
3. **Do NOT connect USB yet**

### Step 2: Power Rails

1. Connect ESP32 `3V3` pin to the breadboard's 3.3V power rail (+)
2. Connect ESP32 `GND` pin to the breadboard's ground rail (–)
3. If using 5V sensors, connect ESP32 `VIN` (5V) to a separate 5V power rail
4. **All components must share a common ground**

### Step 3: Gas Sensor (MQ-series)

```
MQ Sensor Module    ESP32
─────────────────   ─────
VCC  ──────────── → 5V (VIN rail)
GND  ──────────── → GND (common ground)
AOUT ──────────── → GPIO 36 (VP)  [via voltage divider if > 3.3V output]
DOUT ──────────── → GPIO 23       [optional]
```

**Voltage Divider for AOUT (if module outputs > 3.3V):**
```
MQ AOUT ── R1 (2kΩ) ──┬── GPIO 36
                        │
                   R2 (1kΩ)
                        │
                       GND
```
This scales 5V → ~1.67V. Adjust R values if needed for full ADC range.

> **Note:** Many MQ breakout modules have a built-in potentiometer for the digital threshold. The analog output may already be within 0–3.3V range on some modules. **Measure with a multimeter before connecting.**

### Step 4: Moisture Sensors

**Biodegradable Bin Moisture Sensor:**
```
Sensor Module       ESP32
─────────────────   ─────
VCC  ──────────── → 3.3V rail (or 5V if required by module)
GND  ──────────── → GND
AOUT ──────────── → GPIO 39 (VN)
```

**Non-Biodegradable Bin Moisture Sensor:**
```
Sensor Module       ESP32
─────────────────   ─────
VCC  ──────────── → 3.3V rail
GND  ──────────── → GND
AOUT ──────────── → GPIO 34
```

> **Note:** If using 5V moisture modules, check if analog output exceeds 3.3V. Use a voltage divider if needed.

### Step 5: Metal Sensors

**Biodegradable Bin Metal Sensor:**
```
Sensor Module       ESP32
─────────────────   ─────
VCC  ──────────── → 5V
GND  ──────────── → GND
OUT  ──────────── → GPIO 18
```

**Non-Biodegradable Bin Metal Sensor:**
```
Sensor Module       ESP32
─────────────────   ─────
VCC  ──────────── → 5V
GND  ──────────── → GND
OUT  ──────────── → GPIO 19
```

> **Note:** If your metal sensor uses an NPN open-collector output, the internal pull-up enabled in firmware (INPUT_PULLUP) should be sufficient. Verify the output polarity matches the `METAL_ACTIVE_LOW` setting in `config.h`.

### Step 6: Load Cells with HX711 Modules

**Load Cell to HX711 Wiring (same for both):**
```
Load Cell Wire      HX711 Module
──────────────────  ────────────
Red    (E+)  ───── → E+
Black  (E–)  ───── → E–
White  (A–)  ───── → A–
Green  (A+)  ───── → A+
```

> Load cell wire colours may vary. Consult your load cell's datasheet.

**HX711 #1 (Biodegradable Bin) to ESP32:**
```
HX711 Module        ESP32
─────────────────   ─────
VCC  ──────────── → 5V (or 3.3V — check module)
GND  ──────────── → GND
DOUT ──────────── → GPIO 16
SCK  ──────────── → GPIO 4
```

**HX711 #2 (Non-Biodegradable Bin) to ESP32:**
```
HX711 Module        ESP32
─────────────────   ─────
VCC  ──────────── → 5V (or 3.3V)
GND  ──────────── → GND
DOUT ──────────── → GPIO 17
SCK  ──────────── → GPIO 5
```

### Step 7: Ultrasonic Level Sensors (HC-SR04)

**HC-SR04 #1 (Biodegradable Bin):**
```
HC-SR04             ESP32
─────────────────   ─────
VCC  ──────────── → 5V
GND  ──────────── → GND
TRIG ──────────── → GPIO 26
ECHO ── [voltage divider] → GPIO 25
```

**HC-SR04 #2 (Non-Biodegradable Bin):**
```
HC-SR04             ESP32
─────────────────   ─────
VCC  ──────────── → 5V
GND  ──────────── → GND
TRIG ──────────── → GPIO 27
ECHO ── [voltage divider] → GPIO 14
```

**ECHO Voltage Divider (REQUIRED for each HC-SR04):**
```
HC-SR04 ECHO ── R1 (1kΩ) ──┬── ESP32 GPIO
                             │
                        R2 (2kΩ)
                             │
                            GND
```

### Step 8: LED Indicators

Each LED requires a current-limiting resistor (220Ω) in series.

```
ESP32 GPIO ── 220Ω ── LED Anode (+) ── LED Cathode (–) ── GND
```

| LED Colour | Function | GPIO |
|------------|----------|------|
| Green | System OK | GPIO 2 (on-board LED on many boards) |
| Red | Bio bin mismatch | GPIO 13 |
| Red | NonBio bin mismatch | GPIO 15 |
| Yellow | Bin full / near capacity | GPIO 33 |
| Red | Sensor fault (blinks) | GPIO 32 |

> **Note:** GPIO 2 is the on-board LED on most ESP32 DevKit boards. If using an external LED on GPIO 2, ensure it doesn't interfere with boot.

### Step 9: Sensor Mounting

1. **Ultrasonic sensors:** Mount at the top of each bin, facing downward. Ensure clear line of sight to the waste surface. Secure with hot glue or brackets.
2. **Load cells:** Place under each bin as a weighing platform. Ensure the bin sits level on the load cell.
3. **Metal sensors:** Position near the bin opening where waste is deposited.
4. **Moisture sensors:** Position where they can contact deposited waste.
5. **Gas sensor:** Position between the two bins or near the biodegradable bin.

### Step 10: Pre-Power Checklist

Before connecting USB or power:

- [ ] All GND connections are tied together
- [ ] No 5V wire touches any ESP32 GPIO pin directly
- [ ] Voltage dividers are in place for HC-SR04 ECHO pins
- [ ] Gas sensor analog output is within 0–3.3V range (or has divider)
- [ ] Each LED has a 220Ω series resistor
- [ ] Load cells are connected to HX711 modules (NOT directly to ESP32)
- [ ] No pins are double-assigned (check against PIN_MAPPING.md)
- [ ] Wires are secure and not loose on the breadboard
- [ ] No short circuits between adjacent rows

### Step 11: Power On and Test

1. Connect ESP32 via USB to computer
2. Open serial monitor at 115200 baud
3. Observe the startup banner and LED self-test
4. Wait for gas sensor warm-up (30 seconds)
5. Check serial output for sensor readings and any error messages
6. Refer to `CALIBRATION_GUIDE.md` for load cell calibration
