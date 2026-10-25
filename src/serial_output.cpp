/**
 * @file serial_output.cpp
 * @brief Serial monitor output implementation
 *
 * Provides structured, readable serial output for debugging and
 * demonstration. Supports both human-readable and CSV formats.
 *
 * Sensor failures are explicitly reported — never silently shown as
 * valid zero readings.
 */

#include "serial_output.h"
#include "detection.h"
#include "leds.h"
#include "config.h"

// ============================================================================
// MODULE STATE
// ============================================================================
static unsigned long cycleCount = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

void serial_init() {
    Serial.begin(SERIAL_BAUD_RATE);
    while (!Serial && millis() < 3000) {
        ; // Wait for serial port (USB) — timeout after 3s
    }
    delay(100); // Allow serial to stabilise
}

// ============================================================================
// BANNER
// ============================================================================

void serial_printBanner() {
    Serial.println(F(""));
    Serial.println(F("╔══════════════════════════════════════════════════╗"));
    Serial.println(F("║  INTELLIGENT SOLID WASTE SEGREGATION SYSTEM     ║"));
    Serial.print(  F("║  Firmware Version: "));
    Serial.print(FIRMWARE_VERSION);
    Serial.println(F("                         ║"));
    Serial.println(F("║  Controller: ESP32                              ║"));
    Serial.println(F("╚══════════════════════════════════════════════════╝"));
    Serial.println(F(""));
    Serial.println(F("Sensors: Gas(1), Moisture(2), Metal(2), Weight/HX711(2), Level(2)"));
    Serial.println(F("Bins:    Biodegradable | Non-Biodegradable"));
    Serial.println(F(""));
    Serial.print(F("Gas warm-up time: "));
    Serial.print(GAS_WARMUP_TIME_MS / 1000);
    Serial.println(F(" seconds"));
    Serial.println(F("─────────────────────────────────────────────────────"));
}

// ============================================================================
// READINGS OUTPUT
// ============================================================================

static void printSensorValue(const char* label, int rawValue, SensorStatus status) {
    Serial.print(F("  "));
    Serial.print(label);
    Serial.print(F(": "));
    if (status == SENSOR_DISCONNECTED) {
        Serial.println(F("DISCONNECTED"));
    } else if (status == SENSOR_WARMING_UP) {
        Serial.print(rawValue);
        Serial.println(F(" (warming up)"));
    } else {
        Serial.println(rawValue);
    }
}

void serial_printReadings(const SystemData& data, const SystemAnalysis& analysis) {
    cycleCount++;

    // Timestamp
    unsigned long seconds = data.timestampMs / 1000;
    unsigned long minutes = seconds / 60;
    seconds %= 60;
    Serial.println(F(""));
    Serial.print(F("═══ Cycle #"));
    Serial.print(cycleCount);
    Serial.print(F(" | Uptime: "));
    Serial.print(minutes);
    Serial.print(F("m "));
    Serial.print(seconds);
    Serial.println(F("s ═══"));

    // --- Gas Sensor ---
    Serial.println(F("▸ GAS SENSOR (shared):"));
    Serial.print(F("  Raw: "));
    if (data.gas.status == SENSOR_DISCONNECTED) {
        Serial.println(F("DISCONNECTED"));
    } else {
        Serial.print(data.gas.rawValue);
        Serial.print(F(" | Digital: "));
        Serial.print(data.gas.digitalState ? "HIGH" : "LOW");
        Serial.print(F(" | Status: "));
        Serial.println(detection_sensorStatusToString(data.gas.status));
    }

    // --- Per-bin sensors ---
    const char* binNames[] = {"BIODEGRADABLE", "NON-BIODEGRADABLE"};
    for (int b = 0; b < BIN_COUNT; b++) {
        const BinData& bin = data.bins[b];
        const MismatchResult& result = analysis.binResults[b];

        Serial.println(F(""));
        Serial.print(F("▸ BIN: "));
        Serial.println(binNames[b]);

        // Moisture
        Serial.print(F("  Moisture:  Raw="));
        if (bin.moisture.status == SENSOR_DISCONNECTED) {
            Serial.println(F("DISCONNECTED"));
        } else {
            Serial.print(bin.moisture.rawValue);
            Serial.print(F(" | Level="));
            Serial.print(detection_moistureLevelToString(bin.moisture.level));
            Serial.print(F(" | Status="));
            Serial.println(detection_sensorStatusToString(bin.moisture.status));
        }

        // Metal
        Serial.print(F("  Metal:     "));
        if (bin.metal.status == SENSOR_DISCONNECTED) {
            Serial.println(F("DISCONNECTED"));
        } else {
            Serial.print(bin.metal.metalDetected ? "DETECTED" : "None");
            Serial.print(F(" | Raw Pin="));
            Serial.print(bin.metal.rawPinState ? "HIGH" : "LOW");
            Serial.print(F(" | Status="));
            Serial.println(detection_sensorStatusToString(bin.metal.status));
        }

        // Weight
        Serial.print(F("  Weight:    "));
        if (bin.weight.status == SENSOR_TIMEOUT) {
            Serial.println(F("TIMEOUT — HX711 not responding"));
        } else if (bin.weight.status == SENSOR_DISCONNECTED) {
            Serial.println(F("DISCONNECTED"));
        } else {
            Serial.print(bin.weight.weightGrams, 1);
            Serial.print(F(" g | Calibrated="));
            Serial.print(bin.weight.isCalibrated ? "Yes" : "NO");
            Serial.print(F(" | Status="));
            Serial.println(detection_sensorStatusToString(bin.weight.status));
        }

        // Level
        Serial.print(F("  Level:     "));
        if (bin.level.status == SENSOR_DISCONNECTED) {
            Serial.println(F("DISCONNECTED"));
        } else {
            Serial.print(bin.level.distanceCm, 1);
            Serial.print(F(" cm | Fill="));
            Serial.print(bin.level.fillPercentage, 0);
            Serial.print(F("% | Status="));
            Serial.println(detection_fillStatusToString(bin.level.fillStatus));
        }

        // Mismatch analysis
        Serial.print(F("  ▶ State:   "));
        Serial.println(detection_stateToString(result.systemState));
        Serial.print(F("  ▶ Score:   "));
        Serial.print(result.evidenceScore);
        Serial.print(F("/100 (heuristic) | Persist: "));
        Serial.print(result.persistenceCount);
        Serial.print(F("/"));
        Serial.println(MISMATCH_PERSISTENCE_COUNT);
        if (result.alertActive) {
            Serial.print(F("  ⚠ ALERT:   "));
            Serial.println(result.description);
        }
    }

    // --- LED Status ---
    Serial.println(F(""));
    Serial.print(F("▸ "));
    Serial.println(leds_getStateDescription());

    Serial.println(F("─────────────────────────────────────────────────────"));
}

// ============================================================================
// CSV OUTPUT
// ============================================================================

void serial_printCSVHeader() {
    Serial.print(F("timestamp_ms"));
    Serial.print(CSV_SEPARATOR);
    Serial.print(F("gas_raw,gas_status"));
    Serial.print(CSV_SEPARATOR);
    Serial.print(F("bio_moisture_raw,bio_moisture_level"));
    Serial.print(CSV_SEPARATOR);
    Serial.print(F("bio_metal,bio_weight_g,bio_fill_pct,bio_state,bio_score"));
    Serial.print(CSV_SEPARATOR);
    Serial.print(F("nonbio_moisture_raw,nonbio_moisture_level"));
    Serial.print(CSV_SEPARATOR);
    Serial.println(F("nonbio_metal,nonbio_weight_g,nonbio_fill_pct,nonbio_state,nonbio_score"));
}

void serial_printCSV(const SystemData& data, const SystemAnalysis& analysis) {
    Serial.print(data.timestampMs);

    Serial.print(CSV_SEPARATOR);
    Serial.print(data.gas.rawValue);
    Serial.print(CSV_SEPARATOR);
    Serial.print(detection_sensorStatusToString(data.gas.status));

    for (int b = 0; b < BIN_COUNT; b++) {
        const BinData& bin = data.bins[b];
        const MismatchResult& res = analysis.binResults[b];

        Serial.print(CSV_SEPARATOR);
        Serial.print(bin.moisture.rawValue);
        Serial.print(CSV_SEPARATOR);
        Serial.print(detection_moistureLevelToString(bin.moisture.level));
        Serial.print(CSV_SEPARATOR);
        Serial.print(bin.metal.metalDetected ? 1 : 0);
        Serial.print(CSV_SEPARATOR);
        Serial.print(bin.weight.weightGrams, 1);
        Serial.print(CSV_SEPARATOR);
        Serial.print(bin.level.fillPercentage, 0);
        Serial.print(CSV_SEPARATOR);
        Serial.print(detection_stateToString(res.systemState));
        Serial.print(CSV_SEPARATOR);
        Serial.print(res.evidenceScore);
    }
    Serial.println();
}

// ============================================================================
// FAULT SUMMARY
// ============================================================================

void serial_printFaults(const SystemAnalysis& analysis) {
    if (!analysis.anySensorFault && !analysis.anyCalibrationNeeded) {
        return; // No faults to report
    }

    Serial.println(F(""));
    Serial.println(F("⚠ SENSOR ISSUES:"));

    for (int b = 0; b < BIN_COUNT; b++) {
        uint8_t state = analysis.binResults[b].systemState;
        const char* name = (b == 0) ? "Bio" : "NonBio";

        if (state & STATE_SENSOR_FAULT) {
            Serial.print(F("  ["));
            Serial.print(name);
            Serial.println(F("] Sensor fault detected — check connections"));
        }
        if (state & STATE_CALIBRATION_NEEDED) {
            Serial.print(F("  ["));
            Serial.print(name);
            Serial.println(F("] Load cell calibration needed"));
        }
    }
}

void serial_printCalibrationStatus() {
    Serial.println(F(""));
    Serial.println(F("LOAD CELL CALIBRATION STATUS:"));
    Serial.println(F("  Both load cells use PLACEHOLDER calibration factors."));
    Serial.println(F("  Accurate weight readings require calibration with"));
    Serial.println(F("  known reference weights. See docs/CALIBRATION_GUIDE.md"));
}

void serial_printWarmupStatus(unsigned long elapsedMs, unsigned long totalMs) {
    int pct = (int)((elapsedMs * 100) / totalMs);
    if (pct > 100) pct = 100;
    Serial.print(F("\r  Gas sensor warm-up: "));
    Serial.print(pct);
    Serial.print(F("% ("));
    Serial.print(elapsedMs / 1000);
    Serial.print(F("/"));
    Serial.print(totalMs / 1000);
    Serial.print(F("s)"));
    if (pct >= 100) {
        Serial.println(F(" — READY"));
    }
}
