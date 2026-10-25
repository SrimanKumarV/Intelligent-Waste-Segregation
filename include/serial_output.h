/**
 * @file serial_output.h
 * @brief Serial monitor diagnostics and output formatting
 *
 * Provides structured serial output for debugging, demonstration,
 * and optional CSV data logging.
 */

#ifndef SERIAL_OUTPUT_H
#define SERIAL_OUTPUT_H

#include "sensor_types.h"

/** Initialise serial communication */
void serial_init();

/** Print startup banner with system identification */
void serial_printBanner();

/** Print a complete sensor reading cycle */
void serial_printReadings(const SystemData& data, const SystemAnalysis& analysis);

/** Print readings in CSV format (if enabled) */
void serial_printCSV(const SystemData& data, const SystemAnalysis& analysis);

/** Print CSV header row */
void serial_printCSVHeader();

/** Print a sensor fault summary */
void serial_printFaults(const SystemAnalysis& analysis);

/** Print calibration status for both load cells */
void serial_printCalibrationStatus();

/** Print gas sensor warm-up progress */
void serial_printWarmupStatus(unsigned long elapsedMs, unsigned long totalMs);

#endif // SERIAL_OUTPUT_H
