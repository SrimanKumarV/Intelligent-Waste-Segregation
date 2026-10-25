# Hardware Simulation Guide — Intelligent Solid Waste Segregation System

This directory contains resources for testing the Intelligent Solid Waste Segregation System firmware in simulation before deploying to physical hardware.

---

## 1. Wokwi ESP32 Simulator

The project includes a ready-to-run Wokwi circuit schematic (`diagram.json`) that models all primary sensors and LED indicators:

| Hardware Component | Wokwi Model | GPIO / Pins | Simulation Control |
|--------------------|-------------|-------------|---------------------|
| **ESP32** | `wokwi-esp32-devkit-v1` | All | Microcontroller |
| **Gas Sensor (MQ)** | `wokwi-potentiometer` | GPIO 36 (VP) | Rotate slider to simulate gas concentration |
| **Moisture (Bio)** | `wokwi-potentiometer` | GPIO 39 (VN) | Rotate slider to simulate dry vs wet organic waste |
| **Moisture (Non-Bio)** | `wokwi-potentiometer` | GPIO 34 | Rotate slider to simulate liquid contamination in dry bin |
| **Metal Sensor (Bio)** | `wokwi-pushbutton` | GPIO 18 | Press to simulate metallic can/foil thrown in Bio bin |
| **Metal Sensor (Non-Bio)** | `wokwi-pushbutton` | GPIO 19 | Press to simulate legitimate metal in Non-Bio bin |
| **Ultrasonic (Bio)** | `wokwi-hc-sr04` | TRIG: 26, ECHO: 25 | Click sensor to change distance (simulate bin fill) |
| **Ultrasonic (Non-Bio)**| `wokwi-hc-sr04` | TRIG: 27, ECHO: 14 | Click sensor to change distance (simulate bin fill) |
| **Green LED** | `wokwi-led` | GPIO 2 | System Heartbeat / OK indicator |
| **Red LED (Bio Mismatch)** | `wokwi-led` | GPIO 13 | Illuminates when metal detected in Bio bin |
| **Red LED (Non-Bio Mis)** | `wokwi-led` | GPIO 15 | Illuminates on moisture + gas in Non-Bio bin |
| **Amber LED (Bin Full)** | `wokwi-led` | GPIO 33 | Illuminates when either bin reaches capacity (≥90%) |
| **Red LED (Fault)** | `wokwi-led` | GPIO 32 | Blinks when any sensor is disconnected or out-of-range |

---

## How to Run Wokwi Simulation

### Method A: VS Code / Antigravity IDE (Offline)
1. Install the **Wokwi Simulator** extension in VS Code.
2. Build the firmware using PlatformIO:
   ```bash
   pio run
   ```
3. Open `simulation/diagram.json` or press `F1` -> `Wokwi: Start Simulator`.
4. The virtual ESP32 boots up, runs the LED self-test, and begins serial telemetry output!

### Method B: Wokwi Online (Browser)
1. Visit [wokwi.com/projects/new/esp32](https://wokwi.com/projects/new/esp32).
2. Copy the contents of `simulation/diagram.json` into the `diagram.json` tab.
3. Paste the C++ source or upload `firmware.bin`.
4. Click **Play** to interact with virtual knobs, pushbuttons, and LEDs.

---

## 2. Interactive Digital Twin & Web Dashboard

For instant visual testing without compiling or installing any software, open:
`simulation/dashboard/index.html`

Features:
- **Interactive Twin**: Real-time slider controls for moisture, gas, metal, load cells, and fill level.
- **Virtual LED Cluster**: Mirrors real ESP32 GPIO behavior, blink timers, and priority handling.
- **Rule Verification Engine**: Calculates real-time evidence scores and mismatch determinations.
- **Web Serial Link**: Plug in your physical ESP32 and stream real telemetry directly into the browser!
