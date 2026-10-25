/**
 * @file detection.h
 * @brief Waste mismatch detection module interface
 *
 * Implements rule-based waste segregation error detection.
 * The detection logic is separated from sensor acquisition to allow
 * independent testing with simulated inputs.
 *
 * IMPORTANT: These sensors cannot conclusively identify every waste
 * material. The detection results are heuristic indicators, not
 * definitive classifications. False positives and false negatives
 * are expected and should be documented during testing.
 */

#ifndef DETECTION_H
#define DETECTION_H

#include "sensor_types.h"

// ============================================================================
// DETECTION ENGINE
// ============================================================================

/** Initialise detection module (reset persistence counters, etc.) */
void detection_init();

/**
 * Analyse sensor data and determine mismatch conditions.
 *
 * @param data Complete system sensor data from sensors_readAll()
 * @return SystemAnalysis with mismatch results for both bins
 *
 * The analysis evaluates:
 * - Biodegradable bin: Metal detection → possible mismatch
 *   Moisture and gas provide supporting evidence.
 * - Non-biodegradable bin: High moisture + gas → possible
 *   unwanted biodegradable material. Metal alone is NOT an error here.
 *
 * Persistence checking ensures that transient sensor noise does not
 * trigger false alerts. MISMATCH_PERSISTENCE_COUNT consecutive
 * positive readings are required before alertActive is set.
 *
 * The evidenceScore is a heuristic 0–100 value based on weighted
 * sensor contributions. It is NOT a statistically validated probability.
 */
SystemAnalysis detection_analyse(const SystemData& data);

/**
 * Reset persistence counters (e.g., after user acknowledges alert).
 */
void detection_resetPersistence(BinType bin);

/**
 * Get a human-readable label for a SystemState bitmask.
 */
String detection_stateToString(uint8_t stateFlags);

/**
 * Get a human-readable label for BinFillStatus.
 */
String detection_fillStatusToString(BinFillStatus status);

/**
 * Get a human-readable label for SensorStatus.
 */
String detection_sensorStatusToString(SensorStatus status);

/**
 * Get a human-readable label for MoistureLevel.
 */
String detection_moistureLevelToString(MoistureLevel level);

#endif // DETECTION_H
