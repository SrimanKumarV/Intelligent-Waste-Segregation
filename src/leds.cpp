/**
 * @file leds.cpp
 * @brief LED indicators implementation for Arduino Uno
 */

#include "leds.h"
#include "config.h"

static unsigned long lastHeartbeatToggleMs = 0;
static bool heartbeatState = false;

void leds_init() {
    pinMode(PIN_LED_HEARTBEAT, OUTPUT);
    pinMode(PIN_LED_PROXIMITY, OUTPUT);
    pinMode(PIN_LED_FAULT, OUTPUT);
    leds_allOff();
}

void leds_selfTest() {
    // Sequential blink self-test
    digitalWrite(PIN_LED_HEARTBEAT, HIGH);
    delay(150);
    digitalWrite(PIN_LED_HEARTBEAT, LOW);

    digitalWrite(PIN_LED_PROXIMITY, HIGH);
    delay(150);
    digitalWrite(PIN_LED_PROXIMITY, LOW);

    digitalWrite(PIN_LED_FAULT, HIGH);
    delay(150);
    digitalWrite(PIN_LED_FAULT, LOW);
}

void leds_updateHeartbeat() {
    unsigned long now = millis();
    if (now - lastHeartbeatToggleMs >= HEARTBEAT_BLINK_INTERVAL_MS) {
        lastHeartbeatToggleMs = now;
        heartbeatState = !heartbeatState;
        digitalWrite(PIN_LED_HEARTBEAT, heartbeatState ? HIGH : LOW);
    }
}

void leds_setProximity(bool active) {
    digitalWrite(PIN_LED_PROXIMITY, active ? HIGH : LOW);
}

void leds_setFault(bool active) {
    digitalWrite(PIN_LED_FAULT, active ? HIGH : LOW);
}

void leds_allOff() {
    digitalWrite(PIN_LED_HEARTBEAT, LOW);
    digitalWrite(PIN_LED_PROXIMITY, LOW);
    digitalWrite(PIN_LED_FAULT, LOW);
}
