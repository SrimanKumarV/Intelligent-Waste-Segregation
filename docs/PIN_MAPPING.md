# Pin Mapping — Multi-Microcontroller Architecture (Arduino Uno & ESP32)

> **Architecture:** Distributed Dual-Microcontroller IoT System  
> **Module A (Arduino Uno):** Autonomous Proximity Detection & Lid Servo Actuator  
> **Module B (ESP32 DevKit V1):** 4-Channel Waste Analytics Hub (Dual Moisture & Dual Mass)  
> **Compartments:** 2 Active (Biodegradable & Non-Biodegradable) + 1 Reserved for Future Use  

---

## 1. Module A — Arduino Uno R3 (5.0V TTL Logic)

*Primary Responsibility:* Autonomous HC-SR04 ultrasonic proximity detection, debounced lid opening/closing servo actuation, status LEDs, and connected 16x2 I2C LCD. Operates independently from the host and ESP32.

| Peripheral | Signal | Arduino Uno Pin | Pin Type | Signal Voltage | Supply Rail | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **HC-SR04 Ultrasonic** | Trigger (TRIG) | **D4** | Digital Output | 5.0V TTL | 5V / GND | 10µs pulse initiates ultrasonic ping |
| **HC-SR04 Ultrasonic** | Echo (ECHO) | **D5** | Digital Input | 5.0V TTL | 5V / GND | Direct connection (5.0V native) |
| **Lid Actuator Servo** | PWM Signal | **D6** | Digital PWM | 5.0V TTL | 5V / GND | 50Hz PWM to servo (0° closed, 90° open) |
| **Proximity LED** | Anode (+) | **D7** | Digital Output | 5.0V (via 220Ω)| GND | Amber LED (illuminates when object ≤ 20cm) |
| **Fault LED** | Anode (+) | **D8** | Digital Output | 5.0V (via 220Ω)| GND | Red LED (illuminates on ultrasonic timeout) |
| **Heartbeat LED** | Onboard LED | **D13** | Digital Output | 5.0V (onboard) | — | 500ms toggle rate |
| **Modular LCD (Uno)** | I2C Data (SDA) | **A4** | Bidirectional | 5.0V TTL | 5V / GND | LiquidCrystal_I2C address 0x27 (or 0x3F) |
| **Modular LCD (Uno)** | I2C Clock (SCL)| **A5** | Output | 5.0V TTL | 5V / GND | 16x2 / 20x4 display backpack |
| **USB Serial TX/RX** | Telemetry | **D1 (TX) / D0 (RX)** | Serial UART | 5.0V TTL | — | 115200 baud USB connection to Host |

*Reserved / Unused Pins on Uno:* D2, D3, D9, D10, D11, D12, A0, A1, A2, A3.

---

## 2. Module B — ESP32 DevKit V1 (3.3V Logic Level)

*Primary Responsibility:* High-resolution sensor telemetry hub. Ingests 4 independent channels across Compartments A and B, manages Non-Volatile Storage (Preferences/NVS) calibration, drives its connected 16x2 LCD, and receives synchronized lid state updates.

| Sensor Channel | Peripheral Signal | ESP32 GPIO | Pin Type | Signal Voltage | Target Compartment | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Moisture C1** | Analog Out (AOUT) | **GPIO 34** | Analog Input (ADC1_CH6) | 0–3.3V | **Comp A: Biodegradable** | Input-only pin; safe from Wi-Fi ADC2 conflicts |
| **Moisture C2** | Analog Out (AOUT) | **GPIO 35** | Analog Input (ADC1_CH7) | 0–3.3V | **Comp B: Non-Biodegradable** | Input-only pin; independent dry/wet calibration |
| **Load Cell 1 (LC1)** | HX711 DOUT | **GPIO 16** | Digital Input | 3.3V | **Comp A: Biodegradable** | Strain gauge amplifier data line |
| **Load Cell 1 (LC1)** | HX711 SCK | **GPIO 4** | Digital Output | 3.3V | **Comp A: Biodegradable** | HX711 clock synchronization |
| **Load Cell 2 (LC2)** | HX711 DOUT | **GPIO 17** | Digital Input | 3.3V | **Comp B: Non-Biodegradable** | Independent second HX711 data line |
| **Load Cell 2 (LC2)** | HX711 SCK | **GPIO 18** | Digital Output | 3.3V | **Comp B: Non-Biodegradable** | Independent second HX711 clock line |
| **Status LED** | Onboard LED | **GPIO 2** | Digital Output | 3.3V | — | Heartbeat and command ACK blink |
| **Modular LCD (ESP)** | I2C Data (SDA) | **GPIO 21** | Bidirectional | 3.3V | — | 16x2 / 20x4 I2C display backpack |
| **Modular LCD (ESP)** | I2C Clock (SCL)| **GPIO 22** | Output | 3.3V | — | 16x2 / 20x4 I2C display backpack |
| **USB Serial TX/RX** | Telemetry / Cmd | **GPIO 1 (TX0) / 3 (RX0)** | Serial UART | 3.3V | — | 115200 baud USB connection to Host |

---

## 3. Physical Bin Compartment Assignment Table

| Compartment | Waste Category | Physical Sensors Assigned | Displayed Metrics | Inclusion in Total Mass |
| :--- | :--- | :--- | :--- | :--- |
| **Compartment A** | Biodegradable Waste | Moisture C1 (GPIO 34)<br>Load Cell 1 (GPIO 16/4) | Moisture %, Mass (g), 5m ML Forecast, Calibration Warning | **Included** |
| **Compartment B** | Non-Biodegradable Waste | Moisture C2 (GPIO 35)<br>Load Cell 2 (GPIO 17/18) | Moisture %, Mass (g), 5m ML Forecast, Calibration Warning | **Included** |
| **Compartment C** | **Reserved / Future Use** | **None** (Intentionally unconfigured) | `NOT CONFIGURED` / `Reserved for Future Use` | **EXCLUDED** (No fake 0g / 0%) |

---

## 4. Electrical Safety & Voltage Isolation Notice

> [!WARNING]
> **ESP32 3.3V Voltage Limit:** The ESP32 GPIO pins are rated for a maximum of 3.3V. Never connect 5.0V sensor outputs directly to the ESP32.
> - If capacitive moisture sensors are powered from 5V, use a resistive voltage divider (e.g., 10kΩ / 20kΩ) or power sensors directly from the ESP32 3.3V rail.
> - HX711 modules must be powered from 3.3V when interfacing with the ESP32, or use level shifting on DOUT.
> - **Direct Uno-to-ESP32 UART Wiring:** If a direct physical UART link is used between Uno and ESP32 instead of the Host Serial Gateway, a 5V-to-3.3V level shifter or divider is mandatory between Uno TX (5V) and ESP32 RX (3.3V).
