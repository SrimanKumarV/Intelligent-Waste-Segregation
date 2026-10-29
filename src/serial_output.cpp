/**
 * @file serial_output.cpp
 * @brief Structured telemetry protocol and command interface implementation
 *
 * Implements:
 *   - JSON Lines telemetry serialization using Flash PROGMEM strings (zero heap allocation)
 *   - Explicit null values for missing or uncalibrated readings
 *   - Non-blocking serial command interface
 */

#include "serial_output.h"
#include "sensors.h"
#include "config.h"

void serial_init() {
    Serial.begin(SERIAL_BAUD_RATE);
    // On Arduino Uno, delay briefly to let serial lines stabilize
    delay(100);
}

void serial_printBanner() {
    Serial.println();
    Serial.println(F("=================================================="));
    Serial.println(F(" INTELLIGENT WASTE SEGREGATION ANALYTICS (UNO)   "));
    Serial.println(F(" Firmware: 2.0.0-UNO | Target: ATmega328P        "));
    Serial.println(F(" Active Sensors: Moisture (A0), HX711 (D2/D3),   "));
    Serial.println(F("                 HC-SR04 Proximity (D4/D5), Servo"));
    Serial.println(F(" Categories: Biodegradable / Non-Biodegradable   "));
    Serial.println(F(" Telemetry Format: JSON Lines (115200 baud)      "));
    Serial.println(F(" Send 'h' for interactive serial commands        "));
    Serial.println(F("=================================================="));
    Serial.println();
}

void serial_printTelemetryJSON(const SystemTelemetry& telem) {
    // Zero-allocation JSON Lines emitter designed for ATmega328P 2KB SRAM
    // Module A: Emits ultrasonic distance, proximity flag, and commanded lid state
    Serial.print(F("{\"v\":"));
    Serial.print(TELEMETRY_PROTOCOL_VER);

    Serial.print(F(",\"dev\":\""));
    Serial.print(F(DEVICE_ID));

    Serial.print(F("\",\"seq\":"));
    Serial.print(telem.sequenceNumber);

    Serial.print(F(",\"up\":"));
    Serial.print(telem.uptimeSeconds);

    // Ultrasonic proximity fields
    Serial.print(F(",\"dist_cm\":"));
    if (telem.proximity.status == SENSOR_OK) {
        Serial.print(telem.proximity.distanceCm, 1);
    } else {
        Serial.print(F("null"));
    }

    Serial.print(F(",\"prox\":"));
    Serial.print(telem.proximity.objectDetected ? F("true") : F("false"));

    // Lid command state
    Serial.print(F(",\"lid_cmd\":\""));
    switch (telem.lid.commandState) {
        case LID_OPEN:    Serial.print(F("OPEN")); break;
        case LID_OPENING: Serial.print(F("OPENING")); break;
        case LID_CLOSING: Serial.print(F("CLOSING")); break;
        default:          Serial.print(F("CLOSED")); break;
    }
    Serial.print(F("\""));

    // Fault array
    Serial.print(F(",\"faults\":["));
    bool firstFault = true;
    if (telem.faultBitmask & FAULT_ULTRASONIC_TIMEOUT) {
        Serial.print(F("\"ULTRASONIC_TIMEOUT\""));
        firstFault = false;
    }
    Serial.print(F("]}"));
    Serial.println(); // Trailing newline completes JSON Lines record
}

void serial_printHelp() {
    Serial.println(F("\n--- AVAILABLE SERIAL COMMANDS ---"));
    Serial.println(F("  t  : Tare HX711 load cell (zero point)"));
    Serial.println(F("  c  : Calibrate load cell with reference mass"));
    Serial.println(F("  m  : Calibrate moisture sensor air & water thresholds"));
    Serial.println(F("  o  : Force lid OPEN command"));
    Serial.println(F("  x  : Force lid CLOSE command"));
    Serial.println(F("  h  : Print this help menu"));
    Serial.println(F("---------------------------------\n"));
}

void serial_handleCommands() {
    if (!Serial.available()) return;

    char cmd = Serial.read();
    // Flush remaining characters
    while (Serial.available()) Serial.read();

    switch (cmd) {
        case 't':
        case 'T':
            Serial.println(F("[CMD] Taring load cell..."));
            sensors_tareWeight();
            Serial.println(F("[CMD] Tare complete."));
            break;

        case 'c':
        case 'C': {
            Serial.println(F("\n[CALIB] --- LOAD CELL CALIBRATION ---"));
            Serial.println(F("1. Ensure scale is EMPTY. Press any key to tare..."));
            while (!Serial.available()) { delay(10); }
            while (Serial.available()) Serial.read();

            sensors_tareWeight();
            Serial.println(F("Tare confirmed."));

            Serial.println(F("2. Place a KNOWN weight on load cell."));
            Serial.println(F("Enter weight in grams (e.g., 500):"));
            while (!Serial.available()) { delay(10); }
            float knownMass = Serial.parseFloat();
            while (Serial.available()) Serial.read();

            if (knownMass <= 0.0f) {
                Serial.println(F("[ERROR] Invalid mass entered. Calibration cancelled."));
                break;
            }

            Serial.print(F("Sampling with known mass: "));
            Serial.print(knownMass, 1);
            Serial.println(F("g..."));
            delay(1500);

            // Read raw units with scale=1.0f
            sensors_setWeightCalibration(1.0f);
            WeightReading wr = sensors_readWeight();
            if (wr.status == SENSOR_TIMEOUT || wr.rawValue == 0) {
                Serial.println(F("[ERROR] HX711 communication failed. Check wiring."));
                break;
            }

            float newFactor = (float)wr.rawValue / knownMass;
            sensors_setWeightCalibration(newFactor);

            Serial.print(F("[SUCCESS] New calibration factor: "));
            Serial.println(newFactor, 4);
            break;
        }

        case 'm':
        case 'M': {
            Serial.println(F("\n[CALIB] --- MOISTURE SENSOR CALIBRATION ---"));
            Serial.println(F("1. Hold sensor in DRY AIR. Press any key to record Air Raw..."));
            while (!Serial.available()) { delay(10); }
            while (Serial.available()) Serial.read();

            MoistureReading dryRead = sensors_readMoisture();
            int airRaw = dryRead.rawValue;
            Serial.print(F("Recorded Air Raw ADC: "));
            Serial.println(airRaw);

            Serial.println(F("2. Submerge sensor tip in WATER. Press any key to record Water Raw..."));
            while (!Serial.available()) { delay(10); }
            while (Serial.available()) Serial.read();

            MoistureReading wetRead = sensors_readMoisture();
            int waterRaw = wetRead.rawValue;
            Serial.print(F("Recorded Water Raw ADC: "));
            Serial.println(waterRaw);

            if (airRaw > waterRaw && waterRaw > 0) {
                sensors_setMoistureCalibration(airRaw, waterRaw);
                Serial.println(F("[SUCCESS] Moisture calibration stored."));
            } else {
                Serial.println(F("[ERROR] Invalid readings (Air Raw must be greater than Water Raw)."));
            }
            break;
        }

        case 'o':
        case 'O':
            Serial.println(F("[CMD] Manual Lid OPEN"));
            sensors_controlLid(LID_OPEN);
            break;

        case 'x':
        case 'X':
            Serial.println(F("[CMD] Manual Lid CLOSE"));
            sensors_controlLid(LID_CLOSED);
            break;

        case 'h':
        case 'H':
            serial_printHelp();
            break;

        default:
            break;
    }
}
