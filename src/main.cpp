/**
 * @file main.cpp
 * @brief Main application — Intelligent Solid Waste Segregation System
 *
 * Entry point for the ESP32 firmware. Coordinates sensor acquisition,
 * waste mismatch detection, LED indication, and serial diagnostics.
 *
 * OPERATION FLOW:
 * 1. Initialise all subsystems (serial, sensors, detection, LEDs)
 * 2. Run LED self-test
 * 3. Wait for gas sensor warm-up
 * 4. Enter main monitoring loop:
 *    a. Read all sensors
 *    b. Analyse readings for mismatch detection
 *    c. Update LED indicators
 *    d. Output readings to serial monitor
 *    e. Wait for next cycle interval
 *
 * SERIAL COMMANDS (for calibration and diagnostics):
 *   't' or 'T' — Tare both load cells (set zero point)
 *   'c' or 'C' — Enter calibration mode (interactive)
 *   'r' or 'R' — Reset mismatch persistence counters
 *   'v' or 'V' — Toggle CSV output mode
 *   'h' or 'H' — Print help
 */

#include <Arduino.h>
#include "config.h"
#include "sensor_types.h"
#include "sensors.h"
#include "detection.h"
#include "leds.h"
#include "serial_output.h"

// ============================================================================
// MODULE STATE
// ============================================================================

static bool csvMode = CSV_OUTPUT_ENABLED;
static bool csvHeaderPrinted = false;
static unsigned long lastReadingMs = 0;

// ============================================================================
// SERIAL COMMAND HANDLING
// ============================================================================

/**
 * Interactive load cell calibration via serial.
 * Guides the user through placing a known weight and computing
 * the calibration factor.
 */
static void runCalibrationMode() {
    Serial.println(F(""));
    Serial.println(F("╔══════════════════════════════════════╗"));
    Serial.println(F("║  LOAD CELL CALIBRATION MODE         ║"));
    Serial.println(F("╚══════════════════════════════════════╝"));
    Serial.println(F(""));
    Serial.println(F("Which load cell to calibrate?"));
    Serial.println(F("  1 = Biodegradable bin"));
    Serial.println(F("  2 = Non-biodegradable bin"));
    Serial.println(F("  x = Cancel"));
    Serial.println(F(""));

    // Wait for user input
    while (!Serial.available()) { delay(10); }
    char choice = Serial.read();
    // Flush remaining input
    while (Serial.available()) Serial.read();

    BinType bin;
    if (choice == '1') {
        bin = BIN_BIODEGRADABLE;
        Serial.println(F("Selected: Biodegradable bin"));
    } else if (choice == '2') {
        bin = BIN_NON_BIODEGRADABLE;
        Serial.println(F("Selected: Non-biodegradable bin"));
    } else {
        Serial.println(F("Calibration cancelled."));
        return;
    }

    // Step 1: Tare
    Serial.println(F(""));
    Serial.println(F("Step 1: Remove ALL items from the bin."));
    Serial.println(F("Press any key when the bin is empty..."));
    while (!Serial.available()) { delay(10); }
    while (Serial.available()) Serial.read();

    sensors_tareWeight(bin);
    Serial.println(F("Tare complete."));

    // Step 2: Place known weight
    Serial.println(F(""));
    Serial.println(F("Step 2: Place a KNOWN weight on the load cell."));
    Serial.println(F("Enter the weight in grams (e.g., 500):"));

    while (!Serial.available()) { delay(10); }
    float knownWeight = Serial.parseFloat();
    while (Serial.available()) Serial.read();

    if (knownWeight <= 0) {
        Serial.println(F("Invalid weight. Calibration cancelled."));
        return;
    }

    Serial.print(F("Known weight: "));
    Serial.print(knownWeight, 1);
    Serial.println(F(" g"));
    Serial.println(F("Reading load cell... (keep weight stable)"));
    delay(2000); // Let the reading stabilise

    // Read raw value
    WeightReading wr = sensors_readWeight(bin);
    if (wr.status == SENSOR_TIMEOUT) {
        Serial.println(F("ERROR: HX711 not responding. Check wiring."));
        return;
    }

    // Calculate calibration factor
    // The HX711 library's set_scale() uses: weight = (raw - offset) / scale
    // So: scale = (raw - offset) / known_weight
    // We can use get_units() which already accounts for tare offset
    // If current scale is 1.0, get_units returns raw-offset value
    sensors_setCalibrationFactor(bin, 1.0f); // Temporarily set scale to 1
    delay(500);
    WeightReading rawReading = sensors_readWeight(bin);
    float rawUnits = rawReading.weightGrams;

    if (rawUnits == 0) {
        Serial.println(F("ERROR: Zero reading. Is the weight on the load cell?"));
        return;
    }

    float calibFactor = rawUnits / knownWeight;
    sensors_setCalibrationFactor(bin, calibFactor);

    Serial.println(F(""));
    Serial.print(F("✓ Calibration factor: "));
    Serial.println(calibFactor, 4);

    // Verify
    delay(1000);
    WeightReading verify = sensors_readWeight(bin);
    Serial.print(F("✓ Verification reading: "));
    Serial.print(verify.weightGrams, 1);
    Serial.print(F(" g (expected: "));
    Serial.print(knownWeight, 1);
    Serial.println(F(" g)"));

    float error = abs(verify.weightGrams - knownWeight);
    float errorPct = (error / knownWeight) * 100.0f;
    Serial.print(F("  Error: "));
    Serial.print(error, 1);
    Serial.print(F(" g ("));
    Serial.print(errorPct, 1);
    Serial.println(F("%)"));

    Serial.println(F(""));
    Serial.println(F("IMPORTANT: Note this calibration factor and update"));
    Serial.println(F("config.h if you want it to persist across reboots."));
    Serial.println(F("Calibration complete."));
    Serial.println(F(""));
}

/**
 * Process serial commands from the user.
 */
static void handleSerialCommands() {
    if (!Serial.available()) return;

    char cmd = Serial.read();
    // Flush remaining input
    while (Serial.available()) Serial.read();

    switch (cmd) {
        case 't':
        case 'T':
            Serial.println(F("Taring both load cells..."));
            sensors_tareWeight(BIN_BIODEGRADABLE);
            sensors_tareWeight(BIN_NON_BIODEGRADABLE);
            Serial.println(F("Tare complete."));
            break;

        case 'c':
        case 'C':
            runCalibrationMode();
            break;

        case 'r':
        case 'R':
            Serial.println(F("Resetting mismatch persistence counters..."));
            detection_resetPersistence(BIN_BIODEGRADABLE);
            detection_resetPersistence(BIN_NON_BIODEGRADABLE);
            break;

        case 'v':
        case 'V':
            csvMode = !csvMode;
            csvHeaderPrinted = false;
            Serial.print(F("CSV output mode: "));
            Serial.println(csvMode ? "ENABLED" : "DISABLED");
            break;

        case 'h':
        case 'H':
            Serial.println(F(""));
            Serial.println(F("COMMANDS:"));
            Serial.println(F("  t/T — Tare both load cells"));
            Serial.println(F("  c/C — Calibration mode"));
            Serial.println(F("  r/R — Reset mismatch alerts"));
            Serial.println(F("  v/V — Toggle CSV output"));
            Serial.println(F("  h/H — This help"));
            Serial.println(F(""));
            break;

        default:
            break;
    }
}

// ============================================================================
// ARDUINO SETUP
// ============================================================================

void setup() {
    // 1. Initialise serial communication
    serial_init();
    serial_printBanner();

    // 2. Initialise LED outputs and run self-test
    leds_init();
    leds_selfTest();

    // 3. Initialise detection module
    detection_init();

    // 4. Initialise all sensors (including HX711 tare)
    sensors_init();
    serial_printCalibrationStatus();

    // 5. Gas sensor warm-up period
    Serial.println(F(""));
    Serial.println(F("Waiting for gas sensor warm-up..."));
    while (!sensors_gasWarmupComplete()) {
        unsigned long elapsed = millis();
        serial_printWarmupStatus(elapsed, GAS_WARMUP_TIME_MS);

        // Keep LEDs updated during warm-up (show warming state)
        SystemData warmupData = {};
        warmupData.timestampMs = millis();
        warmupData.gas.status = SENSOR_WARMING_UP;
        SystemAnalysis warmupAnalysis = {};
        warmupAnalysis.systemWarmingUp = true;
        leds_update(warmupAnalysis);

        delay(1000);

        // Allow serial commands during warm-up
        handleSerialCommands();
    }
    Serial.println(F(""));
    Serial.println(F("Gas sensor warm-up complete. Starting monitoring."));
    Serial.println(F("Send 'h' for available commands."));
    Serial.println(F("═══════════════════════════════════════════════════"));
}

// ============================================================================
// ARDUINO MAIN LOOP
// ============================================================================

void loop() {
    // Handle serial commands (non-blocking)
    handleSerialCommands();

    // Check if it's time for the next reading cycle
    unsigned long now = millis();
    if (now - lastReadingMs < MONITORING_INTERVAL_MS) {
        return; // Not yet time — yield to other tasks
    }
    lastReadingMs = now;

    // 1. Read all sensors
    SystemData data = sensors_readAll();

    // 2. Analyse readings
    SystemAnalysis analysis = detection_analyse(data);

    // 3. Update LED indicators
    leds_update(analysis);

    // 4. Output to serial
    if (csvMode) {
        if (!csvHeaderPrinted) {
            serial_printCSVHeader();
            csvHeaderPrinted = true;
        }
        serial_printCSV(data, analysis);
    } else {
        serial_printReadings(data, analysis);
    }

    // 5. Print fault summary if any issues
    serial_printFaults(analysis);
}
