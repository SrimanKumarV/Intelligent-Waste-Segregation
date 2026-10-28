/**
 * @file serial_output.h
 * @brief Structured telemetry protocol and command interface for Arduino Uno
 */

#ifndef SERIAL_OUTPUT_H
#define SERIAL_OUTPUT_H

#include "sensor_types.h"

void serial_init();
void serial_printBanner();
void serial_printTelemetryJSON(const SystemTelemetry& telem);
void serial_printHelp();
void serial_handleCommands();

#endif // SERIAL_OUTPUT_H
