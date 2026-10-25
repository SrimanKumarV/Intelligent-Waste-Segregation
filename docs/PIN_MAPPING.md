# Pin Mapping — Intelligent Solid Waste Segregation System

> **Board:** ESP32 DevKit V1 (30-pin or 38-pin)  
> **Logic Level:** 3.3V — Do NOT connect 5V signals directly to ESP32 GPIO

## GPIO Assignment Table

| Component | Signal | ESP32 GPIO | Direction | Signal Type | Supply (VCC) | Notes |
|---|---|---|---|---|---|---|
| **Gas Sensor** (MQ-series) | Analog Out | **GPIO 36 (VP)** | Input | Analog 0–3.3V | 5V | Use voltage divider if output > 3.3V |
| Gas Sensor | Digital Out | **GPIO 23** | Input | Digital | 5V | Optional threshold output |
| **Moisture Sensor 1** (Bio) | Analog Out | **GPIO 39 (VN)** | Input | Analog 0–3.3V | 3.3V / 5V | Verify output range for your module |
| **Moisture Sensor 2** (NonBio) | Analog Out | **GPIO 34** | Input | Analog 0–3.3V | 3.3V / 5V | Verify output range for your module |
| **Metal Sensor 1** (Bio) | Digital Out | **GPIO 18** | Input | Digital | 5V | NPN: active LOW; use pull-up |
| **Metal Sensor 2** (NonBio) | Digital Out | **GPIO 19** | Input | Digital | 5V | NPN: active LOW; use pull-up |
| **HX711 #1** (Bio) | DOUT | **GPIO 16** | Input | Digital | 5V | HX711 module, NOT direct load cell |
| HX711 #1 (Bio) | SCK | **GPIO 4** | Output | Digital | 5V | Clock signal |
| **HX711 #2** (NonBio) | DOUT | **GPIO 17** | Input | Digital | 5V | HX711 module |
| HX711 #2 (NonBio) | SCK | **GPIO 5** | Output | Digital | 5V | Weak pull-up at boot — OK for HX711 |
| **Ultrasonic 1** (Bio) | TRIG | **GPIO 26** | Output | Digital | 5V | 10µs pulse trigger |
| Ultrasonic 1 (Bio) | ECHO | **GPIO 25** | Input | Digital | 5V⚡ | **USE VOLTAGE DIVIDER** (5V → 3.3V) |
| **Ultrasonic 2** (NonBio) | TRIG | **GPIO 27** | Output | Digital | 5V | 10µs pulse trigger |
| Ultrasonic 2 (NonBio) | ECHO | **GPIO 14** | Input | Digital | 5V⚡ | **USE VOLTAGE DIVIDER** (5V → 3.3V) |
| **LED** System OK | Anode | **GPIO 2** | Output | Digital | 3.3V | On-board LED (most boards), 220Ω resistor |
| **LED** Bio Mismatch | Anode | **GPIO 13** | Output | Digital | 3.3V | Red LED, 220Ω resistor |
| **LED** NonBio Mismatch | Anode | **GPIO 15** | Output | Digital | 3.3V | Red LED, 220Ω resistor |
| **LED** Bin Full | Anode | **GPIO 33** | Output | Digital | 3.3V | Yellow/Amber LED, 220Ω resistor |
| **LED** Sensor Fault | Anode | **GPIO 32** | Output | Digital | 3.3V | Red LED (blinks), 220Ω resistor |

## ESP32 GPIO Safety Notes

### Pins Used — Verified Safe
| GPIO | Function | Boot Concern |
|------|----------|-------------|
| 2 | LED | Boot-strap (must be LOW for flash) — OK as LED output |
| 4 | HX711 SCK | Safe |
| 5 | HX711 SCK | Weak pull-up at boot — OK |
| 13 | LED | Safe |
| 14 | Echo input | Outputs PWM at boot — OK for input use |
| 15 | LED | Must be HIGH at boot for serial output — LED OK |
| 16 | HX711 DOUT | Safe |
| 17 | HX711 DOUT | Safe |
| 18 | Metal input | Safe |
| 19 | Metal input | Safe |
| 23 | Gas digital | Safe |
| 25 | Echo input | Safe |
| 26 | Trig output | Safe |
| 27 | Trig output | Safe |
| 32 | LED | ADC1_CH4 — safe for digital output |
| 33 | LED | ADC1_CH5 — safe for digital output |
| 34 | Moisture ADC | Input-only — OK for analog read |
| 36 | Gas ADC | Input-only (VP) — OK for analog read |
| 39 | Moisture ADC | Input-only (VN) — OK for analog read |

### Pins NOT Used (Reserved)
| GPIO | Reason |
|------|--------|
| 0 | Boot button — avoid |
| 1 | TX0 (serial output) — reserved |
| 3 | RX0 (serial input) — reserved |
| 6–11 | Connected to SPI flash — **DO NOT USE** |
| 12 | Boot-strap (MTDI) — affects flash voltage |

## Voltage Divider for HC-SR04 Echo Pins

The HC-SR04 ECHO pin outputs 5V logic. The ESP32 tolerates only 3.3V.

```
HC-SR04 ECHO ──── R1 (1kΩ) ──┬── ESP32 GPIO (25 or 14)
                               │
                          R2 (2kΩ)
                               │
                              GND
```

Output voltage: 5V × 2kΩ / (1kΩ + 2kΩ) = 3.33V ✓

## Power Requirements

| Component | Voltage | Typical Current |
|-----------|---------|-----------------|
| ESP32 DevKit | 5V (USB) or 3.3V | 240mA active |
| MQ-series gas sensor | 5V | 150–180mA (heater) |
| Moisture sensor (×2) | 3.3V or 5V | 5–20mA each |
| Metal sensor (×2) | 5V | 10–30mA each |
| HX711 (×2) | 5V (or 3.3V) | 1.5mA each |
| HC-SR04 (×2) | 5V | 15mA each |
| LEDs (×5) | 3.3V (via GPIO) | 10mA each |

**Total estimated:** ~500–600mA at 5V

> **Recommendation:** Use a dedicated 5V/2A power supply. USB alone may not be sufficient for all sensors + ESP32. Share a common GND between all components and the ESP32.
