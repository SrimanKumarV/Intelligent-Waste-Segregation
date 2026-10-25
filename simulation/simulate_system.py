#!/usr/bin/env python3
"""
Intelligent Solid Waste Segregation System — Python Simulation Suite
Automated batch execution of decision logic, persistence filtering, and edge cases.

Usage:
  python simulation/simulate_system.py
"""

import sys

# Configuration constants matching config.h
GAS_THRESHOLD_HIGH = 1500
GAS_THRESHOLD_LOW = 800
MOISTURE_THRESHOLD_WET = 1500
MOISTURE_THRESHOLD_DRY = 3000
MOISTURE_POLARITY_INVERTED = True
BIN_DEPTH_CM = 40.0
BIN_LEVEL_FULL_PCT = 90.0
BIN_LEVEL_NEAR_FULL_PCT = 75.0
MISMATCH_PERSISTENCE_COUNT = 3
EVIDENCE_WEIGHT_METAL = 40
EVIDENCE_WEIGHT_MOISTURE = 20
EVIDENCE_WEIGHT_GAS = 15
MISMATCH_SCORE_THRESHOLD = 30

class WasteDetector:
    def __init__(self):
        self.bio_persistence = 0
        self.nonbio_persistence = 0
        self.bio_mismatch_active = False
        self.nonbio_mismatch_active = False

    def reset(self):
        self.bio_persistence = 0
        self.nonbio_persistence = 0
        self.bio_mismatch_active = False
        self.nonbio_mismatch_active = False

    def evaluate_cycle(self, gas_raw, bio_moist, bio_metal, nonbio_moist, nonbio_metal,
                       bio_dist_cm, nonbio_dist_cm):
        # Interpret sensors
        gas_high = gas_raw >= GAS_THRESHOLD_HIGH
        bio_wet = (bio_moist <= MOISTURE_THRESHOLD_WET) if MOISTURE_POLARITY_INVERTED else (bio_moist >= MOISTURE_THRESHOLD_WET)
        nonbio_wet = (nonbio_moist <= MOISTURE_THRESHOLD_WET) if MOISTURE_POLARITY_INVERTED else (nonbio_moist >= MOISTURE_THRESHOLD_WET)

        # 1. Bio Bin Evaluation
        # Metal in bio bin is the primary mismatch indicator (+40 pts)
        bio_score = 0
        bio_condition = False
        if bio_metal:
            bio_score += EVIDENCE_WEIGHT_METAL
            bio_condition = True

        if bio_condition:
            self.bio_persistence += 1
            if self.bio_persistence >= MISMATCH_PERSISTENCE_COUNT:
                self.bio_mismatch_active = True
        else:
            self.bio_persistence = max(0, self.bio_persistence - 1)
            if self.bio_persistence == 0:
                self.bio_mismatch_active = False

        # 2. Non-Bio Bin Evaluation
        # Metal in non-bio is ALLOWED (0 pts)
        # Wet item alone in non-bio is 20 pts (< 30 threshold) -> NOT MISMATCH
        # Wet item + Gas in non-bio is 35 pts (>= 30 threshold) -> MISMATCH
        nonbio_score = 0
        nonbio_condition = False

        if nonbio_wet:
            nonbio_score += EVIDENCE_WEIGHT_MOISTURE
        if gas_high:
            nonbio_score += EVIDENCE_WEIGHT_GAS

        if nonbio_score >= MISMATCH_SCORE_THRESHOLD:
            nonbio_condition = True

        if nonbio_condition:
            self.nonbio_persistence += 1
            if self.nonbio_persistence >= MISMATCH_PERSISTENCE_COUNT:
                self.nonbio_mismatch_active = True
        else:
            self.nonbio_persistence = max(0, self.nonbio_persistence - 1)
            if self.nonbio_persistence == 0:
                self.nonbio_mismatch_active = False

        # Fill levels
        bio_fill = max(0, min(100, int(((BIN_DEPTH_CM - bio_dist_cm) / BIN_DEPTH_CM) * 100)))
        nonbio_fill = max(0, min(100, int(((BIN_DEPTH_CM - nonbio_dist_cm) / BIN_DEPTH_CM) * 100)))
        bin_full = (bio_fill >= BIN_LEVEL_FULL_PCT) or (nonbio_fill >= BIN_LEVEL_FULL_PCT)

        return {
            "bio_score": bio_score,
            "bio_mismatch": self.bio_mismatch_active,
            "bio_persistence": self.bio_persistence,
            "nonbio_score": nonbio_score,
            "nonbio_mismatch": self.nonbio_mismatch_active,
            "nonbio_persistence": self.nonbio_persistence,
            "bin_full": bin_full,
            "bio_fill": bio_fill,
            "nonbio_fill": nonbio_fill
        }


def run_tests():
    print("=" * 65)
    print("  Intelligent Solid Waste Segregation — Decision Logic Simulation")
    print("=" * 65)

    detector = WasteDetector()
    passed = 0
    failed = 0

    def assert_test(name, condition):
        nonlocal passed, failed
        if condition:
            print(f"  [PASS] {name}")
            passed += 1
        else:
            print(f"  [FAIL] {name}")
            failed += 1

    # Test 1: Normal operation with dry bins
    res = detector.evaluate_cycle(gas_raw=500, bio_moist=3500, bio_metal=False,
                                  nonbio_moist=3600, nonbio_metal=False,
                                  bio_dist_cm=30, nonbio_dist_cm=30)
    assert_test("T01: Clean / Dry bins produce no mismatch", not res["bio_mismatch"] and not res["nonbio_mismatch"])

    # Test 2: Normal organic waste in bio bin (wet + gas)
    res = detector.evaluate_cycle(gas_raw=1600, bio_moist=1000, bio_metal=False,
                                  nonbio_moist=3600, nonbio_metal=False,
                                  bio_dist_cm=25, nonbio_dist_cm=30)
    assert_test("T02: Organic matter in Bio bin does NOT trigger mismatch", not res["bio_mismatch"])

    # Test 3: Metal in Non-Bio bin (aluminum can in dry bin)
    res = detector.evaluate_cycle(gas_raw=500, bio_moist=3500, bio_metal=False,
                                  nonbio_moist=3600, nonbio_metal=True,
                                  bio_dist_cm=30, nonbio_dist_cm=25)
    assert_test("T03: Metal in Non-Bio bin is ALLOWED (score=0, no mismatch)", res["nonbio_score"] == 0 and not res["nonbio_mismatch"])

    # Test 4: Wet item alone in Non-Bio bin (e.g. wet rinsed plastic bottle)
    res = detector.evaluate_cycle(gas_raw=500, bio_moist=3500, bio_metal=False,
                                  nonbio_moist=1100, nonbio_metal=False,
                                  bio_dist_cm=30, nonbio_dist_cm=25)
    assert_test("T04: Wet item ALONE in Non-Bio is NOT bio mismatch (score=20 < 30)", res["nonbio_score"] == 20 and not res["nonbio_mismatch"])

    # Test 5: Metal in Bio bin with persistence (requires 3 cycles)
    detector.reset()
    r1 = detector.evaluate_cycle(gas_raw=500, bio_moist=3500, bio_metal=True,
                                 nonbio_moist=3600, nonbio_metal=False, bio_dist_cm=30, nonbio_dist_cm=30)
    assert_test("T05a: Metal in Bio cycle 1 (verifying, alert not yet active)", not r1["bio_mismatch"] and r1["bio_persistence"] == 1)

    r2 = detector.evaluate_cycle(gas_raw=500, bio_moist=3500, bio_metal=True,
                                 nonbio_moist=3600, nonbio_metal=False, bio_dist_cm=30, nonbio_dist_cm=30)
    assert_test("T05b: Metal in Bio cycle 2 (verifying, alert not yet active)", not r2["bio_mismatch"] and r2["bio_persistence"] == 2)

    r3 = detector.evaluate_cycle(gas_raw=500, bio_moist=3500, bio_metal=True,
                                 nonbio_moist=3600, nonbio_metal=False, bio_dist_cm=30, nonbio_dist_cm=30)
    assert_test("T05c: Metal in Bio cycle 3 (ALERT ACTIVATED)", r3["bio_mismatch"] and r3["bio_persistence"] == 3)

    # Test 6: Mismatch in Non-Bio bin (Wet + High Gas = 35 pts >= 30)
    detector.reset()
    detector.evaluate_cycle(gas_raw=1800, bio_moist=3500, bio_metal=False,
                            nonbio_moist=1000, nonbio_metal=False, bio_dist_cm=30, nonbio_dist_cm=30)
    detector.evaluate_cycle(gas_raw=1800, bio_moist=3500, bio_metal=False,
                            nonbio_moist=1000, nonbio_metal=False, bio_dist_cm=30, nonbio_dist_cm=30)
    r_nb = detector.evaluate_cycle(gas_raw=1800, bio_moist=3500, bio_metal=False,
                                   nonbio_moist=1000, nonbio_metal=False, bio_dist_cm=30, nonbio_dist_cm=30)
    assert_test("T06: Moisture + Gas in Non-Bio activates mismatch alert (35 pts)", r_nb["nonbio_mismatch"] and r_nb["nonbio_score"] == 35)

    # Test 7: Bin Full condition (ultrasonic distance <= 4cm -> >=90% full)
    r_full = detector.evaluate_cycle(gas_raw=500, bio_moist=3500, bio_metal=False,
                                     nonbio_moist=3600, nonbio_metal=False,
                                     bio_dist_cm=3.0, nonbio_dist_cm=30)
    assert_test("T07: Bin level >= 90% triggers bin_full flag", r_full["bin_full"] and r_full["bio_fill"] >= 90)

    print("-" * 65)
    print(f"  Summary: {passed} Passed, {failed} Failed out of {passed + failed} Tests")
    print("=" * 65)

    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(run_tests())
