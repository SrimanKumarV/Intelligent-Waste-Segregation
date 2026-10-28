/**
 * @file sensor_types.h
 * @brief Data structures for sensor readings, lid events, and system telemetry
 *
 * Strict Two Waste Categories:
 *   - BIODEGRADABLE
 *   - NON_BIODEGRADABLE
 *
 * Designed for low memory footprint on Arduino Uno (ATmega328P, 2KB SRAM).
 */

#ifndef SENSOR_TYPES_H
#define SENSOR_TYPES_H

#include <Arduino.h>

// ============================================================================
// TWO WASTE CATEGORIES
// ============================================================================
enum WasteCategory : uint8_t {
    CATEGORY_UNCLASSIFIED     = 0,
    CATEGORY_BIODEGRADABLE    = 1,
    CATEGORY_NON_BIODEGRADABLE= 2
};

// ============================================================================
// SENSOR STATUS ENUMS
// ============================================================================
enum SensorStatus : uint8_t {
    SENSOR_OK              = 0,  // Reading valid
    SENSOR_DISCONNECTED    = 1,  // Open circuit / no response
    SENSOR_OUT_OF_RANGE    = 2,  // Reading outside physical limits
    SENSOR_NOT_CALIBRATED  = 3,  // Operational but requires calibration
    SENSOR_TIMEOUT         = 4   // Bus or echo response timeout
};

// ============================================================================
// LID COMMAND STATES
// ============================================================================
enum LidCommandState : uint8_t {
    LID_CLOSED             = 0,
    LID_OPENING            = 1,
    LID_OPEN               = 2,
    LID_CLOSING            = 3
};

// ============================================================================
// SYSTEM FAULT BITMASK
// ============================================================================
enum FaultFlag : uint8_t {
    FAULT_NONE                 = 0x00,
    FAULT_MOISTURE_OFFLINE     = 0x01,
    FAULT_HX711_TIMEOUT        = 0x02,
    FAULT_ULTRASONIC_TIMEOUT   = 0x04,
    FAULT_CALIBRATION_REQUIRED = 0x08
};

// ============================================================================
// SENSOR READING STRUCTS
// ============================================================================

/** Capacitive soil moisture sensor reading */
struct MoistureReading {
    int          rawValue;      // 10-bit raw ADC (0–1023)
    float        calibratedPct; // 0.0% to 100.0% (valid only if isCalibrated)
    bool         isCalibrated;  // True only after valid 2-point calibration
    SensorStatus status;
};

/** Load cell + HX711 amplifier weight reading */
struct WeightReading {
    float        weightGrams;   // Mass in grams (positive valid weight)
    long         rawValue;      // Raw 24-bit delta counts from HX711
    bool         isCalibrated;  // True only after reference mass calibration
    SensorStatus status;
};

/** Ultrasonic proximity reading for lid actuation */
struct ProximityReading {
    float        distanceCm;    // Distance to approaching object (cm)
    bool         objectDetected;// True if distance <= PROXIMITY_THRESHOLD_CM
    SensorStatus status;
};

/** Automatic lid state and feedback tracking */
struct LidState {
    LidCommandState commandState;         // Commanded servo/actuator state
    bool            hasPhysicalFeedback;  // False: no limit switch/encoder installed
    bool            physicalClosedVerified;
    bool            physicalOpenVerified;
    unsigned long   stateChangeTimestampMs;
};

/** Complete system telemetry snapshot */
struct SystemTelemetry {
    unsigned long    sequenceNumber;
    unsigned long    uptimeSeconds;
    MoistureReading  moisture;
    WeightReading    weight;
    ProximityReading proximity;
    LidState         lid;
    uint8_t          faultBitmask;
    WasteCategory    lastRecordedCategory;
};

#endif // SENSOR_TYPES_H
