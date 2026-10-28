/**
 * @file main.cpp
 * @brief Main application — Intelligent Solid Waste Segregation System (Uno Edition)
 *
 * Coordinates:
 *   - Capacitive moisture sensing with 2-point calibration
 *   - HX711 load cell weight acquisition
 *   - Non-blocking HC-SR04 proximity detection and automatic lid actuation
 *   - Low-footprint JSON Lines telemetry output at 115200 baud
 *   - Interactive calibration commands via serial
 */

#include <Arduino.h>
#include "config.h"
#include "sensor_types.h"
#include "sensors.h"
#include "detection.h"
#include "leds.h"
#include "serial_output.h"

// Module State
static unsigned long lastTelemetryDispatchMs = 0;

void setup() {
    // 1. Initialise UART Serial communication
    serial_init();
    serial_printBanner();

    // 2. Initialise and self-test LEDs
    leds_init();
    leds_selfTest();

    // 3. Initialise sensor hardware & lid actuator
    sensors_init();

    // 4. Initialise detection engine
    detection_init();

    // 5. Emit initial baseline telemetry packet
    SystemTelemetry initialTelem = sensors_captureTelemetry();
    serial_printTelemetryJSON(initialTelem);
}

void loop() {
    unsigned long now = millis();

    // 1. Process incoming serial commands (non-blocking)
    serial_handleCommands();

    // 2. Update status heartbeat LED (non-blocking)
    leds_updateHeartbeat();

    // 3. Update ultrasonic proximity sensing & lid state machine
    bool lidTransitionOccurred = sensors_updateLidStateMachine();

    // 4. If lid state changed, dispatch telemetry immediately for low latency
    if (lidTransitionOccurred) {
        SystemTelemetry eventTelem = sensors_captureTelemetry();
        serial_printTelemetryJSON(eventTelem);
        lastTelemetryDispatchMs = now;
        return;
    }

    // 5. Periodic telemetry publication (1Hz interval)
    if (now - lastTelemetryDispatchMs >= TELEMETRY_INTERVAL_MS) {
        lastTelemetryDispatchMs = now;
        SystemTelemetry periodicTelem = sensors_captureTelemetry();
        serial_printTelemetryJSON(periodicTelem);
    }
}
