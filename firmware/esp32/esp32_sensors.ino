/**
 * @file esp32_sensors.ino
 * @brief Dedicated Firmware for Module B — ESP32 Multi-Channel Sensor Hub
 *
 * INTELLIGENT SOLID WASTE SEGREGATION SYSTEM
 * Physical Target: ESP32 DevKit V1 (3.3V Logic, 12-bit ADC 0-4095)
 *
 * 4 INDEPENDENT SENSOR CHANNELS:
 *   1. Capacitive Moisture C1: GPIO 34 (ADC1_CH6) — Compartment A (Biodegradable)
 *   2. Capacitive Moisture C2: GPIO 35 (ADC1_CH7) — Compartment B (Non-Biodegradable)
 *      - Note: Both on ADC1, safe from Wi-Fi ADC2 conflicts
 *   3. Load Cell 1 (HX711): DOUT GPIO 16, SCK GPIO 4 — Compartment A (Biodegradable Mass)
 *   4. Load Cell 2 (HX711): DOUT GPIO 17, SCK GPIO 18 — Compartment B (Non-Biodegradable Mass)
 *
 * HARDWARE PERIPHERALS:
 *   - Status & Diagnostic LED: GPIO 2 (Onboard blue LED)
 *   - Modular I2C LCD (16x2 / 20x4): SDA GPIO 21, SCL GPIO 22
 *   - Non-Volatile Storage (Preferences/NVS) for persistent calibration parameters
 *
 * CROSS-DEVICE LID STATE SYNCHRONIZATION:
 *   - Receives synchronized Uno lid state frames from host/gateway over Serial.
 *   - Detects staleness if updates stop (>5000ms).
 */

#include <Arduino.h>
#include <Wire.h>
#include <HX711.h>
#include <Preferences.h>
#include <LiquidCrystal_I2C.h>

// ============================================================================
// SYSTEM IDENTIFICATION
// ============================================================================
#define FIRMWARE_VERSION        "2.2.0-ESP32"
#define DEVICE_ID               "ESP32-WS01"
#define TELEMETRY_PROTOCOL_VER  1
#define SERIAL_BAUD_RATE        115200

// ============================================================================
// HARDWARE PIN ASSIGNMENTS (ESP32 DevKit V1)
// ============================================================================
// Capacitive Moisture Sensors (ADC1: Input-only, 3.3V safe)
#define PIN_MOISTURE_C1_ADC     34
#define PIN_MOISTURE_C2_ADC     35

// Load Cell 1 HX711 (Compartment A)
#define PIN_HX711_LC1_DOUT      16
#define PIN_HX711_LC1_SCK       4

// Load Cell 2 HX711 (Compartment B)
#define PIN_HX711_LC2_DOUT      17
#define PIN_HX711_LC2_SCK       18

// Status & Diagnostic LED
#define PIN_LED_STATUS          2

// Modular I2C LCD Configuration
#define LCD_ESP_ENABLED         1
#define LCD_ESP_I2C_ADDR        0x27    // Standard address (or 0x3F)
#define LCD_ESP_COLS            16
#define LCD_ESP_ROWS            2
#define PIN_I2C_SDA             21
#define PIN_I2C_SCL             22
#define LCD_PAGE_ROTATE_MS      3500

// ============================================================================
// CALIBRATION DEFAULTS & THRESHOLDS (12-Bit ADC: 0 - 4095)
// ============================================================================
#define C1_AIR_RAW_DEFAULT      3200
#define C1_WATER_RAW_DEFAULT    1400
#define C2_AIR_RAW_DEFAULT      3200
#define C2_WATER_RAW_DEFAULT    1400

#define MOIST_ADC_MIN_VALID     200     // Below indicates short circuit to GND
#define MOIST_ADC_MAX_VALID     3950    // Above indicates open circuit / disconnect

#define LC1_FACTOR_DEFAULT      420.0f
#define LC2_FACTOR_DEFAULT      420.0f
#define HX711_TIMEOUT_MS        300
#define HX711_AVG_SAMPLES       3
#define WEIGHT_MAX_CAPACITY_G   10000.0f
#define WEIGHT_MIN_VALID_G      2.0f

#define TELEMETRY_INTERVAL_MS   1000
#define LID_SYNC_TIMEOUT_MS     5000

// ============================================================================
// FAULT BITMASKS
// ============================================================================
#define FAULT_NONE              0x00
#define FAULT_C1_OFFLINE        0x01
#define FAULT_C2_OFFLINE        0x02
#define FAULT_LC1_TIMEOUT       0x04
#define FAULT_LC2_TIMEOUT       0x08
#define FAULT_CALIB_REQUIRED    0x10
#define FAULT_LID_SYNC_STALE    0x20

// ============================================================================
// HARDWARE & DRIVER INSTANCES
// ============================================================================
static HX711 scale1;
static HX711 scale2;
static Preferences prefs;
#if LCD_ESP_ENABLED
static LiquidCrystal_I2C lcd(LCD_ESP_I2C_ADDR, LCD_ESP_COLS, LCD_ESP_ROWS);
#endif

// System State
static unsigned long sequenceNumber = 0;
static unsigned long lastTelemetryDispatchMs = 0;
static unsigned long lastLcdRotateMs = 0;
static uint8_t lcdActivePage = 0;
static bool lcdHardwareDetected = false;

// Calibration & Persistence State
static int c1AirRaw = C1_AIR_RAW_DEFAULT;
static int c1WaterRaw = C1_WATER_RAW_DEFAULT;
static bool isC1Calibrated = false;

static int c2AirRaw = C2_AIR_RAW_DEFAULT;
static int c2WaterRaw = C2_WATER_RAW_DEFAULT;
static bool isC2Calibrated = false;

static float lc1Factor = LC1_FACTOR_DEFAULT;
static long lc1TareOffset = 0;
static bool isLc1Calibrated = false;

static float lc2Factor = LC2_FACTOR_DEFAULT;
static long lc2TareOffset = 0;
static bool isLc2Calibrated = false;

// Synchronized Uno Lid State
static char syncedLidState[16] = "CLOSED";
static unsigned long lastLidSyncMs = 0;
static bool isLidSyncFresh = false;

// Forward Declarations
void loadCalibrationFromNVS();
void saveCalibrationToNVS();
void processIncomingSerialCommands();
void refreshLCD(int c1Raw, float c1Pct, bool c1Ok,
                int c2Raw, float c2Pct, bool c2Ok,
                float lc1Weight, bool lc1Ok,
                float lc2Weight, bool lc2Ok,
                uint8_t faultBitmask);

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(200);

    pinMode(PIN_LED_STATUS, OUTPUT);
    digitalWrite(PIN_LED_STATUS, LOW);

    // 1. Configure 12-bit ADC with 11dB attenuation for 0-3.3V range
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);

    // 2. Load persistent calibration from ESP32 NVS (Preferences)
    loadCalibrationFromNVS();

    // 3. Initialize HX711 Load Cell 1
    scale1.begin(PIN_HX711_LC1_DOUT, PIN_HX711_LC1_SCK);
    scale1.set_scale(lc1Factor);
    if (scale1.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        if (lc1TareOffset != 0) {
            scale1.set_offset(lc1TareOffset);
        } else {
            scale1.tare(HX711_AVG_SAMPLES);
        }
    }

    // 4. Initialize HX711 Load Cell 2
    scale2.begin(PIN_HX711_LC2_DOUT, PIN_HX711_LC2_SCK);
    scale2.set_scale(lc2Factor);
    if (scale2.wait_ready_timeout(HX711_TIMEOUT_MS)) {
        if (lc2TareOffset != 0) {
            scale2.set_offset(lc2TareOffset);
        } else {
            scale2.tare(HX711_AVG_SAMPLES);
        }
    }

    // 5. Initialize Modular I2C LCD display
#if LCD_ESP_ENABLED
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.beginTransmission(LCD_ESP_I2C_ADDR);
    byte err = Wire.endTransmission();
    if (err == 0) {
        lcdHardwareDetected = true;
        lcd.init();
        lcd.backlight();
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(F("ESP32-WS01 INIT"));
        lcd.setCursor(0, 1);
        lcd.print(F("4-CHAN HUB READY"));
    } else {
        lcdHardwareDetected = false;
    }
#endif

    // Flash status LED on successful init
    digitalWrite(PIN_LED_STATUS, HIGH);
    delay(300);
    digitalWrite(PIN_LED_STATUS, LOW);

    Serial.println();
    Serial.println(F("=========================================================="));
    Serial.println(F(" INTELLIGENT WASTE SEGREGATION - MODULE B (ESP32 SENSOR HUB) "));
    Serial.println(F(" Firmware: 2.2.0-ESP32 | Target: ESP32 DevKit V1          "));
    Serial.println(F(" Channels: C1 (34), C2 (35), LC1 (16/4), LC2 (17/18)     "));
    Serial.println(F(" LCD: I2C (21/22) | NVS Calibration Persistence: Enabled   "));
    Serial.println(F("=========================================================="));
    Serial.println();
}

void loop() {
    unsigned long now = millis();

    // 1. Process incoming host commands & Uno lid synchronization
    processIncomingSerialCommands();

    // 2. Evaluate lid synchronization freshness
    if (lastLidSyncMs > 0 && (now - lastLidSyncMs <= LID_SYNC_TIMEOUT_MS)) {
        isLidSyncFresh = true;
    } else {
        isLidSyncFresh = false;
        if (lastLidSyncMs > 0 && strcmp(syncedLidState, "UNKNOWN") != 0 && (now - lastLidSyncMs > LID_SYNC_TIMEOUT_MS)) {
            strncpy(syncedLidState, "STALE", sizeof(syncedLidState) - 1);
        }
    }

    // 3. Periodic Sensor Acquisition, LCD Refresh & Telemetry Transmission (1Hz)
    if (now - lastTelemetryDispatchMs >= TELEMETRY_INTERVAL_MS) {
        lastTelemetryDispatchMs = now;
        sequenceNumber++;

        // --- Read Capacitive Moisture C1 ---
        long c1Sum = 0;
        for (int i = 0; i < 5; i++) {
            c1Sum += analogRead(PIN_MOISTURE_C1_ADC);
            delayMicroseconds(150);
        }
        int c1Raw = c1Sum / 5;
        bool c1Ok = (c1Raw >= MOIST_ADC_MIN_VALID && c1Raw <= MOIST_ADC_MAX_VALID);
        float c1Pct = 0.0f;
        if (c1Ok && isC1Calibrated && (c1AirRaw > c1WaterRaw)) {
            c1Pct = ((float)(c1AirRaw - c1Raw) / (float)(c1AirRaw - c1WaterRaw)) * 100.0f;
            if (c1Pct < 0.0f) c1Pct = 0.0f;
            if (c1Pct > 100.0f) c1Pct = 100.0f;
        }

        // --- Read Capacitive Moisture C2 ---
        long c2Sum = 0;
        for (int i = 0; i < 5; i++) {
            c2Sum += analogRead(PIN_MOISTURE_C2_ADC);
            delayMicroseconds(150);
        }
        int c2Raw = c2Sum / 5;
        bool c2Ok = (c2Raw >= MOIST_ADC_MIN_VALID && c2Raw <= MOIST_ADC_MAX_VALID);
        float c2Pct = 0.0f;
        if (c2Ok && isC2Calibrated && (c2AirRaw > c2WaterRaw)) {
            c2Pct = ((float)(c2AirRaw - c2Raw) / (float)(c2AirRaw - c2WaterRaw)) * 100.0f;
            if (c2Pct < 0.0f) c2Pct = 0.0f;
            if (c2Pct > 100.0f) c2Pct = 100.0f;
        }

        // --- Read Load Cell 1 (HX711) ---
        bool lc1Ok = false;
        long lc1Raw = 0;
        float lc1Weight = 0.0f;
        if (scale1.wait_ready_timeout(HX711_TIMEOUT_MS)) {
            lc1Raw = scale1.read_average(HX711_AVG_SAMPLES);
            lc1Ok = true;
            if (isLc1Calibrated) {
                lc1Weight = scale1.get_units(HX711_AVG_SAMPLES);
                if (lc1Weight < 0.0f) lc1Weight = 0.0f;
            }
        }

        // --- Read Load Cell 2 (HX711) ---
        bool lc2Ok = false;
        long lc2Raw = 0;
        float lc2Weight = 0.0f;
        if (scale2.wait_ready_timeout(HX711_TIMEOUT_MS)) {
            lc2Raw = scale2.read_average(HX711_AVG_SAMPLES);
            lc2Ok = true;
            if (isLc2Calibrated) {
                lc2Weight = scale2.get_units(HX711_AVG_SAMPLES);
                if (lc2Weight < 0.0f) lc2Weight = 0.0f;
            }
        }

        // --- Fault Bitmask Evaluation ---
        uint8_t faultBitmask = FAULT_NONE;
        if (!c1Ok) faultBitmask |= FAULT_C1_OFFLINE;
        if (!c2Ok) faultBitmask |= FAULT_C2_OFFLINE;
        if (!lc1Ok) faultBitmask |= FAULT_LC1_TIMEOUT;
        if (!lc2Ok) faultBitmask |= FAULT_LC2_TIMEOUT;
        if (!isC1Calibrated || !isC2Calibrated || !isLc1Calibrated || !isLc2Calibrated) {
            faultBitmask |= FAULT_CALIB_REQUIRED;
        }
        if (!isLidSyncFresh) {
            faultBitmask |= FAULT_LID_SYNC_STALE;
        }

        // Drive Status LED: blink on nominal loop, solid if active sensor fault
        if (faultBitmask & (FAULT_C1_OFFLINE | FAULT_C2_OFFLINE | FAULT_LC1_TIMEOUT | FAULT_LC2_TIMEOUT)) {
            digitalWrite(PIN_LED_STATUS, HIGH);
        } else {
            digitalWrite(PIN_LED_STATUS, (sequenceNumber % 2 == 0) ? HIGH : LOW);
        }

        // Refresh Modular LCD Display
        refreshLCD(c1Raw, c1Pct, c1Ok, c2Raw, c2Pct, c2Ok, lc1Weight, lc1Ok, lc2Weight, lc2Ok, faultBitmask);

        // --- Emit Multi-Channel JSON Lines Telemetry ---
        Serial.print(F("{\"v\":"));
        Serial.print(TELEMETRY_PROTOCOL_VER);
        Serial.print(F(",\"dev\":\""));
        Serial.print(F(DEVICE_ID));
        Serial.print(F("\",\"seq\":"));
        Serial.print(sequenceNumber);
        Serial.print(F(",\"up\":"));
        Serial.print(now / 1000);

        // Channel C1 (Moisture 1 - Biodegradable)
        Serial.print(F(",\"c1_raw\":"));
        Serial.print(c1Raw);
        Serial.print(F(",\"c1_pct\":"));
        if (c1Ok && isC1Calibrated) Serial.print(c1Pct, 1); else Serial.print(F("null"));
        Serial.print(F(",\"c1_ok\":"));
        Serial.print(c1Ok ? F("true") : F("false"));
        Serial.print(F(",\"c1_cal\":"));
        Serial.print(isC1Calibrated ? F("true") : F("false"));

        // Channel C2 (Moisture 2 - Non-Biodegradable)
        Serial.print(F(",\"c2_raw\":"));
        Serial.print(c2Raw);
        Serial.print(F(",\"c2_pct\":"));
        if (c2Ok && isC2Calibrated) Serial.print(c2Pct, 1); else Serial.print(F("null"));
        Serial.print(F(",\"c2_ok\":"));
        Serial.print(c2Ok ? F("true") : F("false"));
        Serial.print(F(",\"c2_cal\":"));
        Serial.print(isC2Calibrated ? F("true") : F("false"));

        // Channel LC1 (Load Cell 1 - Biodegradable Mass)
        Serial.print(F(",\"lc1_g\":"));
        if (lc1Ok && isLc1Calibrated) Serial.print(lc1Weight, 1); else Serial.print(F("null"));
        Serial.print(F(",\"lc1_raw\":"));
        Serial.print(lc1Raw);
        Serial.print(F(",\"lc1_ok\":"));
        Serial.print(lc1Ok ? F("true") : F("false"));
        Serial.print(F(",\"lc1_cal\":"));
        Serial.print(isLc1Calibrated ? F("true") : F("false"));

        // Channel LC2 (Load Cell 2 - Non-Biodegradable Mass)
        Serial.print(F(",\"lc2_g\":"));
        if (lc2Ok && isLc2Calibrated) Serial.print(lc2Weight, 1); else Serial.print(F("null"));
        Serial.print(F(",\"lc2_raw\":"));
        Serial.print(lc2Raw);
        Serial.print(F(",\"lc2_ok\":"));
        Serial.print(lc2Ok ? F("true") : F("false"));
        Serial.print(F(",\"lc2_cal\":"));
        Serial.print(isLc2Calibrated ? F("true") : F("false"));

        // Backwards compatibility aliases for composite views
        Serial.print(F(",\"moist_raw\":"));
        Serial.print(c1Raw);
        Serial.print(F(",\"moist_pct\":"));
        if (c1Ok && isC1Calibrated) Serial.print(c1Pct, 1); else Serial.print(F("null"));
        Serial.print(F(",\"moist_ok\":"));
        Serial.print(c1Ok ? F("true") : F("false"));
        Serial.print(F(",\"moist_cal\":"));
        Serial.print(isC1Calibrated ? F("true") : F("false"));

        Serial.print(F(",\"weight_g\":"));
        if (lc1Ok && isLc1Calibrated) Serial.print(lc1Weight, 1); else Serial.print(F("null"));
        Serial.print(F(",\"weight_raw\":"));
        Serial.print(lc1Raw);
        Serial.print(F(",\"weight_ok\":"));
        Serial.print(lc1Ok ? F("true") : F("false"));
        Serial.print(F(",\"weight_cal\":"));
        Serial.print(isLc1Calibrated ? F("true") : F("false"));

        // Synchronized Uno Lid State
        Serial.print(F(",\"lid_sync_state\":\""));
        Serial.print(syncedLidState);
        Serial.print(F("\",\"lid_sync_fresh\":"));
        Serial.print(isLidSyncFresh ? F("true") : F("false"));

        // Faults Array
        Serial.print(F(",\"faults\":["));
        bool firstFault = true;
        if (faultBitmask & FAULT_C1_OFFLINE) {
            Serial.print(F("\"C1_MOISTURE_OFFLINE\""));
            firstFault = false;
        }
        if (faultBitmask & FAULT_C2_OFFLINE) {
            if (!firstFault) Serial.print(F(","));
            Serial.print(F("\"C2_MOISTURE_OFFLINE\""));
            firstFault = false;
        }
        if (faultBitmask & FAULT_LC1_TIMEOUT) {
            if (!firstFault) Serial.print(F(","));
            Serial.print(F("\"LC1_HX711_TIMEOUT\""));
            firstFault = false;
        }
        if (faultBitmask & FAULT_LC2_TIMEOUT) {
            if (!firstFault) Serial.print(F(","));
            Serial.print(F("\"LC2_HX711_TIMEOUT\""));
            firstFault = false;
        }
        if (faultBitmask & FAULT_CALIB_REQUIRED) {
            if (!firstFault) Serial.print(F(","));
            Serial.print(F("\"CALIBRATION_REQUIRED\""));
            firstFault = false;
        }
        if (faultBitmask & FAULT_LID_SYNC_STALE) {
            if (!firstFault) Serial.print(F(","));
            Serial.print(F("\"UNO_LID_SYNC_STALE\""));
        }
        Serial.println(F("]}"));
    }
}

// ============================================================================
// MODULAR LCD DISPLAY PAGING IMPLEMENTATION
// ============================================================================
void refreshLCD(int c1Raw, float c1Pct, bool c1Ok,
                int c2Raw, float c2Pct, bool c2Ok,
                float lc1Weight, bool lc1Ok,
                float lc2Weight, bool lc2Ok,
                uint8_t faultBitmask) {
#if LCD_ESP_ENABLED
    if (!lcdHardwareDetected) return;

    unsigned long now = millis();
    if (now - lastLcdRotateMs >= LCD_PAGE_ROTATE_MS) {
        lastLcdRotateMs = now;
        lcdActivePage = (lcdActivePage + 1) % 4;
        lcd.clear();
    }

    if (lcdActivePage == 0) {
        // Page 0: Compartment A (Biodegradable)
        lcd.setCursor(0, 0);
        lcd.print(F("BIN A (BIO):    "));
        lcd.setCursor(0, 1);
        lcd.print(F("M:"));
        if (c1Ok && isC1Calibrated) {
            lcd.print((int)c1Pct);
            lcd.print(F("% "));
        } else {
            lcd.print(F("N/A "));
        }
        lcd.print(F("W:"));
        if (lc1Ok && isLc1Calibrated) {
            lcd.print((int)lc1Weight);
            lcd.print(F("g"));
        } else {
            lcd.print(F("UNCAL"));
        }
    } else if (lcdActivePage == 1) {
        // Page 1: Compartment B (Non-Biodegradable)
        lcd.setCursor(0, 0);
        lcd.print(F("BIN B (NON-BIO):"));
        lcd.setCursor(0, 1);
        lcd.print(F("M:"));
        if (c2Ok && isC2Calibrated) {
            lcd.print((int)c2Pct);
            lcd.print(F("% "));
        } else {
            lcd.print(F("N/A "));
        }
        lcd.print(F("W:"));
        if (lc2Ok && isLc2Calibrated) {
            lcd.print((int)lc2Weight);
            lcd.print(F("g"));
        } else {
            lcd.print(F("UNCAL"));
        }
    } else if (lcdActivePage == 2) {
        // Page 2: Synchronized Uno Lid State
        lcd.setCursor(0, 0);
        lcd.print(F("UNO LID SYNC:   "));
        lcd.setCursor(0, 1);
        lcd.print(F("STATE: "));
        lcd.print(syncedLidState);
        if (isLidSyncFresh) {
            lcd.print(F(" [OK]"));
        } else {
            lcd.print(F(" [!] "));
        }
    } else {
        // Page 3: Sensor Calibration & Diagnostic Summary
        lcd.setCursor(0, 0);
        lcd.print(F("C1:"));
        lcd.print(isC1Calibrated ? F("OK ") : F("CAL "));
        lcd.print(F("C2:"));
        lcd.print(isC2Calibrated ? F("OK") : F("CAL"));

        lcd.setCursor(0, 1);
        lcd.print(F("L1:"));
        lcd.print(isLc1Calibrated ? F("OK ") : F("CAL "));
        lcd.print(F("L2:"));
        lcd.print(isLc2Calibrated ? F("OK") : F("CAL"));
    }
#endif
}

// ============================================================================
// NVS / PREFERENCES PERSISTENCE
// ============================================================================
void loadCalibrationFromNVS() {
    prefs.begin("ws_calib", true); // Read-only mode

    c1AirRaw = prefs.getInt("c1_air", C1_AIR_RAW_DEFAULT);
    c1WaterRaw = prefs.getInt("c1_water", C1_WATER_RAW_DEFAULT);
    isC1Calibrated = prefs.getBool("c1_cal", false);

    c2AirRaw = prefs.getInt("c2_air", C2_AIR_RAW_DEFAULT);
    c2WaterRaw = prefs.getInt("c2_water", C2_WATER_RAW_DEFAULT);
    isC2Calibrated = prefs.getBool("c2_cal", false);

    lc1Factor = prefs.getFloat("lc1_fac", LC1_FACTOR_DEFAULT);
    lc1TareOffset = prefs.getLong("lc1_tare", 0);
    isLc1Calibrated = prefs.getBool("lc1_cal", false);

    lc2Factor = prefs.getFloat("lc2_fac", LC2_FACTOR_DEFAULT);
    lc2TareOffset = prefs.getLong("lc2_tare", 0);
    isLc2Calibrated = prefs.getBool("lc2_cal", false);

    prefs.end();
}

void saveCalibrationToNVS() {
    prefs.begin("ws_calib", false); // Read-write mode

    prefs.putInt("c1_air", c1AirRaw);
    prefs.putInt("c1_water", c1WaterRaw);
    prefs.putBool("c1_cal", isC1Calibrated);

    prefs.putInt("c2_air", c2AirRaw);
    prefs.putInt("c2_water", c2WaterRaw);
    prefs.putBool("c2_cal", isC2Calibrated);

    prefs.putFloat("lc1_fac", lc1Factor);
    prefs.putLong("lc1_tare", lc1TareOffset);
    prefs.putBool("lc1_cal", isLc1Calibrated);

    prefs.putFloat("lc2_fac", lc2Factor);
    prefs.putLong("lc2_tare", lc2TareOffset);
    prefs.putBool("lc2_cal", isLc2Calibrated);

    prefs.end();
}

// ============================================================================
// NON-BLOCKING COMMAND PROCESSOR & LID SYNC PARSER
// ============================================================================
void processIncomingSerialCommands() {
    while (Serial.available() > 0) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) continue;

        // 1. Cross-Device Lid Sync Command: {"cmd":"sync_lid","state":"OPEN"} or SYNC:OPEN
        if (line.indexOf("sync_lid") >= 0 || line.startsWith("SYNC:")) {
            if (line.indexOf("\"OPEN\"") >= 0 || line.indexOf(":OPEN") >= 0) {
                strncpy(syncedLidState, "OPEN", sizeof(syncedLidState) - 1);
            } else if (line.indexOf("\"CLOSED\"") >= 0 || line.indexOf(":CLOSED") >= 0) {
                strncpy(syncedLidState, "CLOSED", sizeof(syncedLidState) - 1);
            } else if (line.indexOf("\"HOLD_OPEN\"") >= 0 || line.indexOf(":HOLD") >= 0) {
                strncpy(syncedLidState, "HOLD_OPEN", sizeof(syncedLidState) - 1);
            } else if (line.indexOf("\"COOLDOWN\"") >= 0 || line.indexOf(":COOLDOWN") >= 0) {
                strncpy(syncedLidState, "COOLDOWN", sizeof(syncedLidState) - 1);
            }
            lastLidSyncMs = millis();
            isLidSyncFresh = true;
            Serial.println(F("{\"ack\":\"sync_lid\",\"status\":\"ACCEPTED\"}"));
            continue;
        }

        // 2. Tare Command: {"cmd":"tare","channel":"lc1"} or {"cmd":"tare","channel":"lc2"}
        if (line.indexOf("\"tare\"") >= 0 || line.equalsIgnoreCase("t") || line.indexOf("tare_lc1") >= 0) {
            bool targetLc2 = (line.indexOf("lc2") >= 0);
            if (!targetLc2) {
                if (scale1.wait_ready_timeout(HX711_TIMEOUT_MS)) {
                    scale1.tare(HX711_AVG_SAMPLES);
                    lc1TareOffset = scale1.get_offset();
                    saveCalibrationToNVS();
                    Serial.println(F("{\"ack\":\"tare\",\"channel\":\"lc1\",\"status\":\"COMPLETED\"}"));
                } else {
                    Serial.println(F("{\"ack\":\"tare\",\"channel\":\"lc1\",\"status\":\"FAILED\",\"error\":\"TIMEOUT\"}"));
                }
            } else {
                if (scale2.wait_ready_timeout(HX711_TIMEOUT_MS)) {
                    scale2.tare(HX711_AVG_SAMPLES);
                    lc2TareOffset = scale2.get_offset();
                    saveCalibrationToNVS();
                    Serial.println(F("{\"ack\":\"tare\",\"channel\":\"lc2\",\"status\":\"COMPLETED\"}"));
                } else {
                    Serial.println(F("{\"ack\":\"tare\",\"channel\":\"lc2\",\"status\":\"FAILED\",\"error\":\"TIMEOUT\"}"));
                }
            }
            continue;
        }

        // 3. Known Weight Calibration: {"cmd":"cal_weight","channel":"lc1","ref_g":500}
        if (line.indexOf("cal_weight") >= 0 || line.indexOf("cal_lc1") >= 0 || line.indexOf("cal_lc2") >= 0) {
            bool targetLc2 = (line.indexOf("lc2") >= 0);
            float refGrams = 500.0f;
            int refIdx = line.indexOf("ref_g");
            if (refIdx >= 0) {
                int colonIdx = line.indexOf(':', refIdx);
                if (colonIdx >= 0) {
                    refGrams = line.substring(colonIdx + 1).toFloat();
                }
            }
            if (refGrams <= 5.0f) refGrams = 500.0f;

            if (!targetLc2) {
                if (scale1.wait_ready_timeout(HX711_TIMEOUT_MS)) {
                    long rawReading = scale1.read_average(5);
                    lc1Factor = (float)(rawReading - lc1TareOffset) / refGrams;
                    if (lc1Factor < 10.0f) lc1Factor = LC1_FACTOR_DEFAULT;
                    scale1.set_scale(lc1Factor);
                    isLc1Calibrated = true;
                    saveCalibrationToNVS();
                    Serial.print(F("{\"ack\":\"cal_weight\",\"channel\":\"lc1\",\"factor\":"));
                    Serial.print(lc1Factor, 2);
                    Serial.println(F(",\"status\":\"COMPLETED\"}"));
                } else {
                    Serial.println(F("{\"ack\":\"cal_weight\",\"channel\":\"lc1\",\"status\":\"FAILED\",\"error\":\"TIMEOUT\"}"));
                }
            } else {
                if (scale2.wait_ready_timeout(HX711_TIMEOUT_MS)) {
                    long rawReading = scale2.read_average(5);
                    lc2Factor = (float)(rawReading - lc2TareOffset) / refGrams;
                    if (lc2Factor < 10.0f) lc2Factor = LC2_FACTOR_DEFAULT;
                    scale2.set_scale(lc2Factor);
                    isLc2Calibrated = true;
                    saveCalibrationToNVS();
                    Serial.print(F("{\"ack\":\"cal_weight\",\"channel\":\"lc2\",\"factor\":"));
                    Serial.print(lc2Factor, 2);
                    Serial.println(F(",\"status\":\"COMPLETED\"}"));
                } else {
                    Serial.println(F("{\"ack\":\"cal_weight\",\"channel\":\"lc2\",\"status\":\"FAILED\",\"error\":\"TIMEOUT\"}"));
                }
            }
            continue;
        }

        // 4. Moisture Calibration: Dry Reference
        if (line.indexOf("cal_moist_dry") >= 0) {
            bool targetC2 = (line.indexOf("c2") >= 0);
            if (!targetC2) {
                c1AirRaw = analogRead(PIN_MOISTURE_C1_ADC);
                saveCalibrationToNVS();
                Serial.print(F("{\"ack\":\"cal_moist_dry\",\"channel\":\"c1\",\"raw\":"));
                Serial.print(c1AirRaw);
                Serial.println(F(",\"status\":\"COMPLETED\"}"));
            } else {
                c2AirRaw = analogRead(PIN_MOISTURE_C2_ADC);
                saveCalibrationToNVS();
                Serial.print(F("{\"ack\":\"cal_moist_dry\",\"channel\":\"c2\",\"raw\":"));
                Serial.print(c2AirRaw);
                Serial.println(F(",\"status\":\"COMPLETED\"}"));
            }
            continue;
        }

        // 5. Moisture Calibration: Wet Reference
        if (line.indexOf("cal_moist_wet") >= 0) {
            bool targetC2 = (line.indexOf("c2") >= 0);
            if (!targetC2) {
                c1WaterRaw = analogRead(PIN_MOISTURE_C1_ADC);
                if (c1AirRaw > c1WaterRaw) isC1Calibrated = true;
                saveCalibrationToNVS();
                Serial.print(F("{\"ack\":\"cal_moist_wet\",\"channel\":\"c1\",\"raw\":"));
                Serial.print(c1WaterRaw);
                Serial.println(F(",\"status\":\"COMPLETED\"}"));
            } else {
                c2WaterRaw = analogRead(PIN_MOISTURE_C2_ADC);
                if (c2AirRaw > c2WaterRaw) isC2Calibrated = true;
                saveCalibrationToNVS();
                Serial.print(F("{\"ack\":\"cal_moist_wet\",\"channel\":\"c2\",\"raw\":"));
                Serial.print(c2WaterRaw);
                Serial.println(F(",\"status\":\"COMPLETED\"}"));
            }
            continue;
        }

        // 6. Diagnostics / Status Request
        if (line.indexOf("status") >= 0 || line.equalsIgnoreCase("h")) {
            Serial.print(F("{\"ack\":\"status\",\"dev\":\""));
            Serial.print(F(DEVICE_ID));
            Serial.print(F("\",\"firmware\":\""));
            Serial.print(F(FIRMWARE_VERSION));
            Serial.print(F("\",\"c1_cal\":"));
            Serial.print(isC1Calibrated ? F("true") : F("false"));
            Serial.print(F(",\"c2_cal\":"));
            Serial.print(isC2Calibrated ? F("true") : F("false"));
            Serial.print(F(",\"lc1_cal\":"));
            Serial.print(isLc1Calibrated ? F("true") : F("false"));
            Serial.print(F(",\"lc2_cal\":"));
            Serial.print(isLc2Calibrated ? F("true") : F("false"));
            Serial.print(F(",\"lid_sync\":"));
            Serial.print(isLidSyncFresh ? F("true") : F("false"));
            Serial.println(F("}"));
            continue;
        }

        // Unrecognized command
        Serial.println(F("{\"ack\":\"error\",\"status\":\"UNKNOWN_COMMAND\"}"));
    }
}
