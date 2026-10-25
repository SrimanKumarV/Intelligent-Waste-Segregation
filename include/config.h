/**
 * @file config.h
 * @brief Hardware pin mapping and system configuration
 *
 * INTELLIGENT SOLID WASTE SEGREGATION SYSTEM
 *
 * This file defines all GPIO assignments, sensor thresholds, timing
 * constants, and calibration defaults. All hardware-specific values
 * are centralised here for easy modification.
 *
 * ESP32 DevKit V1 (30-pin) assumed. If using a 38-pin variant or
 * different board, review GPIO availability and reassign as needed.
 *
 * IMPORTANT GPIO NOTES:
 * - GPIO 0, 2, 5, 12, 15: Have boot-strapping functions. Avoid for
 *   critical inputs that might interfere with boot.
 * - GPIO 6–11: Connected to on-board SPI flash. DO NOT USE.
 * - GPIO 34, 35, 36 (VP), 39 (VN): Input-only, no internal pull-up.
 * - ADC2 pins (GPIO 0,2,4,12-15,25-27) cannot be used with WiFi active.
 * - ADC1 pins (GPIO 32-39) are safe for analog reads even with WiFi.
 * - ESP32 GPIOs are 3.3V logic. Use level shifters for 5V sensors.
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// ============================================================================
// SYSTEM IDENTIFICATION
// ============================================================================
#define SYSTEM_NAME       "Intelligent Waste Segregation"
#define FIRMWARE_VERSION  "1.0.0"
#define SERIAL_BAUD_RATE  115200

// ============================================================================
// GPIO PIN ASSIGNMENTS
// ============================================================================
// Each assignment documents: Component | Signal type | ESP32 GPIO | Notes
//
// ADC1 channel pins used for analog sensors (safe with WiFi):
//   GPIO 32, 33, 34, 35, 36, 39

// --- Gas Sensor (e.g., MQ-2 / MQ-4 / MQ-135) ---
// Analog output connected to ADC1. Digital output optionally available.
// CAUTION: MQ-series modules often output 0–5V analog. The ESP32 ADC
// tolerates only 0–3.3V. If your module's output exceeds 3.3V, use a
// voltage divider (e.g., 2kΩ + 1kΩ) to scale it down.
#define GAS_SENSOR_ANALOG_PIN     36  // ADC1_CH0 (VP), input-only
#define GAS_SENSOR_DIGITAL_PIN    23  // Optional digital threshold output

// --- Moisture Sensor 1: Biodegradable Bin ---
// Capacitive or resistive soil moisture sensor. Analog output.
// Typical output: 0 (wet) to 4095 (dry) for capacitive; reversed for resistive.
// Verify polarity with your specific module.
#define MOISTURE_BIO_PIN          39  // ADC1_CH3 (VN), input-only

// --- Moisture Sensor 2: Non-Biodegradable Bin ---
#define MOISTURE_NONBIO_PIN       34  // ADC1_CH6, input-only

// --- Metal Sensor 1: Biodegradable Bin ---
// Inductive proximity sensor or metal detector module.
// Typical output: Digital LOW when metal detected, HIGH when no metal.
// Verify output polarity with your specific module.
#define METAL_BIO_PIN             18  // Digital input

// --- Metal Sensor 2: Non-Biodegradable Bin ---
#define METAL_NONBIO_PIN          19  // Digital input

// --- Load Cell 1 + HX711: Biodegradable Bin ---
// HX711 requires two digital pins: DOUT (data) and SCK (clock).
// Do NOT connect load cells directly to ESP32 analog pins.
#define HX711_BIO_DOUT_PIN        16  // HX711 data out
#define HX711_BIO_SCK_PIN        4   // HX711 clock

// --- Load Cell 2 + HX711: Non-Biodegradable Bin ---
#define HX711_NONBIO_DOUT_PIN     17  // HX711 data out
#define HX711_NONBIO_SCK_PIN      5   // HX711 clock (GPIO5 has weak pull-up at boot)

// --- Bin Level Sensor 1: Biodegradable Bin ---
// Ultrasonic (HC-SR04) requires TRIG (output) and ECHO (input).
// HC-SR04 operates at 5V but ECHO output is 5V — use a voltage divider
// (e.g., 1kΩ + 2kΩ) to bring ECHO signal to ~3.3V for ESP32.
// Alternative: IR proximity sensor with digital output.
#define LEVEL_BIO_TRIG_PIN        26  // Ultrasonic trigger (output)
#define LEVEL_BIO_ECHO_PIN        25  // Ultrasonic echo (input) — USE VOLTAGE DIVIDER

// --- Bin Level Sensor 2: Non-Biodegradable Bin ---
#define LEVEL_NONBIO_TRIG_PIN     27  // Ultrasonic trigger (output)
#define LEVEL_NONBIO_ECHO_PIN     14  // Ultrasonic echo (input) — USE VOLTAGE DIVIDER

// --- LED Indicators ---
// Use current-limiting resistors (220Ω–330Ω) in series with each LED.
// ESP32 GPIO can source ~12mA safely; standard LEDs draw 10–20mA.
#define LED_SYSTEM_OK_PIN         2   // On-board LED (most ESP32 boards) — Green
#define LED_BIO_MISMATCH_PIN      13  // Biodegradable bin mismatch warning — Red
#define LED_NONBIO_MISMATCH_PIN   15  // Non-biodegradable bin mismatch warning — Red
#define LED_BIN_FULL_PIN          33  // Bin full / near capacity — Yellow/Amber
#define LED_SENSOR_FAULT_PIN      32  // Sensor fault indicator — Red (blinking)

// ============================================================================
// SENSOR CONFIGURATION
// ============================================================================

// --- Gas Sensor ---
// Warm-up time for MQ-series sensors (typically 20–60 seconds for stable readings)
#define GAS_WARMUP_TIME_MS        30000   // 30 seconds
// Threshold above which gas is considered significantly detected
// This is a RAW ADC value (0–4095, 12-bit). Calibrate with actual sensor.
#define GAS_THRESHOLD_HIGH        1500    // UNCALIBRATED DEFAULT — adjust after testing
#define GAS_THRESHOLD_LOW         800     // Below this: minimal gas detected

// --- Moisture Sensors ---
// ADC raw value thresholds. ESP32 12-bit ADC: 0–4095.
// For CAPACITIVE sensors: lower value = wetter (verify with your module).
// For RESISTIVE sensors: lower value = drier (verify with your module).
//
// Set MOISTURE_POLARITY_INVERTED to true if lower raw values mean MORE moisture.
#define MOISTURE_POLARITY_INVERTED  true  // true for typical capacitive sensors
#define MOISTURE_THRESHOLD_WET      1500  // Below this (if inverted): considered wet
#define MOISTURE_THRESHOLD_DRY      3000  // Above this (if inverted): considered dry
// Between WET and DRY thresholds: intermediate moisture

// --- Metal Sensors ---
// Output polarity when metal is detected. Set to match your sensor module.
// true  = sensor outputs LOW when metal detected (common for NPN proximity)
// false = sensor outputs HIGH when metal detected
#define METAL_ACTIVE_LOW           true

// --- Load Cell / HX711 ---
// Calibration factor converts raw HX711 counts to grams.
// Determine this by calibrating with a known reference weight.
// calibration_factor = raw_reading_with_weight / known_weight_grams
// These are PLACEHOLDER defaults. You MUST calibrate with your actual load cells.
#define HX711_BIO_CALIBRATION_FACTOR      420.0f   // UNCALIBRATED — placeholder
#define HX711_NONBIO_CALIBRATION_FACTOR   420.0f   // UNCALIBRATED — placeholder
// Maximum weight capacity (grams) — for sanity checking
#define WEIGHT_MAX_CAPACITY_GRAMS         10000.0f  // 10 kg
// Minimum valid weight (below this, treat as empty or tare drift)
#define WEIGHT_MIN_VALID_GRAMS            5.0f
// HX711 read timeout (milliseconds)
#define HX711_TIMEOUT_MS                  1000
// Number of readings to average for stable weight
#define HX711_AVG_READINGS                5

// --- Bin Level Sensors (Ultrasonic HC-SR04) ---
// Distance from sensor to bottom of empty bin (cm)
#define BIN_DEPTH_CM                      40.0f
// Thresholds as percentage of bin capacity (0% = empty, 100% = full)
#define BIN_LEVEL_NEAR_FULL_PCT           75.0f   // ≥75% = nearing capacity
#define BIN_LEVEL_FULL_PCT                90.0f   // ≥90% = full
// Maximum valid distance reading (cm) — beyond this, sensor error
#define ULTRASONIC_MAX_DISTANCE_CM        60.0f
// Minimum valid distance reading (cm) — below this, likely obstruction
#define ULTRASONIC_MIN_DISTANCE_CM        2.0f
// Ultrasonic timeout (microseconds) for pulseIn
#define ULTRASONIC_TIMEOUT_US             30000

// ============================================================================
// DECISION LOGIC CONFIGURATION
// ============================================================================

// Number of consecutive readings required before triggering a mismatch alert
// This reduces false positives from momentary sensor noise
#define MISMATCH_PERSISTENCE_COUNT        3

// Confidence/evidence scoring weights (heuristic, not statistically validated)
// These weights sum the evidence from different sensors to form a score.
// A higher total score indicates stronger evidence of a mismatch.
#define EVIDENCE_WEIGHT_METAL             40   // Metal in bio bin is strong evidence
#define EVIDENCE_WEIGHT_MOISTURE          20   // Moisture contribution
#define EVIDENCE_WEIGHT_GAS               15   // Gas contribution
// Threshold score above which a POSSIBLE_MISMATCH is flagged
#define MISMATCH_SCORE_THRESHOLD          30

// ============================================================================
// TIMING AND FILTERING
// ============================================================================

// Main loop cycle interval (milliseconds)
#define MONITORING_INTERVAL_MS            2000  // 2 seconds between full readings

// Analog reading averaging (number of samples per sensor read)
#define ANALOG_AVG_SAMPLES                10

// LED blink interval for fault indication (milliseconds)
#define LED_BLINK_INTERVAL_MS             500

// ============================================================================
// SERIAL OUTPUT CONFIGURATION
// ============================================================================

// Enable CSV output mode (for data logging / analysis)
#define CSV_OUTPUT_ENABLED                false

// Separator for CSV output
#define CSV_SEPARATOR                     ","

// Print header row interval (every N cycles, reprint header for readability)
#define SERIAL_HEADER_INTERVAL            20

#endif // CONFIG_H
