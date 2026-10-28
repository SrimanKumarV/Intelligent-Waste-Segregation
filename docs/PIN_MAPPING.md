# Pin Mapping — Intelligent Waste Segregation Analytics (Arduino Uno)

> **Microcontroller:** Arduino Uno R3 (Microchip ATmega328P)  
> **Logic Level:** 5.0V TTL  
> **Analog Resolution:** 10-bit (0–1023 counts, 4.88mV per LSB at 5.0V VREF)  
> **Clock Speed:** 16 MHz  
> **Flash / SRAM:** 32 KB Flash / 2 KB SRAM  

---

## 1. Pin Assignment Table

| Peripheral | Signal | Arduino Uno Pin | Pin Type | Signal Voltage | Supply Pin | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Moisture Sensor** | Analog Out (AOUT) | **A0** | Analog Input | 0–5.0V | 5V / GND | Capacitive soil moisture sensor |
| **HX711 Amplifier** | Data Out (DOUT) | **D2** | Digital Input | 5.0V TTL | 5V / GND | Load cell serial data line |
| **HX711 Amplifier** | Serial Clock (SCK) | **D3** | Digital Output | 5.0V TTL | 5V / GND | Load cell clock synchronization |
| **HC-SR04 Ultrasonic** | Trigger (TRIG) | **D4** | Digital Output | 5.0V TTL | 5V / GND | 10µs pulse initiates sonic burst |
| **HC-SR04 Ultrasonic** | Echo (ECHO) | **D5** | Digital Input | 5.0V TTL | 5V / GND | Direct connection (5V native) |
| **Lid Actuator** | PWM Signal | **D6** | Digital PWM | 5.0V TTL | 5V / GND | 50Hz PWM to servo (0° closed, 90° open) |
| **Proximity LED** | Anode (+) | **D7** | Digital Output | 5.0V (current limited)| GND | Yellow/Amber LED (active during proximity) |
| **Fault LED** | Anode (+) | **D8** | Digital Output | 5.0V (current limited)| GND | Red LED (illuminates on sensor timeout) |
| **Heartbeat LED** | Onboard LED | **D13** | Digital Output | 5.0V (onboard) | — | Periodic 500ms heartbeat blink |
| **UART Serial TX** | Data Transmit | **D1 (TX)** | Serial TX | 5.0V TTL | — | USB serial to gateway (115200 baud) |
| **UART Serial RX** | Data Receive | **D0 (RX)** | Serial RX | 5.0V TTL | — | USB serial from gateway (115200 baud) |

---

## 2. Voltage Safety & Hardware Interfacing

1. **5.0V Native Compatibility:** Unlike the 3.3V ESP32, the Arduino Uno operates at 5.0V. The HC-SR04 ultrasonic echo pin outputs a 5.0V pulse which connects **directly** to Pin D5 without requiring a resistive voltage divider.
2. **Capacitive Moisture Sensor Interfacing:** Connect sensor VCC to the Uno 5V pin and GND to Uno GND. The analog voltage output feeds directly into Pin A0.
3. **Servo Power Isolation:** Standard micro servos (SG90) can be powered from the Uno 5V rail for testing. However, for continuous operation or larger servos (MG90S, MG996R), provide an **independent 5V 1A DC power supply** for the servo power pins to prevent brownout resets on the ATmega328P. **Always tie servo power ground to Arduino ground (common GND).**
4. **Current Limiting:** Use 220Ω series resistors on Pins D7 and D8 to keep LED current under 15mA per pin (well below the ATmega328P 40mA absolute maximum).

---

## 3. Reserved & Free Pins

- **D9, D10, D11, D12:** Free digital pins available for future actuators or limit switches.
- **A1, A2, A3, A4, A5:** Free analog/digital pins available for secondary sensors or I2C communication (A4=SDA, A5=SCL).
- **D0 (RX) & D1 (TX):** Dedicated to USB serial telemetry communication at 115200 baud. Do not connect external hardware to D0/D1 while USB gateway is in use.
