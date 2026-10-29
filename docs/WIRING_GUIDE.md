# Complete Wiring Guide — Multi-Microcontroller Hardware Setup

This document provides step-by-step physical assembly and electrical interfacing instructions for the **Intelligent Solid Waste Segregation System** using dual microcontrollers: **Module A (Arduino Uno)** and **Module B (ESP32 DevKit V1)**.

---

## 1. Bill of Materials (BOM)

| Item | Component | Specification | Quantity | Connected Module |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Module A Microcontroller** | Arduino Uno R3 (ATmega328P, 5.0V TTL) | 1 | Host USB Port 1 |
| 2 | **Module B Microcontroller** | ESP32 DevKit V1 (30-pin or 38-pin, 3.3V Logic) | 1 | Host USB Port 2 |
| 3 | **Proximity Sensor** | HC-SR04 Ultrasonic Rangefinder | 1 | Module A (Uno) |
| 4 | **Lid Actuator** | SG90 / MG90S 180° Micro Servo Motor | 1 | Module A (Uno) |
| 5 | **Module A Display** | 16x2 Character LCD with PCF8574 I2C Backpack | 1 | Module A (Uno) |
| 6 | **Moisture Sensor C1** | Capacitive Soil Moisture Sensor v1.2 (Compartment A) | 1 | Module B (ESP32) |
| 7 | **Moisture Sensor C2** | Capacitive Soil Moisture Sensor v1.2 (Compartment B) | 1 | Module B (ESP32) |
| 8 | **Load Cell 1 + Amp** | 5kg–10kg Strain Gauge + HX711 Amplifier (Comp A) | 1 | Module B (ESP32) |
| 9 | **Load Cell 2 + Amp** | 5kg–10kg Strain Gauge + HX711 Amplifier (Comp B) | 1 | Module B (ESP32) |
| 10 | **Module B Display** | 16x2 Character LCD with PCF8574 I2C Backpack | 1 | Module B (ESP32) |
| 11 | **Diagnostic LEDs** | 1× Amber (Proximity), 1× Red (Fault) | 2 | Module A (Uno) |
| 12 | **Current Resistors** | 220Ω 0.25W (for LEDs) | 2 | Module A (Uno) |
| 13 | **Prototyping & Power** | Solderless breadboards, Dupont jumpers, USB-B & Micro-USB cables | 1 set | Power & Bus |

---

## 2. Wiring Module A — Arduino Uno (Lid Actuation & Proximity)

```
                       +-----------------------+
                       |    Arduino Uno R3     |
                       |                       |
[HC-SR04 TRIG] ------->| D4                    |
[HC-SR04 ECHO] ------->| D5                    |
[Servo PWM Orange] --->| D6 (PWM)              |
[Amber LED + 220R] --->| D7                    |
[Red Fault + 220R] --->| D8                    |
[Uno LCD SDA] -------->| A4 (SDA)              |
[Uno LCD SCL] -------->| A5 (SCL)              |
[USB Serial] --------->| USB-B to Host Gateway |
                       +-----------------------+
```

### Detailed Wiring Steps for Module A:
1. **Power Rails:** Connect Uno 5V to the breadboard Red rail and Uno GND to the breadboard Black rail.
2. **HC-SR04 Ultrasonic Sensor:**
   - VCC ────> 5V Rail
   - GND ────> GND Rail
   - TRIG ───> Uno Pin **D4**
   - ECHO ───> Uno Pin **D5** (Direct connection; 5V native)
3. **Automatic Lid Servo:**
   - Power (Red) ──────> 5V Rail (or dedicated external 5V 1A DC supply with shared GND)
   - Ground (Brown) ───> GND Rail
   - PWM Signal (Orange/Yellow) ───> Uno Pin **D6**
4. **Diagnostic Status LEDs:**
   - Proximity Amber LED Anode (+) ──> 220Ω resistor ──> Uno Pin **D7**; Cathode (-) ──> GND Rail
   - Fault Red LED Anode (+) ───────> 220Ω resistor ──> Uno Pin **D8**; Cathode (-) ──> GND Rail
5. **Uno I2C 16x2 LCD:**
   - VCC ────> 5V Rail
   - GND ────> GND Rail
   - SDA ────> Uno Pin **A4**
   - SCL ────> Uno Pin **A5**

---

## 3. Wiring Module B — ESP32 Sensor Hub (4 Channels & Display)

```
                       +-------------------------+
                       |     ESP32 DevKit V1     |
                       |                         |
[C1 Moisture AOUT] --->| GPIO 34 (ADC1_CH6)      | (Compartment A)
[C2 Moisture AOUT] --->| GPIO 35 (ADC1_CH7)      | (Compartment B)
[HX711 LC1 DOUT] ----->| GPIO 16                 | (Compartment A)
[HX711 LC1 SCK] ------>| GPIO 4                  | (Compartment A)
[HX711 LC2 DOUT] ----->| GPIO 17                 | (Compartment B)
[HX711 LC2 SCK] ------>| GPIO 18                 | (Compartment B)
[ESP32 LCD SDA] ------>| GPIO 21 (I2C SDA)       |
[ESP32 LCD SCL] ------>| GPIO 22 (I2C SCL)       |
[Micro-USB UART] ----->| USB to Host Gateway     |
                       +-------------------------+
```

### Detailed Wiring Steps for Module B:
1. **Power & Voltage Safety:**
   - Connect ESP32 **3V3** to the 3.3V breadboard rail. Connect ESP32 **GND** to the ground rail.
   - **CRITICAL:** Do NOT expose ESP32 GPIOs to 5.0V signals. Power the capacitive moisture sensors and HX711 breakout boards from the 3.3V rail.
2. **Capacitive Moisture Sensor C1 (Biodegradable — Compartment A):**
   - VCC ────> 3.3V Rail
   - GND ────> GND Rail
   - AOUT ───> ESP32 Pin **GPIO 34** (ADC1 Channel 6)
3. **Capacitive Moisture Sensor C2 (Non-Biodegradable — Compartment B):**
   - VCC ────> 3.3V Rail
   - GND ────> GND Rail
   - AOUT ───> ESP32 Pin **GPIO 35** (ADC1 Channel 7)
4. **Load Cell 1 + HX711 Amplifier (Compartment A Mass):**
   - Load cell 4-wire Wheatstone bridge: Red to E+, Black to E-, White to A-, Green to A+
   - HX711 VCC ───> 3.3V Rail
   - HX711 GND ───> GND Rail
   - HX711 DOUT ──> ESP32 Pin **GPIO 16**
   - HX711 SCK ───> ESP32 Pin **GPIO 4**
5. **Load Cell 2 + HX711 Amplifier (Compartment B Mass):**
   - Second load cell 4-wire Wheatstone bridge: Red to E+, Black to E-, White to A-, Green to A+
   - Second HX711 VCC ───> 3.3V Rail
   - Second HX711 GND ───> GND Rail
   - Second HX711 DOUT ──> ESP32 Pin **GPIO 17**
   - Second HX711 SCK ───> ESP32 Pin **GPIO 18**
6. **ESP32 I2C 16x2 LCD:**
   - VCC ────> 3.3V Rail (or 5V if LCD backpack has built-in level clamps)
   - GND ────> GND Rail
   - SDA ────> ESP32 Pin **GPIO 21**
   - SCL ────> ESP32 Pin **GPIO 22**

---

## 4. Physical Bin Compartment Installation

1. **Compartment A (Biodegradable):**
   - Mount Load Cell 1 under the base plate of Compartment A using M4 mounting bolts and rigid spacers so the center beam flexes freely.
   - Mount Capacitive Probe C1 vertically inside Compartment A so that organic waste deposits contact the active capacitive zone. Keep the top header dry.
2. **Compartment B (Non-Biodegradable):**
   - Mount Load Cell 2 independently under the base plate of Compartment B.
   - Mount Capacitive Probe C2 vertically inside Compartment B.
3. **Compartment C (Reserved / Future Use):**
   - Kept clean and unconfigured. No strain gauge or moisture probe installed. Excluded from active totals.

---

## 5. Cross-Device Lid Synchronization

Because Module A (Uno) commands lid motion while Module B (ESP32) displays comprehensive system state on its LCD, the lid state is relayed between devices:
- **Host Serial Gateway Relay (Verified Implementation):**
  - Both boards connect via independent USB COM ports to the laptop.
  - `gateway/serial_gateway.ps1` receives Uno telemetry. When a `lid_cmd` transition occurs (`CLOSED` ↔ `OPEN`), the gateway automatically sends `{"cmd":"sync_lid","state":"OPEN"}` into the ESP32 serial interface.
  - The ESP32 parses this frame without blocking and updates its LCD Page 4 display.
  - If updates stop for >5000ms, the ESP32 automatically flags the sync state as `STALE`.
