/**
 * @file sensors.h
 * @brief Sensor acquisition and lid actuation interface for Arduino Uno prototype
 *
 * Provides functions for:
 *   - Capacitive moisture sensing with 2-point calibration
 *   - HX711 load cell weight reading and interactive calibration
 *   - HC-SR04 ultrasonic proximity detection for automatic lid opening
 *   - Non-blocking lid servo state machine with debounce and cooldown
 */

#ifndef SENSORS_H
#define SENSORS_H

#include "sensor_types.h"

// ============================================================================
// INITIALIZATION
// ============================================================================
void sensors_init();

// ============================================================================
// SENSOR ACQUISITION
// ============================================================================
MoistureReading  sensors_readMoisture();
WeightReading    sensors_readWeight();
ProximityReading sensors_readProximity();
SystemTelemetry  sensors_captureTelemetry();

// ============================================================================
// CALIBRATION INTERFACE
// ============================================================================
void  sensors_tareWeight();
void  sensors_setWeightCalibration(float factor);
float sensors_getWeightCalibration();
bool  sensors_isWeightCalibrated();

void  sensors_setMoistureCalibration(int airRaw, int waterRaw);
bool  sensors_isMoistureCalibrated();
int   sensors_getMoistureAirRaw();
int   sensors_getMoistureWaterRaw();

// ============================================================================
// AUTOMATIC LID ACTUATION & STATE MACHINE
// ============================================================================
void     sensors_controlLid(LidCommandState cmd);
LidState sensors_getLidState();
bool     sensors_updateLidStateMachine(); // Returns true if state changed

#endif // SENSORS_H
