/**
 * @file esp32_sensors.ino
 * @brief Dedicated Firmware for Module B — ESP32 Sensor Hub
 *
 * INTELLIGENT SOLID WASTE SEGREGATION SYSTEM
 * Physical Target: ESP32 DevKit V1 (3.3V Logic, 12-bit ADC 0-4095)
 *
 * Dedicated Hardware Responsibilities:
 *   1. Capacitive Soil Moisture Sensor on ADC1 (GPIO 34 / ADC1_CH6)
 *      - 12-bit resolution (0-4095)
 *      - ADC1 is immune to Wi-Fi channel conflicts
 *      - Capacitive sensor: lower raw ADC = higher moisture
 *   2. Load Cell + HX711 Amplifier on Digital GPIOs
 *      - DOUT: GPIO 16
 *      - SCK:  GPIO 4
 *   3. Diagnostic Fault / Heartbeat LED on GPIO 2
 *
 * Telemetry Protocol:
 *   Emits JSON Lines formatted telemetry at 115200 baud:
 *   {"v":1,"dev":"ESP32-WS01","seq":10,"up":10,"moist_raw":2650,"moist_pct":42.5,"moist_ok":true,"moist_cal":true,"weight_g":152.0,"weight_raw":163840,"weight_ok":true,"weight_cal":true,"faults":[]}
 *
 * Optional Wi-Fi Transmission:
 *   Can also transmit HTTP POST to http://<laptop_ip>:8080/api/telemetry/esp32
 */

#include <Arduino.h>
#include <HX711.h>

// ============================================================================
// SYSTEM IDENTIFICATION
// ============================================================================
#define FIRMWARE_VERSION        "2.1.0-ESP32"
#define DEVICE_ID               "ESP32-WS01"
#define TELEMETRY_PROTOCOL_VER  1
#define SERIAL_BAUD_RATE        115200

// ============================================================================
// PIN ASSIGNMENTS (ESP32 DevKit V1)
// ============================================================================
// Capacitive Moisture Sensor: ADC1_CH6 (Input only, 0-3.3V safe)
#define PIN_MOISTURE_ADC        34

// Load Cell HX711 Amplifier
#define PIN_HX711_DOUT          16
#define PIN_HX711_SCK           4

// Status & Fault LED (On-board LED)
#define PIN_LED_STATUS          2

// ============================================================================
// CALIBRATION PARAMETERS & THRESHOLDS
// ============================================================================
// ESP32 12-Bit ADC: 0 to 4095
#define MOISTURE_AIR_RAW_DEFAULT    3200   // Dry air raw ADC (0% moisture)
#define MOISTURE_WATER_RAW_DEFAULT  1400   // Submerged in water raw ADC (100% moisture)
#define MOISTURE_ADC_MIN_VALID      200    // Short to GND threshold
#define MOISTURE_ADC_MAX_VALID      3950   // Open circuit threshold

// HX711 Parameters
#define HX711_CALIBRATION_DEFAULT   420.0f // Counts per gram placeholder
#define HX711_TIMEOUT_MS            300    // Non-blocking timeout
#define HX711_AVG_SAMPLES           3      // Moving average samples
#define WEIGHT_MAX_CAPACITY_G       10000.0f
#define WEIGHT_MIN_VALID_G          2.0f

#define TELEMETRY_INTERVAL_MS       1000

// ============================================================================
// HARDWARE INSTANCES & STATE
// ============================================================================
static HX711 scale;
static unsigned long lastTelemetryDispatchMs = 0;
static unsigned long sequenceNumber = 0;

static int   calibratedAirRaw = MOISTURE_AIR_RAW_DEFAULT;
static int   calibratedWaterRaw = MOISTURE_WATER_RAW_DEFAULT;
static bool  isMoistureCalibrated = false;

static float weightCalibrationFactor = HX711_CALIBRATION_DEFAULT;
static bool  isWeightCalibrated = false;

// Fault Bitmask
#define FAULT_NONE                 0x00
#define FAULT_MOISTURE_OFFLINE     0x01
#define FAULT_HX711_TIMEOUT        0x02
#define FAULT_CALIBRATION_REQUIRED 0x08

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(200);

    pinMode(PIN_LED_STATUS, OUTPUT);
    digitalWrite(PIN_LED_STATUS, LOW);

    // Configure 12-bit ADC with 11dB attenuation for full 0–3.3V range
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    // Initialize HX711
    scale.begin(PIN_HX711_DOUT, PIN_HX711_SCK);
    scale.set_scale(weightCalibrationFactor);

    if (scale.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        scale.tare(HX711_AVG_SAMPLES);
        digitalWrite(PIN_LED_STATUS, HIGH);
        delay(200);
        digitalWrite(PIN_LED_STATUS, LOW);
    }

    Serial.println();
    Serial.println(F("=================================================="));
    Serial.println(F(" INTELLIGENT WASTE SEGREGATION - MODULE B (ESP32) "));
    Serial.println(F(" Firmware: 2.1.0-ESP32 | Target: ESP32 DevKit V1  "));
    Serial.println(F(" Dedicated to: Moisture (GPIO 34), HX711 (16/4)   "));
    Serial.println(F(" Telemetry: JSON Lines (115200 baud)             "));
    Serial.println(F("=================================================="));
    Serial.println();
}

void loop() {
    unsigned long now = millis();

    // Periodic Telemetry Dispatch
    if (now - lastTelemetryDispatchMs >= TELEMETRY_INTERVAL_MS) {
        lastTelemetryDispatchMs = now;
        sequenceNumber++;

        // 1. Read Capacitive Moisture (12-bit ADC, 5-sample average)
        long moistSum = 0;
        for (int i = 0; i < 5; i++) {
            moistSum += analogRead(PIN_MOISTURE_ADC);
            delayMicroseconds(200);
        }
        int moistRaw = moistSum / 5;

        bool moistOk = (moistRaw >= MOISTURE_ADC_MIN_VALID && moistRaw <= MOISTURE_ADC_MAX_VALID);
        float moistPct = 0.0f;
        if (moistOk && isMoistureCalibrated && (calibratedAirRaw > calibratedWaterRaw)) {
            moistPct = ((float)(calibratedAirRaw - moistRaw) / (float)(calibratedAirRaw - calibratedWaterRaw)) * 100.0f;
            if (moistPct < 0.0f) moistPct = 0.0f;
            if (moistPct > 100.0f) moistPct = 100.0f;
        }

        // 2. Read Load Cell
        bool weightOk = false;
        long weightRaw = 0;
        float weightGrams = 0.0f;

        if (scale.wait_ready_timeout(HX711_TIMEOUT_MS)) {
            weightRaw = scale.read_average(HX711_AVG_SAMPLES);
            weightOk = true;
            if (isWeightCalibrated) {
                weightGrams = scale.get_units(HX711_AVG_SAMPLES);
                if (weightGrams < 0.0f) weightGrams = 0.0f;
            }
        }

        // 3. Evaluate Faults
        uint8_t faultBitmask = FAULT_NONE;
        if (!moistOk) faultBitmask |= FAULT_MOISTURE_OFFLINE;
        if (!weightOk) faultBitmask |= FAULT_HX711_TIMEOUT;
        if (!isMoistureCalibrated || !isWeightCalibrated) faultBitmask |= FAULT_CALIBRATION_REQUIRED;

        // Drive Status LED: blink on valid cycle, solid if hardware fault
        if (faultBitmask & (FAULT_MOISTURE_OFFLINE | FAULT_HX711_TIMEOUT)) {
            digitalWrite(PIN_LED_STATUS, HIGH);
        } else {
            digitalWrite(PIN_LED_STATUS, (sequenceNumber % 2 == 0) ? HIGH : LOW);
        }

        // 4. Emit JSON Lines Telemetry Packet
        Serial.print(F("{\"v\":"));
        Serial.print(TELEMETRY_PROTOCOL_VER);
        Serial.print(F(",\"dev\":\""));
        Serial.print(F(DEVICE_ID));
        Serial.print(F("\",\"seq\":"));
        Serial.print(sequenceNumber);
        Serial.print(F(",\"up\":"));
        Serial.print(now / 1000);

        // Moisture fields
        Serial.print(F(",\"moist_raw\":"));
        Serial.print(moistRaw);

        Serial.print(F(",\"moist_pct\":"));
        if (moistOk && isMoistureCalibrated) {
            Serial.print(moistPct, 1);
        } else {
            Serial.print(F("null"));
        }

        Serial.print(F(",\"moist_ok\":"));
        Serial.print(moistOk ? F("true") : F("false"));

        Serial.print(F(",\"moist_cal\":"));
        Serial.print(isMoistureCalibrated ? F("true") : F("false"));

        // Weight fields
        Serial.print(F(",\"weight_g\":"));
        if (weightOk && isWeightCalibrated) {
            Serial.print(weightGrams, 1);
        } else {
            Serial.print(F("null"));
        }

        Serial.print(F(",\"weight_raw\":"));
        Serial.print(weightRaw);

        Serial.print(F(",\"weight_ok\":"));
        Serial.print(weightOk ? F("true") : F("false"));

        Serial.print(F(",\"weight_cal\":"));
        Serial.print(isWeightCalibrated ? F("true") : F("false"));

        // Faults array
        Serial.print(F(",\"faults\":["));
        bool firstFault = true;
        if (faultBitmask & FAULT_MOISTURE_OFFLINE) {
            Serial.print(F("\"MOISTURE_OFFLINE\""));
            firstFault = false;
        }
        if (faultBitmask & FAULT_HX711_TIMEOUT) {
            if (!firstFault) Serial.print(F(","));
            Serial.print(F("\"HX711_TIMEOUT\""));
            firstFault = false;
        }
        if (faultBitmask & FAULT_CALIBRATION_REQUIRED) {
            if (!firstFault) Serial.print(F(","));
            Serial.print(F("\"CALIBRATION_REQUIRED\""));
        }
        Serial.println(F("]}"));
    }
}
