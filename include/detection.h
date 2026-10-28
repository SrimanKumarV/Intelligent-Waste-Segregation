/**
 * @file detection.h
 * @brief Two-Category Waste Evaluation Logic
 *
 * Supports exactly two waste categories:
 *   - BIODEGRADABLE
 *   - NON_BIODEGRADABLE
 *
 * Distinguishes recorded category events from raw moisture/weight measurements.
 */

#ifndef DETECTION_H
#define DETECTION_H

#include "sensor_types.h"

// Waste classification validation result
struct ClassificationEvidence {
    WasteCategory suggestedCategory;
    int           confidenceScore;     // 0-100 heuristic indicator (NOT a validated probability)
    bool          isMoistureElevated;
    bool          hasSignificantMass;
    const char*   diagnosticSummary;
};

void detection_init();
ClassificationEvidence detection_evaluateEvidence(const MoistureReading& moisture, const WeightReading& weight);
const char* detection_categoryToString(WasteCategory cat);

#endif // DETECTION_H
