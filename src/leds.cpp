/**
 * @file leds.cpp
 * @brief LED indication system implementation
 *
 * Controls LED outputs based on system state with priority handling
 * and blinking patterns for fault conditions.
 *
 * LED STATE TABLE:
 * ┌─────────────────────┬──────────┬───────────────────────────┐
 * │ LED                 │ Pin      │ Behaviour                 │
 * ├─────────────────────┼──────────┼───────────────────────────┤
 * │ System OK           │ GPIO 2   │ ON: System running        │
 * │                     │          │ OFF: System fault          │
 * ├─────────────────────┼──────────┼───────────────────────────┤
 * │ Bio Mismatch        │ GPIO 13  │ ON: Mismatch in bio bin   │
 * │                     │          │ OFF: No mismatch          │
 * ├─────────────────────┼──────────┼───────────────────────────┤
 * │ NonBio Mismatch     │ GPIO 15  │ ON: Mismatch in nonbio    │
 * │                     │          │ OFF: No mismatch          │
 * ├─────────────────────┼──────────┼───────────────────────────┤
 * │ Bin Full            │ GPIO 33  │ ON: Any bin full/near     │
 * │                     │          │ BLINK: Bin FULL           │
 * │                     │          │ OFF: Normal levels        │
 * ├─────────────────────┼──────────┼───────────────────────────┤
 * │ Sensor Fault        │ GPIO 32  │ BLINK: Sensor fault or    │
 * │                     │          │   calibration needed      │
 * │                     │          │ OFF: All sensors OK       │
 * └─────────────────────┴──────────┴───────────────────────────┘
 *
 * Priority: Sensor Fault > Mismatch > Bin Full > Normal
 * Multiple conditions can be shown simultaneously on separate LEDs.
 */

#include "leds.h"
#include "config.h"

// ============================================================================
// MODULE STATE
// ============================================================================

// Blink state tracking
static bool blinkState = false;
static unsigned long lastBlinkMs = 0;

// Current LED states for diagnostics
static bool ledSystemOk = false;
static bool ledBioMismatch = false;
static bool ledNonBioMismatch = false;
static bool ledBinFull = false;
static bool ledSensorFault = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

void leds_init() {
    pinMode(LED_SYSTEM_OK_PIN, OUTPUT);
    pinMode(LED_BIO_MISMATCH_PIN, OUTPUT);
    pinMode(LED_NONBIO_MISMATCH_PIN, OUTPUT);
    pinMode(LED_BIN_FULL_PIN, OUTPUT);
    pinMode(LED_SENSOR_FAULT_PIN, OUTPUT);

    leds_allOff();
    Serial.println(F("[LEDS] LED outputs initialised"));
}

// ============================================================================
// UPDATE
// ============================================================================

void leds_update(const SystemAnalysis& analysis) {
    // Update blink timing
    unsigned long now = millis();
    if (now - lastBlinkMs >= LED_BLINK_INTERVAL_MS) {
        blinkState = !blinkState;
        lastBlinkMs = now;
    }

    // --- System OK LED ---
    // ON when system is running and no critical faults
    if (analysis.anySensorFault) {
        ledSystemOk = false;
    } else {
        ledSystemOk = true;
    }
    digitalWrite(LED_SYSTEM_OK_PIN, ledSystemOk ? HIGH : LOW);

    // --- Bio Mismatch LED ---
    // ON when mismatch alert is active for biodegradable bin
    ledBioMismatch = analysis.binResults[BIN_BIODEGRADABLE].alertActive;
    digitalWrite(LED_BIO_MISMATCH_PIN, ledBioMismatch ? HIGH : LOW);

    // --- NonBio Mismatch LED ---
    // ON when mismatch alert is active for non-biodegradable bin
    ledNonBioMismatch = analysis.binResults[BIN_NON_BIODEGRADABLE].alertActive;
    digitalWrite(LED_NONBIO_MISMATCH_PIN, ledNonBioMismatch ? HIGH : LOW);

    // --- Bin Full LED ---
    // Evaluate both bins for capacity warnings
    bool anyNearCapacity = false;
    bool anyFull = false;
    for (int b = 0; b < BIN_COUNT; b++) {
        uint8_t state = analysis.binResults[b].systemState;
        if (state & STATE_BIN_FULL) anyFull = true;
        if (state & STATE_BIN_NEAR_CAPACITY) anyNearCapacity = true;
    }

    if (anyFull) {
        // BLINK for full bin (urgent)
        ledBinFull = blinkState;
    } else if (anyNearCapacity) {
        // Steady ON for near capacity
        ledBinFull = true;
    } else {
        ledBinFull = false;
    }
    digitalWrite(LED_BIN_FULL_PIN, ledBinFull ? HIGH : LOW);

    // --- Sensor Fault LED ---
    // BLINK when any sensor fault or calibration needed
    if (analysis.anySensorFault || analysis.anyCalibrationNeeded) {
        ledSensorFault = blinkState;
    } else {
        ledSensorFault = false;
    }
    digitalWrite(LED_SENSOR_FAULT_PIN, ledSensorFault ? HIGH : LOW);
}

// ============================================================================
// UTILITIES
// ============================================================================

void leds_allOff() {
    digitalWrite(LED_SYSTEM_OK_PIN, LOW);
    digitalWrite(LED_BIO_MISMATCH_PIN, LOW);
    digitalWrite(LED_NONBIO_MISMATCH_PIN, LOW);
    digitalWrite(LED_BIN_FULL_PIN, LOW);
    digitalWrite(LED_SENSOR_FAULT_PIN, LOW);

    ledSystemOk = false;
    ledBioMismatch = false;
    ledNonBioMismatch = false;
    ledBinFull = false;
    ledSensorFault = false;
}

void leds_selfTest() {
    Serial.println(F("[LEDS] Running LED self-test..."));

    const int pins[] = {
        LED_SYSTEM_OK_PIN,
        LED_BIO_MISMATCH_PIN,
        LED_NONBIO_MISMATCH_PIN,
        LED_BIN_FULL_PIN,
        LED_SENSOR_FAULT_PIN
    };
    const char* names[] = {
        "System OK",
        "Bio Mismatch",
        "NonBio Mismatch",
        "Bin Full",
        "Sensor Fault"
    };
    const int count = sizeof(pins) / sizeof(pins[0]);

    for (int i = 0; i < count; i++) {
        Serial.print(F("  Testing: "));
        Serial.println(names[i]);
        digitalWrite(pins[i], HIGH);
        delay(300);
        digitalWrite(pins[i], LOW);
        delay(150);
    }

    // Brief all-on
    for (int i = 0; i < count; i++) {
        digitalWrite(pins[i], HIGH);
    }
    delay(500);
    leds_allOff();

    Serial.println(F("[LEDS] Self-test complete"));
}

String leds_getStateDescription() {
    String desc = "LEDs: ";
    desc += ledSystemOk     ? "SysOK=ON "  : "SysOK=OFF ";
    desc += ledBioMismatch  ? "BioMM=ON "  : "BioMM=OFF ";
    desc += ledNonBioMismatch ? "NonBioMM=ON " : "NonBioMM=OFF ";
    desc += ledBinFull      ? "BinFull=ON " : "BinFull=OFF ";
    desc += ledSensorFault  ? "Fault=ON "   : "Fault=OFF ";
    return desc;
}
