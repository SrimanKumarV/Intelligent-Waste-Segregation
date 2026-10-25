/**
 * @file test_detection.cpp
 * @brief Host-side unit tests for the waste mismatch detection logic
 *
 * This file tests the detection module independently of GPIO/hardware.
 * It constructs synthetic SystemData structs and verifies that
 * detection_analyse() produces the expected results.
 *
 * BUILD & RUN (on host, not ESP32):
 *   g++ -std=c++11 -DUNIT_TEST -I../include test_detection.cpp -o test_detection
 *   ./test_detection
 *
 * Or use PlatformIO native test:
 *   pio test -e native
 *
 * NOTE: This is a SIMULATION for testing decision logic.
 * Results do NOT represent physical hardware test outcomes.
 */

#ifdef UNIT_TEST

// ============================================================================
// MOCK ARDUINO ENVIRONMENT
// ============================================================================
// Provide minimal stubs for Arduino functions used by detection.cpp

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <string>

// Stub Arduino types
typedef unsigned long uint32_t;
typedef unsigned char uint8_t;

class FakeSerial {
public:
    void print(const char* s) { printf("%s", s); }
    void println(const char* s) { printf("%s\n", s); }
    void print(int v) { printf("%d", v); }
    void println(int v) { printf("%d\n", v); }
    void print(float v, int p = 2) { printf("%.*f", p, v); }
    void println(float v, int p = 2) { printf("%.*f\n", p, v); }
    void println() { printf("\n"); }
};

FakeSerial Serial;

// Stub F() macro
#define F(x) (x)

// Stub String class (minimal)
class String {
public:
    std::string data;
    String() {}
    String(const char* s) : data(s) {}
    String& operator+=(const char* s) { data += s; return *this; }
    String& operator+=(const String& s) { data += s.data; return *this; }
    void trim() {
        auto start = data.find_first_not_of(" \t\n\r");
        auto end = data.find_last_not_of(" \t\n\r");
        if (start == std::string::npos) { data = ""; return; }
        data = data.substr(start, end - start + 1);
    }
    bool operator==(const char* s) const { return data == s; }
    const char* c_str() const { return data.c_str(); }
};

// ============================================================================
// INCLUDE PROJECT HEADERS AND SOURCE
// ============================================================================

// Define config values needed by detection
#define MISMATCH_PERSISTENCE_COUNT  3
#define EVIDENCE_WEIGHT_METAL       40
#define EVIDENCE_WEIGHT_MOISTURE    20
#define EVIDENCE_WEIGHT_GAS         15
#define MISMATCH_SCORE_THRESHOLD    30

#include "sensor_types.h"

// Include detection source directly for unit testing
// (In a real project, you'd compile and link separately)
#include "../src/detection.cpp"

// ============================================================================
// TEST INFRASTRUCTURE
// ============================================================================

static int tests_passed = 0;
static int tests_failed = 0;

#define ASSERT_TRUE(cond, msg) do { \
    if (!(cond)) { \
        printf("  FAIL: %s (line %d)\n", msg, __LINE__); \
        tests_failed++; \
    } else { \
        printf("  PASS: %s\n", msg); \
        tests_passed++; \
    } \
} while(0)

#define ASSERT_EQ(a, b, msg) ASSERT_TRUE((a) == (b), msg)
#define ASSERT_GE(a, b, msg) ASSERT_TRUE((a) >= (b), msg)
#define ASSERT_LT(a, b, msg) ASSERT_TRUE((a) < (b), msg)

// ============================================================================
// HELPER: Create default sensor data
// ============================================================================

SystemData makeDefaultData() {
    SystemData d = {};
    d.timestampMs = 1000;

    // Gas sensor: OK, below threshold
    d.gas.rawValue = 500;
    d.gas.digitalState = false;
    d.gas.aboveThreshold = false;
    d.gas.status = SENSOR_OK;

    for (int b = 0; b < BIN_COUNT; b++) {
        d.bins[b].binType = (BinType)b;

        // Moisture: OK, dry
        d.bins[b].moisture.rawValue = 3500;
        d.bins[b].moisture.level = MOISTURE_DRY;
        d.bins[b].moisture.status = SENSOR_OK;

        // Metal: OK, no metal
        d.bins[b].metal.metalDetected = false;
        d.bins[b].metal.rawPinState = true;
        d.bins[b].metal.status = SENSOR_OK;

        // Weight: OK, calibrated, 100g
        d.bins[b].weight.weightGrams = 100.0f;
        d.bins[b].weight.rawValue = 42000;
        d.bins[b].weight.isCalibrated = true;
        d.bins[b].weight.status = SENSOR_OK;

        // Level: OK, 30% full
        d.bins[b].level.distanceCm = 28.0f;
        d.bins[b].level.fillPercentage = 30.0f;
        d.bins[b].level.fillStatus = BIN_NORMAL;
        d.bins[b].level.status = SENSOR_OK;
    }

    return d;
}

// ============================================================================
// TEST CASES
// ============================================================================

void test_normal_bio_readings() {
    printf("\n[TEST] Normal biodegradable bin readings\n");
    detection_init();

    SystemData data = makeDefaultData();
    SystemAnalysis result = detection_analyse(data);

    ASSERT_EQ(result.binResults[BIN_BIODEGRADABLE].systemState & STATE_POSSIBLE_MISMATCH, 0,
              "No mismatch when all readings normal");
    ASSERT_TRUE(!result.binResults[BIN_BIODEGRADABLE].alertActive,
                "Alert should not be active");
    ASSERT_LT(result.binResults[BIN_BIODEGRADABLE].evidenceScore, MISMATCH_SCORE_THRESHOLD,
              "Score below threshold");
}

void test_metal_in_bio_bin() {
    printf("\n[TEST] Metal detected in biodegradable bin\n");
    detection_init();

    SystemData data = makeDefaultData();
    data.bins[BIN_BIODEGRADABLE].metal.metalDetected = true;

    // Need MISMATCH_PERSISTENCE_COUNT consecutive detections
    SystemAnalysis result;
    for (int i = 0; i < MISMATCH_PERSISTENCE_COUNT + 1; i++) {
        result = detection_analyse(data);
    }

    ASSERT_GE(result.binResults[BIN_BIODEGRADABLE].evidenceScore, MISMATCH_SCORE_THRESHOLD,
              "Score should be above threshold with metal in bio bin");
    ASSERT_TRUE(result.binResults[BIN_BIODEGRADABLE].alertActive,
                "Alert should be active after persistence count met");
    ASSERT_TRUE(result.binResults[BIN_BIODEGRADABLE].systemState & STATE_POSSIBLE_MISMATCH,
                "STATE_POSSIBLE_MISMATCH flag should be set");
}

void test_normal_nonbio_readings() {
    printf("\n[TEST] Normal non-biodegradable bin readings\n");
    detection_init();

    SystemData data = makeDefaultData();
    SystemAnalysis result = detection_analyse(data);

    ASSERT_EQ(result.binResults[BIN_NON_BIODEGRADABLE].systemState & STATE_POSSIBLE_MISMATCH, 0,
              "No mismatch with normal readings");
}

void test_wet_nonbio_not_auto_classified() {
    printf("\n[TEST] Wet non-bio material should NOT be automatically classified as biodegradable\n");
    detection_init();

    SystemData data = makeDefaultData();
    // Wet but no gas — should NOT trigger mismatch by moisture alone
    data.bins[BIN_NON_BIODEGRADABLE].moisture.level = MOISTURE_WET;
    data.bins[BIN_NON_BIODEGRADABLE].moisture.rawValue = 800;

    SystemAnalysis result;
    for (int i = 0; i < MISMATCH_PERSISTENCE_COUNT + 1; i++) {
        result = detection_analyse(data);
    }

    // Moisture alone contributes 20, threshold is 30 → should NOT trigger
    ASSERT_LT(result.binResults[BIN_NON_BIODEGRADABLE].evidenceScore, MISMATCH_SCORE_THRESHOLD,
              "Moisture alone should not exceed threshold (wet != biodegradable)");
}

void test_wet_plus_gas_nonbio() {
    printf("\n[TEST] Wet + gas in non-bio bin suggests possible biodegradable waste\n");
    detection_init();

    SystemData data = makeDefaultData();
    data.bins[BIN_NON_BIODEGRADABLE].moisture.level = MOISTURE_WET;
    data.gas.aboveThreshold = true;
    data.gas.rawValue = 2000;

    SystemAnalysis result;
    for (int i = 0; i < MISMATCH_PERSISTENCE_COUNT + 1; i++) {
        result = detection_analyse(data);
    }

    ASSERT_GE(result.binResults[BIN_NON_BIODEGRADABLE].evidenceScore, MISMATCH_SCORE_THRESHOLD,
              "Combined moisture+gas should exceed threshold");
    ASSERT_TRUE(result.binResults[BIN_NON_BIODEGRADABLE].alertActive,
                "Alert should activate with combined evidence");
}

void test_bin_full() {
    printf("\n[TEST] Bin full detection\n");
    detection_init();

    SystemData data = makeDefaultData();
    data.bins[BIN_BIODEGRADABLE].level.fillPercentage = 95.0f;
    data.bins[BIN_BIODEGRADABLE].level.fillStatus = BIN_FULL;

    SystemAnalysis result = detection_analyse(data);

    ASSERT_TRUE(result.binResults[BIN_BIODEGRADABLE].systemState & STATE_BIN_FULL,
                "BIN_FULL state should be set");
}

void test_bin_near_capacity() {
    printf("\n[TEST] Bin near capacity detection\n");
    detection_init();

    SystemData data = makeDefaultData();
    data.bins[BIN_NON_BIODEGRADABLE].level.fillPercentage = 80.0f;
    data.bins[BIN_NON_BIODEGRADABLE].level.fillStatus = BIN_NEAR_CAPACITY;

    SystemAnalysis result = detection_analyse(data);

    ASSERT_TRUE(result.binResults[BIN_NON_BIODEGRADABLE].systemState & STATE_BIN_NEAR_CAPACITY,
                "BIN_NEAR_CAPACITY state should be set");
}

void test_sensor_disconnected() {
    printf("\n[TEST] Disconnected sensor detection\n");
    detection_init();

    SystemData data = makeDefaultData();
    data.bins[BIN_BIODEGRADABLE].weight.status = SENSOR_TIMEOUT;

    SystemAnalysis result = detection_analyse(data);

    ASSERT_TRUE(result.binResults[BIN_BIODEGRADABLE].systemState & STATE_SENSOR_FAULT,
                "SENSOR_FAULT should be set for timed-out HX711");
    ASSERT_TRUE(result.anySensorFault,
                "anySensorFault should be true");
}

void test_uncalibrated_load_cell() {
    printf("\n[TEST] Uncalibrated load cell detection\n");
    detection_init();

    SystemData data = makeDefaultData();
    data.bins[BIN_BIODEGRADABLE].weight.isCalibrated = false;
    data.bins[BIN_BIODEGRADABLE].weight.status = SENSOR_NOT_CALIBRATED;

    SystemAnalysis result = detection_analyse(data);

    ASSERT_TRUE(result.binResults[BIN_BIODEGRADABLE].systemState & STATE_CALIBRATION_NEEDED,
                "CALIBRATION_NEEDED should be set");
    ASSERT_TRUE(result.anyCalibrationNeeded,
                "anyCalibrationNeeded should be true");
}

void test_simultaneous_mismatch_and_full() {
    printf("\n[TEST] Simultaneous mismatch AND full bin conditions\n");
    detection_init();

    SystemData data = makeDefaultData();
    // Metal in bio bin (mismatch)
    data.bins[BIN_BIODEGRADABLE].metal.metalDetected = true;
    // Bin also full
    data.bins[BIN_BIODEGRADABLE].level.fillPercentage = 95.0f;
    data.bins[BIN_BIODEGRADABLE].level.fillStatus = BIN_FULL;

    SystemAnalysis result;
    for (int i = 0; i < MISMATCH_PERSISTENCE_COUNT + 1; i++) {
        result = detection_analyse(data);
    }

    uint8_t state = result.binResults[BIN_BIODEGRADABLE].systemState;
    ASSERT_TRUE(state & STATE_POSSIBLE_MISMATCH,
                "POSSIBLE_MISMATCH should be set");
    ASSERT_TRUE(state & STATE_BIN_FULL,
                "BIN_FULL should ALSO be set (not erased by mismatch)");
}

void test_persistence_prevents_false_alert() {
    printf("\n[TEST] Persistence prevents false alerts from transient readings\n");
    detection_init();

    SystemData data = makeDefaultData();
    data.bins[BIN_BIODEGRADABLE].metal.metalDetected = true;

    // Single detection cycle — should NOT trigger alert
    SystemAnalysis result = detection_analyse(data);

    ASSERT_TRUE(!result.binResults[BIN_BIODEGRADABLE].alertActive,
                "Alert should NOT be active after single detection");
    ASSERT_EQ(result.binResults[BIN_BIODEGRADABLE].persistenceCount, 1,
              "Persistence count should be 1");
}

void test_metal_in_nonbio_is_normal() {
    printf("\n[TEST] Metal in non-biodegradable bin is NORMAL (not an error)\n");
    detection_init();

    SystemData data = makeDefaultData();
    data.bins[BIN_NON_BIODEGRADABLE].metal.metalDetected = true;

    SystemAnalysis result;
    for (int i = 0; i < MISMATCH_PERSISTENCE_COUNT + 1; i++) {
        result = detection_analyse(data);
    }

    ASSERT_TRUE(!(result.binResults[BIN_NON_BIODEGRADABLE].systemState & STATE_POSSIBLE_MISMATCH),
                "Metal in non-bio bin should NOT trigger mismatch");
}

void test_noisy_readings_recovery() {
    printf("\n[TEST] Recovery from noisy readings\n");
    detection_init();

    SystemData dataWithMetal = makeDefaultData();
    dataWithMetal.bins[BIN_BIODEGRADABLE].metal.metalDetected = true;

    SystemData dataNormal = makeDefaultData();

    // 2 cycles with metal (below persistence threshold)
    detection_analyse(dataWithMetal);
    detection_analyse(dataWithMetal);

    // Then normal readings — persistence should decay
    SystemAnalysis result;
    for (int i = 0; i < 5; i++) {
        result = detection_analyse(dataNormal);
    }

    ASSERT_TRUE(!result.binResults[BIN_BIODEGRADABLE].alertActive,
                "Alert should recover after normal readings");
}

// ============================================================================
// MAIN
// ============================================================================

int main() {
    printf("╔══════════════════════════════════════════════════╗\n");
    printf("║  DETECTION LOGIC UNIT TESTS                     ║\n");
    printf("║  (Simulation — NOT hardware test results)       ║\n");
    printf("╚══════════════════════════════════════════════════╝\n");

    test_normal_bio_readings();
    test_metal_in_bio_bin();
    test_normal_nonbio_readings();
    test_wet_nonbio_not_auto_classified();
    test_wet_plus_gas_nonbio();
    test_bin_full();
    test_bin_near_capacity();
    test_sensor_disconnected();
    test_uncalibrated_load_cell();
    test_simultaneous_mismatch_and_full();
    test_persistence_prevents_false_alert();
    test_metal_in_nonbio_is_normal();
    test_noisy_readings_recovery();

    printf("\n═══════════════════════════════════════════════════\n");
    printf("RESULTS: %d passed, %d failed, %d total\n",
           tests_passed, tests_failed, tests_passed + tests_failed);
    printf("═══════════════════════════════════════════════════\n");

    if (tests_failed > 0) {
        printf("⚠ SOME TESTS FAILED\n");
        return 1;
    }
    printf("✓ ALL TESTS PASSED\n");
    return 0;
}

#endif // UNIT_TEST
