/**
 * @file sensors.cpp
 * @brief Sensor acquisition implementation
 *
 * Reads all sensors: gas, moisture (×2), metal (×2), weight/HX711 (×2),
 * and bin level/ultrasonic (×2). Returns structured data with validity
 * status for each reading.
 *
 * IMPORTANT: Sensor failures are explicitly reported through SensorStatus,
 * not silently converted to zero values.
 */

#include "sensors.h"
#include "config.h"
#include <HX711.h>

// ============================================================================
// MODULE STATE
// ============================================================================

// HX711 instances for both load cells
static HX711 hx711Bio;
static HX711 hx711NonBio;

// Calibration factors (initialised from config defaults)
static float calibFactorBio    = HX711_BIO_CALIBRATION_FACTOR;
static float calibFactorNonBio = HX711_NONBIO_CALIBRATION_FACTOR;

// Calibration status
static bool isCalibratedBio    = false; // Will be true after user calibration
static bool isCalibratedNonBio = false;

// Gas sensor warm-up tracking
static unsigned long gasWarmupStartMs = 0;

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Read an analog pin with averaging to reduce noise.
 * Returns the averaged raw ADC value (0–4095).
 */
static int readAnalogAvg(int pin, int samples = ANALOG_AVG_SAMPLES) {
    long sum = 0;
    int validCount = 0;
    for (int i = 0; i < samples; i++) {
        int val = analogRead(pin);
        // Basic sanity: ESP32 ADC returns 0–4095
        if (val >= 0 && val <= 4095) {
            sum += val;
            validCount++;
        }
        delayMicroseconds(200); // Small delay between samples
    }
    if (validCount == 0) return -1; // All reads failed
    return (int)(sum / validCount);
}

/**
 * Read ultrasonic distance using HC-SR04 trigger/echo pattern.
 * Returns distance in centimetres, or -1.0 if timeout/error.
 *
 * Speed of sound ≈ 343 m/s = 0.0343 cm/µs
 * Round trip: distance = (pulse_us * 0.0343) / 2
 */
static float readUltrasonicCm(int trigPin, int echoPin) {
    // Ensure trigger is low
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);

    // Send 10µs trigger pulse
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);

    // Measure echo pulse duration
    unsigned long duration = pulseIn(echoPin, HIGH, ULTRASONIC_TIMEOUT_US);

    if (duration == 0) {
        return -1.0f; // Timeout — no echo received
    }

    float distanceCm = (duration * 0.0343f) / 2.0f;

    // Validate range
    if (distanceCm < ULTRASONIC_MIN_DISTANCE_CM ||
        distanceCm > ULTRASONIC_MAX_DISTANCE_CM) {
        return -1.0f; // Out of valid range
    }

    return distanceCm;
}

/**
 * Convert distance reading to fill percentage.
 * Sensor is mounted at the top of the bin looking down.
 * Empty bin: distance ≈ BIN_DEPTH_CM (maximum distance)
 * Full bin:  distance ≈ 0 (waste surface near sensor)
 */
static float distanceToFillPercent(float distanceCm) {
    if (distanceCm < 0) return -1.0f;
    float fillPct = ((BIN_DEPTH_CM - distanceCm) / BIN_DEPTH_CM) * 100.0f;
    // Clamp to 0–100%
    if (fillPct < 0.0f) fillPct = 0.0f;
    if (fillPct > 100.0f) fillPct = 100.0f;
    return fillPct;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

void sensors_init() {
    // --- Analog inputs ---
    // ESP32 analog pins don't require explicit pinMode for analogRead,
    // but we set resolution explicitly.
    analogReadResolution(12); // 12-bit ADC: 0–4095

    // --- Gas sensor digital pin (optional) ---
    pinMode(GAS_SENSOR_DIGITAL_PIN, INPUT);

    // --- Metal sensor digital inputs ---
    // Enable internal pull-up if sensors are open-collector (NPN)
    if (METAL_ACTIVE_LOW) {
        pinMode(METAL_BIO_PIN, INPUT_PULLUP);
        pinMode(METAL_NONBIO_PIN, INPUT_PULLUP);
    } else {
        pinMode(METAL_BIO_PIN, INPUT);
        pinMode(METAL_NONBIO_PIN, INPUT);
    }

    // --- Ultrasonic trigger pins (output) ---
    pinMode(LEVEL_BIO_TRIG_PIN, OUTPUT);
    pinMode(LEVEL_NONBIO_TRIG_PIN, OUTPUT);
    digitalWrite(LEVEL_BIO_TRIG_PIN, LOW);
    digitalWrite(LEVEL_NONBIO_TRIG_PIN, LOW);

    // --- Ultrasonic echo pins (input) ---
    pinMode(LEVEL_BIO_ECHO_PIN, INPUT);
    pinMode(LEVEL_NONBIO_ECHO_PIN, INPUT);

    // --- HX711 load cell amplifiers ---
    hx711Bio.begin(HX711_BIO_DOUT_PIN, HX711_BIO_SCK_PIN);
    hx711NonBio.begin(HX711_NONBIO_DOUT_PIN, HX711_NONBIO_SCK_PIN);

    // Set initial scale factors (placeholder — must calibrate)
    hx711Bio.set_scale(calibFactorBio);
    hx711NonBio.set_scale(calibFactorNonBio);

    // Tare on startup (assumes bins are empty at power-on)
    // If bins are not empty at startup, call sensors_tareWeight() manually
    if (hx711Bio.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        hx711Bio.tare(HX711_AVG_READINGS);
        Serial.println(F("[SENSORS] HX711 Bio: Tared on startup"));
    } else {
        Serial.println(F("[SENSORS] HX711 Bio: NOT RESPONDING — check wiring"));
    }

    if (hx711NonBio.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        hx711NonBio.tare(HX711_AVG_READINGS);
        Serial.println(F("[SENSORS] HX711 NonBio: Tared on startup"));
    } else {
        Serial.println(F("[SENSORS] HX711 NonBio: NOT RESPONDING — check wiring"));
    }

    // --- Gas sensor warm-up tracking ---
    gasWarmupStartMs = millis();
    Serial.println(F("[SENSORS] Gas sensor warm-up started"));

    Serial.println(F("[SENSORS] All sensors initialised"));
}

bool sensors_gasWarmupComplete() {
    return (millis() - gasWarmupStartMs) >= GAS_WARMUP_TIME_MS;
}

// ============================================================================
// INDIVIDUAL SENSOR READS
// ============================================================================

GasReading sensors_readGas() {
    GasReading reading;
    reading.rawValue = readAnalogAvg(GAS_SENSOR_ANALOG_PIN);
    reading.digitalState = digitalRead(GAS_SENSOR_DIGITAL_PIN);

    if (reading.rawValue < 0) {
        reading.status = SENSOR_DISCONNECTED;
        reading.aboveThreshold = false;
    } else if (!sensors_gasWarmupComplete()) {
        reading.status = SENSOR_WARMING_UP;
        reading.aboveThreshold = false;
    } else {
        reading.status = SENSOR_OK;
        reading.aboveThreshold = (reading.rawValue >= GAS_THRESHOLD_HIGH);
    }

    return reading;
}

MoistureReading sensors_readMoisture(BinType bin) {
    MoistureReading reading;
    int pin = (bin == BIN_BIODEGRADABLE) ? MOISTURE_BIO_PIN : MOISTURE_NONBIO_PIN;

    reading.rawValue = readAnalogAvg(pin);

    if (reading.rawValue < 0) {
        reading.status = SENSOR_DISCONNECTED;
        reading.level = MOISTURE_UNKNOWN;
        return reading;
    }

    reading.status = SENSOR_OK;

    // Interpret moisture level based on sensor polarity
    int effectiveValue = reading.rawValue;
    if (MOISTURE_POLARITY_INVERTED) {
        // For capacitive sensors: lower raw value = more moisture
        // Compare raw directly (lower = wetter)
        if (effectiveValue <= MOISTURE_THRESHOLD_WET) {
            reading.level = MOISTURE_WET;
        } else if (effectiveValue >= MOISTURE_THRESHOLD_DRY) {
            reading.level = MOISTURE_DRY;
        } else {
            reading.level = MOISTURE_INTERMEDIATE;
        }
    } else {
        // For resistive sensors: higher raw value = more moisture
        if (effectiveValue >= MOISTURE_THRESHOLD_DRY) {
            reading.level = MOISTURE_WET;
        } else if (effectiveValue <= MOISTURE_THRESHOLD_WET) {
            reading.level = MOISTURE_DRY;
        } else {
            reading.level = MOISTURE_INTERMEDIATE;
        }
    }

    return reading;
}

MetalReading sensors_readMetal(BinType bin) {
    MetalReading reading;
    int pin = (bin == BIN_BIODEGRADABLE) ? METAL_BIO_PIN : METAL_NONBIO_PIN;

    reading.rawPinState = digitalRead(pin);
    reading.status = SENSOR_OK;

    // Apply polarity correction
    if (METAL_ACTIVE_LOW) {
        // Active LOW: pin LOW means metal detected
        reading.metalDetected = (reading.rawPinState == LOW);
    } else {
        // Active HIGH: pin HIGH means metal detected
        reading.metalDetected = (reading.rawPinState == HIGH);
    }

    return reading;
}

WeightReading sensors_readWeight(BinType bin) {
    WeightReading reading;
    HX711& hx = (bin == BIN_BIODEGRADABLE) ? hx711Bio : hx711NonBio;
    bool calibrated = (bin == BIN_BIODEGRADABLE) ? isCalibratedBio : isCalibratedNonBio;

    reading.isCalibrated = calibrated;

    // Check if HX711 is responding
    if (!hx.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        reading.status = SENSOR_TIMEOUT;
        reading.weightGrams = 0.0f;
        reading.rawValue = 0;
        return reading;
    }

    // Get averaged reading
    reading.rawValue = hx.read_average(HX711_AVG_READINGS);
    reading.weightGrams = hx.get_units(HX711_AVG_READINGS);

    // Validate reading
    if (reading.weightGrams < -WEIGHT_MIN_VALID_GRAMS) {
        // Significant negative weight: likely needs re-taring
        reading.status = SENSOR_NOT_CALIBRATED;
    } else if (reading.weightGrams > WEIGHT_MAX_CAPACITY_GRAMS) {
        // Exceeds expected maximum
        reading.status = SENSOR_OUT_OF_RANGE;
    } else if (!calibrated) {
        reading.status = SENSOR_NOT_CALIBRATED;
    } else {
        reading.status = SENSOR_OK;
    }

    // Clamp small negatives to zero (normal tare drift)
    if (reading.weightGrams < 0.0f && reading.weightGrams > -WEIGHT_MIN_VALID_GRAMS) {
        reading.weightGrams = 0.0f;
    }

    return reading;
}

LevelReading sensors_readLevel(BinType bin) {
    LevelReading reading;

    int trigPin, echoPin;
    if (bin == BIN_BIODEGRADABLE) {
        trigPin = LEVEL_BIO_TRIG_PIN;
        echoPin = LEVEL_BIO_ECHO_PIN;
    } else {
        trigPin = LEVEL_NONBIO_TRIG_PIN;
        echoPin = LEVEL_NONBIO_ECHO_PIN;
    }

    // Average multiple ultrasonic readings for stability
    float totalDist = 0.0f;
    int validReadings = 0;
    const int NUM_LEVEL_SAMPLES = 3;

    for (int i = 0; i < NUM_LEVEL_SAMPLES; i++) {
        float d = readUltrasonicCm(trigPin, echoPin);
        if (d > 0) {
            totalDist += d;
            validReadings++;
        }
        delay(30); // HC-SR04 needs ~30ms between readings
    }

    if (validReadings == 0) {
        reading.distanceCm = -1.0f;
        reading.fillPercentage = -1.0f;
        reading.fillStatus = BIN_LEVEL_UNKNOWN;
        reading.status = SENSOR_DISCONNECTED;
        return reading;
    }

    reading.distanceCm = totalDist / validReadings;
    reading.fillPercentage = distanceToFillPercent(reading.distanceCm);
    reading.status = SENSOR_OK;

    // Determine fill status
    if (reading.fillPercentage >= BIN_LEVEL_FULL_PCT) {
        reading.fillStatus = BIN_FULL;
    } else if (reading.fillPercentage >= BIN_LEVEL_NEAR_FULL_PCT) {
        reading.fillStatus = BIN_NEAR_CAPACITY;
    } else if (reading.fillPercentage > 5.0f) {
        reading.fillStatus = BIN_NORMAL;
    } else {
        reading.fillStatus = BIN_EMPTY;
    }

    return reading;
}

// ============================================================================
// AGGREGATED READ
// ============================================================================

SystemData sensors_readAll() {
    SystemData data;
    data.timestampMs = millis();

    // Shared gas sensor
    data.gas = sensors_readGas();

    // Per-bin sensors
    for (int b = 0; b < BIN_COUNT; b++) {
        BinType bin = (BinType)b;
        data.bins[b].binType = bin;
        data.bins[b].moisture = sensors_readMoisture(bin);
        data.bins[b].metal = sensors_readMetal(bin);
        data.bins[b].weight = sensors_readWeight(bin);
        data.bins[b].level = sensors_readLevel(bin);
    }

    return data;
}

// ============================================================================
// CALIBRATION
// ============================================================================

void sensors_tareWeight(BinType bin) {
    HX711& hx = (bin == BIN_BIODEGRADABLE) ? hx711Bio : hx711NonBio;
    if (hx.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        hx.tare(HX711_AVG_READINGS);
        Serial.print(F("[SENSORS] Tared load cell: "));
        Serial.println(bin == BIN_BIODEGRADABLE ? "Bio" : "NonBio");
    } else {
        Serial.print(F("[SENSORS] Tare FAILED (timeout): "));
        Serial.println(bin == BIN_BIODEGRADABLE ? "Bio" : "NonBio");
    }
}

void sensors_setCalibrationFactor(BinType bin, float factor) {
    if (bin == BIN_BIODEGRADABLE) {
        calibFactorBio = factor;
        hx711Bio.set_scale(factor);
        isCalibratedBio = true;
        Serial.print(F("[SENSORS] Bio calibration factor set: "));
    } else {
        calibFactorNonBio = factor;
        hx711NonBio.set_scale(factor);
        isCalibratedNonBio = true;
        Serial.print(F("[SENSORS] NonBio calibration factor set: "));
    }
    Serial.println(factor);
}

float sensors_getCalibrationFactor(BinType bin) {
    return (bin == BIN_BIODEGRADABLE) ? calibFactorBio : calibFactorNonBio;
}
