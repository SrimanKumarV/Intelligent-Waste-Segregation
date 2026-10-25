/**
 * @file leds.h
 * @brief LED indication system interface
 *
 * Controls LED outputs based on system state.
 * Supports multiple simultaneous conditions with priority-based display.
 */

#ifndef LEDS_H
#define LEDS_H

#include "sensor_types.h"

/** Initialise LED GPIO pins as outputs, all LEDs off */
void leds_init();

/**
 * Update LED outputs based on system analysis results.
 * Handles blinking patterns for fault conditions.
 *
 * @param analysis Complete system analysis from detection_analyse()
 */
void leds_update(const SystemAnalysis& analysis);

/** Turn all LEDs off */
void leds_allOff();

/** Self-test: blink all LEDs sequentially during startup */
void leds_selfTest();

/**
 * Get human-readable description of current LED states.
 * Used for serial diagnostics.
 */
String leds_getStateDescription();

#endif // LEDS_H
