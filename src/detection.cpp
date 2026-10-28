/**
 * @file detection.cpp
 * @brief Two-Category Waste Evaluation Logic Implementation
 *
 * Evaluates sensor readings for two waste categories:
 *   - BIODEGRADABLE
 *   - NON_BIODEGRADABLE
 *
 * NOTE: Capacitive moisture and weight provide physical characteristics
 * but cannot conclusively classify all materials autonomously.
 */

#include "detection.h"

void detection_init() {
    // Initialization of detection logic state
}

ClassificationEvidence detection_evaluateEvidence(const MoistureReading& moisture, const WeightReading& weight) {
    ClassificationEvidence evidence;
    evidence.suggestedCategory = CATEGORY_UNCLASSIFIED;
    evidence.confidenceScore   = 0;
    evidence.isMoistureElevated = false;
    evidence.hasSignificantMass = false;
    evidence.diagnosticSummary = "Awaiting validated measurement";

    if (weight.status == SENSOR_OK && weight.weightGrams >= 10.0f) {
        evidence.hasSignificantMass = true;
    }

    if (moisture.status == SENSOR_OK && moisture.isCalibrated) {
        if (moisture.calibratedPct >= 50.0f) {
            evidence.isMoistureElevated = true;
            evidence.suggestedCategory = CATEGORY_BIODEGRADABLE;
            evidence.confidenceScore = (int)moisture.calibratedPct;
            evidence.diagnosticSummary = "High moisture content suggests organic material";
        } else if (moisture.calibratedPct <= 20.0f) {
            evidence.suggestedCategory = CATEGORY_NON_BIODEGRADABLE;
            evidence.confidenceScore = 100 - (int)moisture.calibratedPct;
            evidence.diagnosticSummary = "Low moisture content suggests dry inorganic material";
        } else {
            evidence.suggestedCategory = CATEGORY_UNCLASSIFIED;
            evidence.confidenceScore = 50;
            evidence.diagnosticSummary = "Intermediate moisture: requires secondary confirmation";
        }
    } else {
        evidence.diagnosticSummary = "Moisture sensor uncalibrated: physical verification required";
    }

    return evidence;
}

const char* detection_categoryToString(WasteCategory cat) {
    switch (cat) {
        case CATEGORY_BIODEGRADABLE:     return "Biodegradable Waste";
        case CATEGORY_NON_BIODEGRADABLE: return "Non-Biodegradable Waste";
        default:                         return "Unclassified";
    }
}
