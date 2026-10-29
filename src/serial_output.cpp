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
#include "lcd_display.h"

void serial_init() {
    Serial.begin(SERIAL_BAUD_RATE);
    // On Arduino Uno, delay briefly to let serial lines stabilize
    delay(100);
}

void serial_printBanner() {
    Serial.println();
    Serial.println(F("=================================================="));
    Serial.println(F(" INTELLIGENT WASTE SEGREGATION ANALYTICS (UNO)   "));
    Serial.println(F(" Firmware: 2.1.0-UNO | Target: ATmega328P        "));
    Serial.println(F(" Role: Module A (Proximity & Autonomous Lid)     "));
    Serial.println(F(" Hardware: HC-SR04 (D4/D5), Servo (D6), LEDs, LCD"));
    Serial.println(F(" Telemetry Format: JSON Lines (115200 baud)      "));
    Serial.println(F(" Send 'h' for help, 'o'/'x' for lid commands      "));
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
    Serial.println(F("\n--- AVAILABLE SERIAL COMMANDS (UNO - MODULE A) ---"));
    Serial.println(F("  o  : Force lid OPEN command"));
    Serial.println(F("  x  : Force lid CLOSE command"));
    Serial.println(F("  s  : Request Uno device status and LCD presence"));
    Serial.println(F("  h  : Print this help menu"));
    Serial.println(F("  [Note: C1, C2, LC1, LC2 calibration commands belong to ESP32]"));
    Serial.println(F("---------------------------------------------------\n"));
}

void serial_handleCommands() {
    if (!Serial.available()) return;

    char cmd = Serial.read();
    // Flush remaining characters
    while (Serial.available()) Serial.read();

    switch (cmd) {
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

        case 's':
        case 'S':
            Serial.print(F("{\"dev\":\""));
            Serial.print(F(DEVICE_ID));
            Serial.print(F("\",\"firmware\":\"2.1.0-UNO\",\"role\":\"MODULE_A_LID_CTRL\""));
            Serial.print(F(",\"lcd_detected\":"));
            Serial.print(lcd_isHardwareDetected() ? F("true") : F("false"));
            Serial.println(F("}"));
            break;

        case 'h':
        case 'H':
            serial_printHelp();
            break;

        case 't':
        case 'T':
        case 'c':
        case 'C':
        case 'm':
        case 'M':
#ifdef ENABLE_UNO_LEGACY_SENSORS
            if (cmd == 't' || cmd == 'T') {
                Serial.println(F("[CMD] Legacy Taring load cell..."));
                sensors_tareWeight();
            }
#else
            Serial.println(F("[INFO] Capacitive moisture (C1/C2) and load cells (LC1/LC2) reside on Module B (ESP32)."));
            Serial.println(F("[INFO] Send calibration commands directly to the ESP32 serial interface."));
#endif
            break;

        default:
            break;
    }
}
