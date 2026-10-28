/**
 * @file leds.h
 * @brief LED indicators interface for Arduino Uno
 */

#ifndef LEDS_H
#define LEDS_H

#include <Arduino.h>

void leds_init();
void leds_selfTest();
void leds_updateHeartbeat();
void leds_setProximity(bool active);
void leds_setFault(bool active);
void leds_allOff();

#endif // LEDS_H
