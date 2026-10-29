/**
 * @file lcd_display.h
 * @brief Modular LCD Display Driver for Module A (Arduino Uno)
 *
 * Provides non-blocking display updates for I2C character LCDs (16x2 / 20x4).
 * Safely probes I2C address before writing to prevent bus lockup.
 * Priority display:
 *   Line 1: Commanded Lid State ("LID: OPEN" / "LID: CLOSED")
 *   Line 2: Distance ("Dist: XXcm") & Proximity ("Prox: YES/NO")
 */

#ifndef LCD_DISPLAY_H
#define LCD_DISPLAY_H

#include <Arduino.h>
#include "sensor_types.h"

// Initialize LCD hardware, check I2C bus presence non-destructively
void lcd_init();

// Non-blocking periodic display update
void lcd_update(const SystemTelemetry& telem);

// Query if physical LCD acknowledged on I2C bus
bool lcd_isHardwareDetected();

// Returns current active screen page index
uint8_t lcd_getActivePage();

// Returns milliseconds since last display buffer refresh
unsigned long lcd_getTimeSinceLastRefreshMs();

#endif // LCD_DISPLAY_H
