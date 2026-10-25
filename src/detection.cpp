/**
 * @file detection.cpp
 * @brief Waste mismatch detection logic implementation
 *
 * Rule-based detection with configurable thresholds and persistence
 * checking to reduce false alerts from sensor noise.
 *
 * IMPORTANT: These sensors cannot conclusively identify every waste
 * material. Detection results are heuristic indicators. The evidence
 * score is a weighted sum, NOT a statistically validated probability.
 *
 * DETECTION RULES:
 *
 * Biodegradable Bin:
 *   - Metal detected → strong evidence of mismatch (non-biodegradable
 *     item in wrong bin)
 *   - Moisture and gas readings provide supporting context but alone
 *     do not classify waste type
 *
 * Non-Biodegradable Bin:
 *   - High moisture + elevated gas → possible unwanted biodegradable
 *     material present
 *   - Metal detection is NORMAL in this bin (not an error indicator)
 *   - A wet item is NOT automatically classified as biodegradable
 *   - A dry item is NOT automatically classified as non-biodegradable
 */

#include "detection.h"
#include "config.h"

// ============================================================================
// MODULE STATE
// ============================================================================

// Persistence counters: track consecutive cycles with mismatch evidence
static int persistenceCount[BIN_COUNT] = {0, 0};

// Previous cycle states (for recovery detection)
static uint8_t previousState[BIN_COUNT] = {STATE_NORMAL, STATE_NORMAL};

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Calculate evidence score for biodegradable bin mismatch.
 *
 * Primary indicator: Metal detection (non-bio item in bio bin)
 * Supporting indicators: Moisture and gas context
 */
static int calculateBioMismatchScore(const BinData& bin, const GasReading& gas) {
    int score = 0;

    // PRIMARY: Metal detected in biodegradable bin
    if (bin.metal.status == SENSOR_OK && bin.metal.metalDetected) {
        score += EVIDENCE_WEIGHT_METAL;
    }

    // SUPPORTING: Gas sensor context
    // Elevated gas in bio bin is expected (decomposition), so gas alone
    // does NOT indicate mismatch. However, absence of gas with metal
    // detection reinforces mismatch evidence (likely inorganic waste).
    if (gas.status == SENSOR_OK) {
        if (bin.metal.metalDetected && !gas.aboveThreshold) {
            // Metal + no gas = more likely a non-biodegradable item
            score += EVIDENCE_WEIGHT_GAS;
        }
    }

    // SUPPORTING: Moisture context
    // Dry conditions with metal detection are additional evidence of
    // non-biodegradable material in the bio bin.
    if (bin.moisture.status == SENSOR_OK) {
        if (bin.metal.metalDetected && bin.moisture.level == MOISTURE_DRY) {
            score += EVIDENCE_WEIGHT_MOISTURE;
        }
    }

    return score;
}

/**
 * Calculate evidence score for non-biodegradable bin mismatch.
 *
 * Primary indicators: High moisture + gas (possible organic waste)
 * Metal detection is NOT an error in this bin.
 */
static int calculateNonBioMismatchScore(const BinData& bin, const GasReading& gas) {
    int score = 0;

    // IMPORTANT: Metal detection in the non-bio bin is EXPECTED and
    // normal. It does NOT contribute to mismatch evidence.

    // Moisture indicator
    if (bin.moisture.status == SENSOR_OK && bin.moisture.level == MOISTURE_WET) {
        score += EVIDENCE_WEIGHT_MOISTURE;
    }

    // Gas indicator
    if (gas.status == SENSOR_OK && gas.aboveThreshold) {
        score += EVIDENCE_WEIGHT_GAS;
    }

    // Combined moisture + gas is stronger evidence
    if (bin.moisture.status == SENSOR_OK && bin.moisture.level == MOISTURE_WET &&
        gas.status == SENSOR_OK && gas.aboveThreshold) {
        // Bonus for combined evidence
        score += 15;
    }

    return score;
}

/**
 * Generate human-readable mismatch description.
 */
static String buildDescription(BinType bin, int score, const BinData& binData,
                                const GasReading& gas) {
    if (score < MISMATCH_SCORE_THRESHOLD) {
        return "No mismatch indicators detected";
    }

    String desc = "";
    if (bin == BIN_BIODEGRADABLE) {
        if (binData.metal.status == SENSOR_OK && binData.metal.metalDetected) {
            desc += "Metal detected in biodegradable bin. ";
        }
        if (binData.moisture.status == SENSOR_OK && binData.moisture.level == MOISTURE_DRY) {
            desc += "Material appears dry. ";
        }
        if (gas.status == SENSOR_OK && !gas.aboveThreshold) {
            desc += "No significant gas emission. ";
        }
        desc += "Possible non-biodegradable item.";
    } else {
        if (binData.moisture.status == SENSOR_OK && binData.moisture.level == MOISTURE_WET) {
            desc += "Significant moisture detected. ";
        }
        if (gas.status == SENSOR_OK && gas.aboveThreshold) {
            desc += "Elevated gas levels detected. ";
        }
        desc += "Possible biodegradable material in non-biodegradable bin.";
    }

    return desc;
}

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

void detection_init() {
    for (int i = 0; i < BIN_COUNT; i++) {
        persistenceCount[i] = 0;
        previousState[i] = STATE_NORMAL;
    }
    Serial.println(F("[DETECT] Detection module initialised"));
}

SystemAnalysis detection_analyse(const SystemData& data) {
    SystemAnalysis analysis;
    analysis.timestampMs = data.timestampMs;
    analysis.anySensorFault = false;
    analysis.anyCalibrationNeeded = false;
    analysis.systemWarmingUp = (data.gas.status == SENSOR_WARMING_UP);

    for (int b = 0; b < BIN_COUNT; b++) {
        BinType binType = (BinType)b;
        MismatchResult& result = analysis.binResults[b];
        const BinData& bin = data.bins[b];

        result.binType = binType;
        result.systemState = STATE_NORMAL;

        // --- Check for sensor faults ---
        bool hasFault = false;
        if (bin.moisture.status == SENSOR_DISCONNECTED) hasFault = true;
        if (bin.metal.status == SENSOR_DISCONNECTED) hasFault = true;
        if (bin.weight.status == SENSOR_TIMEOUT ||
            bin.weight.status == SENSOR_DISCONNECTED) hasFault = true;
        if (bin.level.status == SENSOR_DISCONNECTED) hasFault = true;
        if (data.gas.status == SENSOR_DISCONNECTED) hasFault = true;

        if (hasFault) {
            result.systemState |= STATE_SENSOR_FAULT;
            analysis.anySensorFault = true;
        }

        // --- Check calibration status ---
        if (bin.weight.status == SENSOR_NOT_CALIBRATED || !bin.weight.isCalibrated) {
            result.systemState |= STATE_CALIBRATION_NEEDED;
            analysis.anyCalibrationNeeded = true;
        }

        // --- Check bin fill level ---
        if (bin.level.status == SENSOR_OK) {
            if (bin.level.fillStatus == BIN_FULL) {
                result.systemState |= STATE_BIN_FULL;
            } else if (bin.level.fillStatus == BIN_NEAR_CAPACITY) {
                result.systemState |= STATE_BIN_NEAR_CAPACITY;
            }
        }

        // --- Mismatch detection ---
        int score = 0;
        if (binType == BIN_BIODEGRADABLE) {
            score = calculateBioMismatchScore(bin, data.gas);
        } else {
            score = calculateNonBioMismatchScore(bin, data.gas);
        }
        result.evidenceScore = score;

        // Apply persistence checking
        if (score >= MISMATCH_SCORE_THRESHOLD) {
            persistenceCount[b]++;
        } else {
            // Reset persistence if mismatch is no longer detected
            // (allow gradual recovery)
            if (persistenceCount[b] > 0) {
                persistenceCount[b]--;
            }
        }
        result.persistenceCount = persistenceCount[b];

        // Alert is active only after sustained detection
        if (persistenceCount[b] >= MISMATCH_PERSISTENCE_COUNT) {
            result.systemState |= STATE_POSSIBLE_MISMATCH;
            result.alertActive = true;
        } else {
            result.alertActive = false;
        }

        // Build description
        result.description = buildDescription(binType, score, bin, data.gas);

        // Warming up
        if (analysis.systemWarmingUp) {
            result.systemState |= STATE_SYSTEM_WARMING_UP;
        }

        // Store state for next cycle
        previousState[b] = result.systemState;
    }

    return analysis;
}

void detection_resetPersistence(BinType bin) {
    if (bin < BIN_COUNT) {
        persistenceCount[bin] = 0;
        Serial.print(F("[DETECT] Persistence reset for bin: "));
        Serial.println(bin == BIN_BIODEGRADABLE ? "Bio" : "NonBio");
    }
}

String detection_stateToString(uint8_t stateFlags) {
    if (stateFlags == STATE_NORMAL) return "NORMAL";

    String result = "";
    if (stateFlags & STATE_POSSIBLE_MISMATCH)  result += "POSSIBLE_MISMATCH ";
    if (stateFlags & STATE_BIN_NEAR_CAPACITY)   result += "BIN_NEAR_CAPACITY ";
    if (stateFlags & STATE_BIN_FULL)            result += "BIN_FULL ";
    if (stateFlags & STATE_SENSOR_FAULT)        result += "SENSOR_FAULT ";
    if (stateFlags & STATE_CALIBRATION_NEEDED)  result += "CALIBRATION_NEEDED ";
    if (stateFlags & STATE_SYSTEM_WARMING_UP)   result += "WARMING_UP ";

    result.trim();
    return result;
}

String detection_fillStatusToString(BinFillStatus status) {
    switch (status) {
        case BIN_EMPTY:          return "EMPTY";
        case BIN_NORMAL:         return "NORMAL";
        case BIN_NEAR_CAPACITY:  return "NEAR_CAPACITY";
        case BIN_FULL:           return "FULL";
        case BIN_LEVEL_UNKNOWN:  return "UNKNOWN";
        default:                 return "INVALID";
    }
}

String detection_sensorStatusToString(SensorStatus status) {
    switch (status) {
        case SENSOR_OK:             return "OK";
        case SENSOR_DISCONNECTED:   return "DISCONNECTED";
        case SENSOR_OUT_OF_RANGE:   return "OUT_OF_RANGE";
        case SENSOR_NOT_CALIBRATED: return "NOT_CALIBRATED";
        case SENSOR_WARMING_UP:     return "WARMING_UP";
        case SENSOR_TIMEOUT:        return "TIMEOUT";
        default:                    return "UNKNOWN";
    }
}

String detection_moistureLevelToString(MoistureLevel level) {
    switch (level) {
        case MOISTURE_DRY:          return "DRY";
        case MOISTURE_INTERMEDIATE: return "INTERMEDIATE";
        case MOISTURE_WET:          return "WET";
        case MOISTURE_UNKNOWN:      return "UNKNOWN";
        default:                    return "INVALID";
    }
}
