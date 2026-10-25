/**
 * @file sensor_types.h
 * @brief Data structures for sensor readings and system state
 *
 * Defines enums and structs used across all firmware modules.
 * Keeps data representation separate from acquisition and logic.
 */

#ifndef SENSOR_TYPES_H
#define SENSOR_TYPES_H

#include <Arduino.h>

// ============================================================================
// BIN IDENTIFICATION
// ============================================================================
enum BinType {
    BIN_BIODEGRADABLE     = 0,
    BIN_NON_BIODEGRADABLE = 1,
    BIN_COUNT             = 2
};

// ============================================================================
// SENSOR STATUS
// ============================================================================
enum SensorStatus {
    SENSOR_OK              = 0,  // Reading is valid
    SENSOR_DISCONNECTED    = 1,  // Sensor not responding
    SENSOR_OUT_OF_RANGE    = 2,  // Reading outside expected bounds
    SENSOR_NOT_CALIBRATED  = 3,  // Needs calibration
    SENSOR_WARMING_UP      = 4,  // Sensor in warm-up period (e.g., gas sensor)
    SENSOR_TIMEOUT         = 5   // Communication timeout (e.g., HX711)
};

// ============================================================================
// MOISTURE LEVEL
// ============================================================================
enum MoistureLevel {
    MOISTURE_DRY           = 0,
    MOISTURE_INTERMEDIATE  = 1,
    MOISTURE_WET           = 2,
    MOISTURE_UNKNOWN       = 3   // Sensor fault
};

// ============================================================================
// BIN FILL STATUS
// ============================================================================
enum BinFillStatus {
    BIN_EMPTY              = 0,
    BIN_NORMAL             = 1,
    BIN_NEAR_CAPACITY      = 2,
    BIN_FULL               = 3,
    BIN_LEVEL_UNKNOWN      = 4   // Sensor fault
};

// ============================================================================
// SYSTEM WARNING STATE
// ============================================================================
// Multiple states can be active simultaneously using bitwise OR.
enum SystemState : uint8_t {
    STATE_NORMAL              = 0x00,
    STATE_POSSIBLE_MISMATCH   = 0x01,
    STATE_BIN_NEAR_CAPACITY   = 0x02,
    STATE_BIN_FULL            = 0x04,
    STATE_SENSOR_FAULT        = 0x08,
    STATE_CALIBRATION_NEEDED  = 0x10,
    STATE_SYSTEM_WARMING_UP   = 0x20
};

// ============================================================================
// INDIVIDUAL SENSOR READINGS
// ============================================================================

/** Gas sensor reading */
struct GasReading {
    int      rawValue;          // ADC raw value (0–4095)
    bool     digitalState;      // Digital pin state (if connected)
    bool     aboveThreshold;    // True if gas level exceeds GAS_THRESHOLD_HIGH
    SensorStatus status;
};

/** Moisture sensor reading */
struct MoistureReading {
    int           rawValue;     // ADC raw value (0–4095)
    MoistureLevel level;        // Interpreted moisture level
    SensorStatus  status;
};

/** Metal sensor reading */
struct MetalReading {
    bool         metalDetected; // True if metal is present
    bool         rawPinState;   // Raw digital pin state (before polarity correction)
    SensorStatus status;
};

/** Weight reading from HX711 load cell */
struct WeightReading {
    float        weightGrams;   // Calibrated weight in grams
    long         rawValue;      // Raw HX711 count (for diagnostics)
    bool         isCalibrated;  // True if calibration factor is applied
    SensorStatus status;
};

/** Bin level reading from ultrasonic sensor */
struct LevelReading {
    float         distanceCm;   // Distance from sensor to waste surface (cm)
    float         fillPercentage; // Calculated fill percentage (0–100%)
    BinFillStatus fillStatus;   // Interpreted fill state
    SensorStatus  status;
};

// ============================================================================
// AGGREGATED BIN DATA
// ============================================================================

/** Complete sensor data for one waste bin */
struct BinData {
    BinType         binType;
    MoistureReading moisture;
    MetalReading    metal;
    WeightReading   weight;
    LevelReading    level;
};

/** Complete system sensor data */
struct SystemData {
    unsigned long   timestampMs;      // millis() at time of reading
    GasReading      gas;              // Shared gas sensor (between bins)
    BinData         bins[BIN_COUNT];  // Data for each bin
};

// ============================================================================
// MISMATCH DETECTION RESULT
// ============================================================================

/** Result of waste mismatch analysis for one bin */
struct MismatchResult {
    BinType       binType;
    uint8_t       systemState;        // Bitwise OR of SystemState flags
    int           evidenceScore;      // Heuristic score (0–100), NOT a probability
    int           persistenceCount;   // Consecutive cycles with mismatch detected
    bool          alertActive;        // True if persistence threshold met
    String        description;        // Human-readable explanation
};

/** Complete system analysis */
struct SystemAnalysis {
    unsigned long     timestampMs;
    MismatchResult    binResults[BIN_COUNT];
    bool              anySensorFault;
    bool              anyCalibrationNeeded;
    bool              systemWarmingUp;
};

#endif // SENSOR_TYPES_H
