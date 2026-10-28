/**
 * @file test_detection.cpp
 * @brief Host-side unit tests for Two-Category Waste Evaluation Logic
 *
 * Can be compiled and executed on host using g++ or clang:
 *   g++ -std=c++11 -DUNIT_TEST -I../include test_detection.cpp -o test_detection
 */

#ifdef UNIT_TEST

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cassert>

// Stub Arduino types
typedef unsigned long uint32_t;
typedef unsigned char uint8_t;

#define F(x) (x)

#include "sensor_types.h"
#include "../src/detection.cpp"

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

#define ASSERT_EQUAL(a, b, msg) do { \
    if ((a) != (b)) { \
        printf("  FAIL: %s — expected %d, got %d (line %d)\n", msg, (int)(b), (int)(a), __LINE__); \
        tests_failed++; \
    } else { \
        printf("  PASS: %s\n", msg); \
        tests_passed++; \
    } \
} while(0)

void test_high_moisture_biodegradable() {
    printf("\nTest: High moisture content suggests Biodegradable Waste\n");
    MoistureReading m = {320, 75.0f, true, SENSOR_OK};
    WeightReading   w = {180.0f, 15000, true, SENSOR_OK};

    ClassificationEvidence res = detection_evaluateEvidence(m, w);
    ASSERT_EQUAL(res.suggestedCategory, CATEGORY_BIODEGRADABLE, "Suggested category is BIODEGRADABLE");
    ASSERT_TRUE(res.isMoistureElevated, "Moisture is marked elevated");
    ASSERT_TRUE(res.hasSignificantMass, "Significant mass detected");
    ASSERT_TRUE(res.confidenceScore >= 70, "Confidence reflects high moisture");
}

void test_low_moisture_nonbiodegradable() {
    printf("\nTest: Low moisture content suggests Non-Biodegradable Waste\n");
    MoistureReading m = {600, 10.0f, true, SENSOR_OK};
    WeightReading   w = {45.0f, 4000, true, SENSOR_OK};

    ClassificationEvidence res = detection_evaluateEvidence(m, w);
    ASSERT_EQUAL(res.suggestedCategory, CATEGORY_NON_BIODEGRADABLE, "Suggested category is NON_BIODEGRADABLE");
    ASSERT_TRUE(!res.isMoistureElevated, "Moisture is not elevated");
    ASSERT_TRUE(res.hasSignificantMass, "Significant mass detected");
}

void test_intermediate_moisture_unclassified() {
    printf("\nTest: Intermediate moisture yields Unclassified with confirmation flag\n");
    MoistureReading m = {450, 35.0f, true, SENSOR_OK};
    WeightReading   w = {120.0f, 10000, true, SENSOR_OK};

    ClassificationEvidence res = detection_evaluateEvidence(m, w);
    ASSERT_EQUAL(res.suggestedCategory, CATEGORY_UNCLASSIFIED, "Category remains UNCLASSIFIED");
    ASSERT_TRUE(res.confidenceScore == 50, "Confidence neutral");
}

void test_uncalibrated_refuses_classification() {
    printf("\nTest: Uncalibrated moisture sensor refuses to fabricate classification\n");
    MoistureReading m = {450, 0.0f, false, SENSOR_NOT_CALIBRATED};
    WeightReading   w = {0.0f, 0, false, SENSOR_NOT_CALIBRATED};

    ClassificationEvidence res = detection_evaluateEvidence(m, w);
    ASSERT_EQUAL(res.suggestedCategory, CATEGORY_UNCLASSIFIED, "Uncalibrated data refuses classification");
}

void test_category_string_representation() {
    printf("\nTest: Category string mapping\n");
    ASSERT_TRUE(strcmp(detection_categoryToString(CATEGORY_BIODEGRADABLE), "Biodegradable Waste") == 0, "Biodegradable string");
    ASSERT_TRUE(strcmp(detection_categoryToString(CATEGORY_NON_BIODEGRADABLE), "Non-Biodegradable Waste") == 0, "Non-Biodegradable string");
    ASSERT_TRUE(strcmp(detection_categoryToString(CATEGORY_UNCLASSIFIED), "Unclassified") == 0, "Unclassified string");
}

int main() {
    printf("====================================================\n");
    printf("  UNIT TESTS: Two-Category Waste Evaluation Logic   \n");
    printf("====================================================\n");

    detection_init();
    test_high_moisture_biodegradable();
    test_low_moisture_nonbiodegradable();
    test_intermediate_moisture_unclassified();
    test_uncalibrated_refuses_classification();
    test_category_string_representation();

    printf("\n====================================================\n");
    printf("RESULTS: %d Passed, %d Failed\n", tests_passed, tests_failed);
    printf("====================================================\n");

    return (tests_failed == 0) ? 0 : 1;
}

#endif // UNIT_TEST
