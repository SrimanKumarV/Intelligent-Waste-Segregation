/**
 * @file config.h
 * @brief Hardware pin mapping and system configuration
 *
 * INTELLIGENT SOLID WASTE SEGREGATION SYSTEM
 * Physical Target: Arduino Uno (ATmega328P, 5V Logic, 10-bit ADC 0-1023)
 *
 * Active Physical Hardware:
 *   1. Capacitive Soil Moisture Sensor (Analog A0)
 *   2. Load Cell + HX711 Amplifier (Digital D2 DOUT, D3 SCK)
 *   3. Ultrasonic Sensor HC-SR04 for Proximity Lid Opening (Digital D4 TRIG, D5 ECHO)
 *   4. Lid Actuator / Servo Motor (Digital D6 PWM)
 *   5. Status & Diagnostic LEDs (D13 Heartbeat, D7 Proximity, D8 Fault)
 *
 * Note: Arduino Uno provides native 5V I/O logic. Direct connection of
 * 5V HC-SR04 echo and HX711 is supported without voltage dividers.
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ============================================================================
// SYSTEM IDENTIFICATION & TELEMETRY PROTOCOL
// Module A: Dedicated Proximity Detection & Autonomous Lid Servo Controller
// ============================================================================
#define SYSTEM_NAME             "Intelligent Waste Segregation (Module A)"
#define FIRMWARE_VERSION        "2.1.0-UNO"
#define DEVICE_ID               "UNO-WS01"
#define TELEMETRY_PROTOCOL_VER  1
#define SERIAL_BAUD_RATE        115200

// ============================================================================
// ARDUINO UNO PIN ASSIGNMENTS
// ============================================================================

// --- Capacitive Soil Moisture Sensor ---
// Connect to 5V (or 3.3V) and GND. Analog Out connects to A0.
// On ATmega328P, 10-bit ADC returns 0 to 1023.
#define PIN_MOISTURE_ANALOG         A0

// --- Load Cell + HX711 Amplifier ---
// Connect HX711 VCC to 5V, GND to GND.
// DOUT and SCK are standard 5V digital I/O lines.
#define PIN_HX711_DOUT              2
#define PIN_HX711_SCK               3

// --- HC-SR04 Ultrasonic Sensor (Lid Proximity Detection) ---
// Connect VCC to 5V, GND to GND.
// On Arduino Uno, ECHO signal is 5V compatible.
#define PIN_ULTRASONIC_TRIG         4
#define PIN_ULTRASONIC_ECHO         5

// --- Lid Actuator (Servo Motor / Mechanism) ---
// Standard 5V servo PWM control signal on D6.
#define PIN_LID_SERVO               6

// --- Diagnostic & Status LEDs ---
#define PIN_LED_HEARTBEAT           13  // On-board LED: periodic heartbeat blink
#define PIN_LED_PROXIMITY           7   // Yellow/Amber LED: proximity active / lid open
#define PIN_LED_FAULT               8   // Red LED: sensor timeout / communication fault

// ============================================================================
// SENSOR CALIBRATION & THRESHOLDS
// ============================================================================

// --- Capacitive Moisture Sensor ---
// Capacitive sensors output lower voltage when wet.
// Dual-point calibration is required for accurate percentage.
// Default values are UNCALIBRATED placeholders.
#define MOISTURE_RAW_AIR_DEFAULT    620   // Measured raw ADC in dry air (0% moisture)
#define MOISTURE_RAW_WATER_DEFAULT  290   // Measured raw ADC submerged in water (100% moisture)
#define MOISTURE_ADC_MIN_VALID      50    // ADC below this indicates short to GND
#define MOISTURE_ADC_MAX_VALID      980   // ADC above this indicates open circuit / disconnected

// --- Load Cell + HX711 ---
// Calibration factor converts raw counts to grams:
//   weight_grams = (raw_counts - offset) / calibration_factor
// Must be calibrated with a known reference mass.
#define HX711_CALIBRATION_FACTOR_DEFAULT  420.0f  // UNCALIBRATED placeholder
#define HX711_TIMEOUT_MS                  500     // Non-blocking timeout
#define HX711_AVG_SAMPLES                 3       // Samples per reading for Uno stability
#define WEIGHT_MAX_CAPACITY_GRAMS         10000.0f// 10 kg maximum sanity limit
#define WEIGHT_MIN_VALID_GRAMS            2.0f    // Ignore tare jitter below 2g

// --- Ultrasonic Proximity Sensor for Lid Opening ---
// Detection distance threshold: Object within this distance triggers opening.
#define PROXIMITY_THRESHOLD_CM      20.0f   // Distance in cm to trigger lid opening
#define PROXIMITY_DEBOUNCE_COUNT    2       // Consecutive cycles required to trigger
#define ULTRASONIC_TIMEOUT_US       15000   // 15ms (~2.5m range) to avoid blocking Uno loop
#define ULTRASONIC_MIN_VALID_CM     2.0f    // Below 2cm is sensor blind spot
#define ULTRASONIC_MAX_VALID_CM     200.0f  // Max plausible distance for proximity detection

// --- Lid Actuation Parameters ---
#define LID_SERVO_CLOSED_ANGLE      0       // Degrees for closed lid
#define LID_SERVO_OPEN_ANGLE        90      // Degrees for fully open lid
#define LID_HOLD_OPEN_MS            4000    // Stay open for 4 seconds after object leaves
#define LID_COOLDOWN_MS             1500    // Delay after closing before re-triggering

// ============================================================================
// SYSTEM TIMING
// ============================================================================
#define TELEMETRY_INTERVAL_MS       1000    // Telemetry publication rate (1Hz)
#define PROXIMITY_CHECK_INTERVAL_MS 100     // Ultrasonic poll rate (10Hz)
#define HEARTBEAT_BLINK_INTERVAL_MS 500     // LED toggle rate

#endif // CONFIG_H
