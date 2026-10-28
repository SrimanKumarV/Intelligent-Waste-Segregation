/**
 * @file sensors.cpp
 * @brief Sensor acquisition and lid actuation implementation for Arduino Uno prototype
 *
 * Implements:
 *   - Capacitive moisture sensing with 2-point calibration
 *   - HX711 load cell weight reading and tare/scale calibration
 *   - HC-SR04 ultrasonic proximity detection for automatic lid opening
 *   - Non-blocking lid servo state machine with debounce and cooldown
 */

#include "sensors.h"
#include "config.h"
#include <HX711.h>
#include <Servo.h>

// ============================================================================
// MODULE HARDWARE INSTANCES & STATE
// ============================================================================
static HX711 hx711;
static Servo lidServo;

// Calibration state
static float weightCalibrationFactor = HX711_CALIBRATION_FACTOR_DEFAULT;
static bool  isWeightCalibratedState = false;

static int   moistureAirRawDefault   = MOISTURE_RAW_AIR_DEFAULT;
static int   moistureWaterRawDefault = MOISTURE_RAW_WATER_DEFAULT;
static bool  isMoistureCalibratedState = false;

// Lid state machine variables
static LidState lidState = {
    LID_CLOSED,
    false, // hasPhysicalFeedback (no limit switch or encoder installed)
    false, // physicalClosedVerified
    false, // physicalOpenVerified
    0      // stateChangeTimestampMs
};

static uint8_t  proximityDebounceCounter = 0;
static unsigned long lidHoldTimerStartMs = 0;
static unsigned long lidClosedTimestampMs = 0;
static unsigned long telemetrySequenceCounter = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================
void sensors_init() {
    // 1. Analog Moisture Sensor pin configuration
    pinMode(PIN_MOISTURE_ANALOG, INPUT);

    // 2. Ultrasonic Sensor pins
    pinMode(PIN_ULTRASONIC_TRIG, OUTPUT);
    pinMode(PIN_ULTRASONIC_ECHO, INPUT);
    digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

    // 3. Status LEDs
    pinMode(PIN_LED_HEARTBEAT, OUTPUT);
    pinMode(PIN_LED_PROXIMITY, OUTPUT);
    pinMode(PIN_LED_FAULT, OUTPUT);
    digitalWrite(PIN_LED_HEARTBEAT, LOW);
    digitalWrite(PIN_LED_PROXIMITY, LOW);
    digitalWrite(PIN_LED_FAULT, LOW);

    // 4. Lid Servo Initialization
    lidServo.attach(PIN_LID_SERVO);
    lidServo.write(LID_SERVO_CLOSED_ANGLE);
    lidState.commandState = LID_CLOSED;
    lidState.stateChangeTimestampMs = millis();

    // 5. HX711 Load Cell Initialization
    hx711.begin(PIN_HX711_DOUT, PIN_HX711_SCK);
    hx711.set_scale(weightCalibrationFactor);

    if (hx711.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        hx711.tare(HX711_AVG_SAMPLES);
    } else {
        digitalWrite(PIN_LED_FAULT, HIGH);
    }
}

// ============================================================================
// CAPACITIVE MOISTURE SENSING
// ============================================================================
MoistureReading sensors_readMoisture() {
    MoistureReading reading;
    reading.isCalibrated = isMoistureCalibratedState;

    // Average 5 analog samples for electrical noise suppression
    long sum = 0;
    for (int i = 0; i < 5; i++) {
        sum += analogRead(PIN_MOISTURE_ANALOG);
        delayMicroseconds(100);
    }
    reading.rawValue = (int)(sum / 5);

    // Physical sanity check for hardware disconnect / short
    if (reading.rawValue < MOISTURE_ADC_MIN_VALID || reading.rawValue > MOISTURE_ADC_MAX_VALID) {
        reading.status = SENSOR_DISCONNECTED;
        reading.calibratedPct = 0.0f;
        return reading;
    }

    if (!isMoistureCalibratedState) {
        // Uncalibrated state: provide raw ADC, refuse to fabricate percentage
        reading.status = SENSOR_NOT_CALIBRATED;
        reading.calibratedPct = 0.0f;
    } else {
        // Dual-point calibrated percentage calculation
        // Capacitive sensor: raw decreases as moisture increases (airRaw > waterRaw)
        if (moistureAirRawDefault <= moistureWaterRawDefault) {
            reading.status = SENSOR_NOT_CALIBRATED;
            reading.calibratedPct = 0.0f;
        } else {
            float pct = ((float)(moistureAirRawDefault - reading.rawValue) /
                         (float)(moistureAirRawDefault - moistureWaterRawDefault)) * 100.0f;
            if (pct < 0.0f) pct = 0.0f;
            if (pct > 100.0f) pct = 100.0f;
            reading.calibratedPct = pct;
            reading.status = SENSOR_OK;
        }
    }

    return reading;
}

// ============================================================================
// HX711 LOAD CELL SENSING
// ============================================================================
WeightReading sensors_readWeight() {
    WeightReading reading;
    reading.isCalibrated = isWeightCalibratedState;

    if (!hx711.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        reading.status = SENSOR_TIMEOUT;
        reading.weightGrams = 0.0f;
        reading.rawValue = 0;
        return reading;
    }

    reading.rawValue = hx711.read_average(HX711_AVG_SAMPLES);

    if (!isWeightCalibratedState) {
        reading.status = SENSOR_NOT_CALIBRATED;
        reading.weightGrams = 0.0f; // Explicitly uncalibrated
        return reading;
    }

    float weight = hx711.get_units(HX711_AVG_SAMPLES);

    if (weight < -WEIGHT_MIN_VALID_GRAMS) {
        // Negative drift exceeding tolerance -> needs tare
        reading.status = SENSOR_NOT_CALIBRATED;
        reading.weightGrams = weight;
    } else if (weight > WEIGHT_MAX_CAPACITY_GRAMS) {
        reading.status = SENSOR_OUT_OF_RANGE;
        reading.weightGrams = weight;
    } else {
        // Valid calibrated weight
        if (weight < 0.0f) weight = 0.0f; // Clamp subtle tare noise
        reading.weightGrams = weight;
        reading.status = SENSOR_OK;
    }

    return reading;
}

// ============================================================================
// ULTRASONIC PROXIMITY DETECTION
// ============================================================================
ProximityReading sensors_readProximity() {
    ProximityReading reading;

    // Send 10µs trigger pulse
    digitalWrite(PIN_ULTRASONIC_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_ULTRASONIC_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_ULTRASONIC_TRIG, LOW);

    // Bounded measurement to avoid blocking Uno loop
    unsigned long duration = pulseIn(PIN_ULTRASONIC_ECHO, HIGH, ULTRASONIC_TIMEOUT_US);

    if (duration == 0) {
        reading.distanceCm = -1.0f;
        reading.objectDetected = false;
        reading.status = SENSOR_TIMEOUT;
        return reading;
    }

    float distance = (duration * 0.0343f) / 2.0f;

    if (distance < ULTRASONIC_MIN_VALID_CM || distance > ULTRASONIC_MAX_VALID_CM) {
        reading.distanceCm = distance;
        reading.objectDetected = false;
        reading.status = SENSOR_OUT_OF_RANGE;
        return reading;
    }

    reading.distanceCm = distance;
    reading.objectDetected = (distance <= PROXIMITY_THRESHOLD_CM);
    reading.status = SENSOR_OK;
    return reading;
}

// ============================================================================
// AUTOMATIC LID ACTUATION & STATE MACHINE
// ============================================================================
void sensors_controlLid(LidCommandState cmd) {
    lidState.commandState = cmd;
    lidState.stateChangeTimestampMs = millis();

    if (cmd == LID_OPEN) {
        lidServo.write(LID_SERVO_OPEN_ANGLE);
        digitalWrite(PIN_LED_PROXIMITY, HIGH);
    } else {
        lidServo.write(LID_SERVO_CLOSED_ANGLE);
        digitalWrite(PIN_LED_PROXIMITY, LOW);
        lidClosedTimestampMs = millis();
    }
}

LidState sensors_getLidState() {
    return lidState;
}

bool sensors_updateLidStateMachine() {
    unsigned long now = millis();
    LidCommandState previousState = lidState.commandState;

    ProximityReading prox = sensors_readProximity();

    // Check cooldown period
    bool inCooldown = (now - lidClosedTimestampMs < LID_COOLDOWN_MS);

    if (lidState.commandState == LID_CLOSED) {
        if (!inCooldown && prox.status == SENSOR_OK && prox.objectDetected) {
            proximityDebounceCounter++;
            if (proximityDebounceCounter >= PROXIMITY_DEBOUNCE_COUNT) {
                // Object approach confirmed -> open lid
                sensors_controlLid(LID_OPEN);
                lidHoldTimerStartMs = now;
                proximityDebounceCounter = 0;
            }
        } else {
            proximityDebounceCounter = 0;
        }
    } else if (lidState.commandState == LID_OPEN) {
        if (prox.status == SENSOR_OK && prox.objectDetected) {
            // Object remains in proximity -> keep open, reset hold timer
            lidHoldTimerStartMs = now;
        } else {
            // Object absent -> check if hold duration elapsed
            if (now - lidHoldTimerStartMs >= LID_HOLD_OPEN_MS) {
                sensors_controlLid(LID_CLOSED);
            }
        }
    }

    return (previousState != lidState.commandState);
}

// ============================================================================
// CALIBRATION FUNCTIONS
// ============================================================================
void sensors_tareWeight() {
    if (hx711.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        hx711.tare(HX711_AVG_SAMPLES);
    }
}

void sensors_setWeightCalibration(float factor) {
    if (factor > 0.0f) {
        weightCalibrationFactor = factor;
        hx711.set_scale(factor);
        isWeightCalibratedState = true;
    }
}

float sensors_getWeightCalibration() {
    return weightCalibrationFactor;
}

bool sensors_isWeightCalibrated() {
    return isWeightCalibratedState;
}

void sensors_setMoistureCalibration(int airRaw, int waterRaw) {
    if (airRaw > waterRaw && waterRaw > 0) {
        moistureAirRawDefault = airRaw;
        moistureWaterRawDefault = waterRaw;
        isMoistureCalibratedState = true;
    }
}

bool sensors_isMoistureCalibrated() {
    return isMoistureCalibratedState;
}

int sensors_getMoistureAirRaw() {
    return moistureAirRawDefault;
}

int sensors_getMoistureWaterRaw() {
    return moistureWaterRawDefault;
}

// ============================================================================
// SYSTEM TELEMETRY CAPTURE
// ============================================================================
SystemTelemetry sensors_captureTelemetry() {
    SystemTelemetry telem;
    telemetrySequenceCounter++;

    telem.sequenceNumber = telemetrySequenceCounter;
    telem.uptimeSeconds  = millis() / 1000;
    telem.moisture       = sensors_readMoisture();
    telem.weight         = sensors_readWeight();
    telem.proximity      = sensors_readProximity();
    telem.lid            = sensors_getLidState();
    telem.lastRecordedCategory = CATEGORY_UNCLASSIFIED;

    // Calculate fault bitmask
    telem.faultBitmask = FAULT_NONE;
    if (telem.moisture.status == SENSOR_DISCONNECTED) {
        telem.faultBitmask |= FAULT_MOISTURE_OFFLINE;
    }
    if (telem.weight.status == SENSOR_TIMEOUT) {
        telem.faultBitmask |= FAULT_HX711_TIMEOUT;
    }
    if (telem.proximity.status == SENSOR_TIMEOUT) {
        telem.faultBitmask |= FAULT_ULTRASONIC_TIMEOUT;
    }
    if (!telem.moisture.isCalibrated || !telem.weight.isCalibrated) {
        telem.faultBitmask |= FAULT_CALIBRATION_REQUIRED;
    }

    // Drive fault LED
    if (telem.faultBitmask & (FAULT_MOISTURE_OFFLINE | FAULT_HX711_TIMEOUT)) {
        digitalWrite(PIN_LED_FAULT, HIGH);
    } else {
        digitalWrite(PIN_LED_FAULT, LOW);
    }

    return telem;
}
