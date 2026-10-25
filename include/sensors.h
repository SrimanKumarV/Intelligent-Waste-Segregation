/**
 * @file sensors.h
 * @brief Sensor acquisition module interface
 *
 * Provides functions to initialise and read all sensors:
 * gas, moisture, metal, weight (HX711), and bin level (ultrasonic).
 * All functions return structured data with status indicators.
 */

#ifndef SENSORS_H
#define SENSORS_H

#include "sensor_types.h"

// ============================================================================
// INITIALIZATION
// ============================================================================

/** Initialise all sensor interfaces (GPIO modes, HX711, etc.) */
void sensors_init();

/** Check if gas sensor warm-up period has elapsed */
bool sensors_gasWarmupComplete();

// ============================================================================
// INDIVIDUAL SENSOR READS
// ============================================================================

/** Read the gas sensor (shared between both bins) */
GasReading sensors_readGas();

/** Read a moisture sensor for the specified bin */
MoistureReading sensors_readMoisture(BinType bin);

/** Read a metal sensor for the specified bin */
MetalReading sensors_readMetal(BinType bin);

/** Read weight from HX711 for the specified bin */
WeightReading sensors_readWeight(BinType bin);

/** Read bin level from ultrasonic sensor for the specified bin */
LevelReading sensors_readLevel(BinType bin);

// ============================================================================
// AGGREGATED READ
// ============================================================================

/**
 * Read all sensors and return complete system data.
 * This is the primary function called from the main loop.
 */
SystemData sensors_readAll();

// ============================================================================
// CALIBRATION
// ============================================================================

/** Tare (zero) the load cell for the specified bin */
void sensors_tareWeight(BinType bin);

/** Set calibration factor for the specified bin's load cell */
void sensors_setCalibrationFactor(BinType bin, float factor);

/** Get current calibration factor for the specified bin */
float sensors_getCalibrationFactor(BinType bin);

#endif // SENSORS_H
