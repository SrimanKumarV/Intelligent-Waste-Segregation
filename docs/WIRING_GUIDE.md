# Wiring Guide — Intelligent Waste Segregation Analytics (Arduino Uno)

This guide provides step-by-step assembly instructions for connecting the active physical prototype sensors and actuators to an Arduino Uno.

---

## 1. Required Components

| Item | Component | Specification | Quantity |
| :--- | :--- | :--- | :--- |
| 1 | Microcontroller | Arduino Uno R3 (ATmega328P) with USB-B cable | 1 |
| 2 | Moisture Sensor | Capacitive Soil Moisture Sensor v1.2 | 1 |
| 3 | Load Cell & Amp | Straight bar load cell (5kg–10kg) + HX711 module | 1 |
| 4 | Proximity Sensor | HC-SR04 Ultrasonic Sensor | 1 |
| 5 | Lid Actuator | Servo Motor (SG90 / MG90S 180° rotation) | 1 |
| 6 | Visual LEDs | 1× Amber/Yellow LED, 1× Red LED | 2 |
| 7 | Resistors | 220Ω, 0.25W (current limiting for LEDs) | 2 |
| 8 | Prototyping | Half-size solderless breadboard + Dupont jumper wires | 1 set |
| 9 | Power Supply | 5V USB connection to PC or external 5V 1A DC adapter | 1 |

---

## 2. Step-by-Step Wiring Sequence

### Step 1: Power & Common Ground Distribution
1. Connect the **5V** pin on the Arduino Uno to the **Red (+) power rail** on the breadboard.
2. Connect the **GND** pin on the Arduino Uno to the **Blue/Black (-) ground rail** on the breadboard.
3. *Note:* If using an external 5V power supply for the servo, ensure the external power supply GND is connected directly to the Arduino Uno GND rail (Common Ground).

---

### Step 2: Capacitive Soil Moisture Sensor
The capacitive moisture sensor uses three pins:
```
Moisture Sensor VCC   ────> Breadboard 5V Rail
Moisture Sensor GND   ────> Breadboard GND Rail
Moisture Sensor AOUT  ────> Arduino Uno Pin A0
```
*Installation Note:* Keep the onboard circuitry and header pins dry. Only the lower white capacitive trace blade should be inserted into the waste bin.

---

### Step 3: Load Cell and HX711 Module
1. **Connect Load Cell to HX711 Module (Wheatstone Bridge):**
   - **Red Wire** ────> `E+` (Excitation positive)
   - **Black Wire** ──> `E-` (Excitation negative / GND)
   - **White Wire** ──> `A-` (Signal negative)
   - **Green Wire** ──> `A+` (Signal positive)
   *(If your load cell has a yellow shield wire, connect it to GND or leave unstripped).*

2. **Connect HX711 Module to Arduino Uno:**
   ```
   HX711 VCC   ────> Breadboard 5V Rail
   HX711 GND   ────> Breadboard GND Rail
   HX711 DOUT  ────> Arduino Uno Pin D2
   HX711 SCK   ────> Arduino Uno Pin D3
   ```
*Mechanical Note:* Ensure the load cell is mounted with spacer blocks so the center beam can deflect freely under weight without binding against the base plate.

---

### Step 4: HC-SR04 Ultrasonic Proximity Sensor
```
HC-SR04 VCC   ────> Breadboard 5V Rail
HC-SR04 GND   ────> Breadboard GND Rail
HC-SR04 TRIG  ────> Arduino Uno Pin D4
HC-SR04 ECHO  ────> Arduino Uno Pin D5
```
*Note:* Since the Arduino Uno operates at 5.0V TTL logic, the ECHO output can be wired directly to Pin D5 without requiring a voltage divider. Mount the sensor facing outward at the waste deposit opening.

---

### Step 5: Lid Actuator (Servo Motor)
```
Servo Power (Red)    ────> Breadboard 5V Rail (or External 5V Power Supply)
Servo Ground (Brown/Black) ─> Breadboard GND Rail (Shared Common Ground)
Servo PWM (Orange/Yellow) ──> Arduino Uno Pin D6
```
*Mechanical Alignment:* Before attaching the servo horn/arm to the bin lid linkage, power the Uno so the servo defaults to 0° (Closed position). Then fasten the mechanical arm.

---

### Step 6: Status & Fault Indicator LEDs
1. **Proximity / Lid Open LED (Amber/Yellow):**
   - Arduino Uno **Pin D7** ──> 220Ω Resistor ──> Anode (long leg) of Amber LED
   - Cathode (short leg / flat edge) ──> Breadboard GND Rail
2. **Sensor Fault LED (Red):**
   - Arduino Uno **Pin D8** ──> 220Ω Resistor ──> Anode (long leg) of Red LED
   - Cathode (short leg / flat edge) ──> Breadboard GND Rail
3. **Heartbeat LED:** Uses the Arduino Uno onboard LED on **Pin D13**.

---

## 3. Pre-Power Safety Checklist

Before plugging in the USB cable:
- [ ] Verify that no breadboard jumpers bridge between 5V and GND (check resistance with multimeter).
- [ ] Verify that the HX711 DOUT and SCK wires are firmly seated in Pins D2 and D3.
- [ ] Confirm servo polarity: Red to 5V, Brown/Black to GND. Reversing servo power will destroy the servo board.
- [ ] Verify that 220Ω resistors are in series with each LED.
- [ ] Ensure the load cell beam has mechanical clearance to flex under applied mass.
