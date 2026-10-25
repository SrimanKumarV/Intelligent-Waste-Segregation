# Test Results Template — Intelligent Solid Waste Segregation System

> **Tester:**  
> **Date:**  
> **Firmware Version:**  
> **Board:**  
> **Environment:**  

---

## Stage: _______________

| Test ID | Conditions | Expected Behaviour | Actual Reading / Observation | Pass / Fail | Notes | Evidence |
|---------|------------|-------------------|------------------------------|-------------|-------|----------|
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |
| | | | | | | |

---

## Example Entry

| Test ID | Conditions | Expected Behaviour | Actual Reading / Observation | Pass / Fail | Notes | Evidence |
|---------|------------|-------------------|------------------------------|-------------|-------|----------|
| C8 | Metal sensor Bio, no metal near sensor | metalDetected = false | metalDetected = false, rawPin = HIGH | PASS | 5V supply, NPN sensor | Serial screenshot |
| C9 | Metal sensor Bio, iron bolt at 1cm | metalDetected = true | metalDetected = true, rawPin = LOW | PASS | Detected at ~2cm range | Serial screenshot |
| C13 | HX711 Bio, 500g reference weight | Reads 495–505g | Reads 487g | FAIL | Recalibrated, second attempt: 498g PASS | Photo of weight |

---

## Summary

| Stage | Total Tests | Passed | Failed | Skipped | Notes |
|-------|-------------|--------|--------|---------|-------|
| A — Static | | | | | |
| B — Build | | | | | |
| C — Sensors | | | | | |
| D — Calibration | | | | | |
| E — Detection | | | | | |
| F — Integration | | | | | |
| G — Repeatability | | | | | |
| **TOTAL** | | | | | |

---

## Known Issues

| Issue # | Description | Severity | Status |
|---------|-------------|----------|--------|
| | | | |

---

## Observations and Limitations

*Record any observations about sensor behaviour, environmental effects, false positives, or limitations discovered during testing.*

> **IMPORTANT:** Do not invent test results, accuracy percentages, or detection rates. Record only actual observations from physical testing. If a test was not performed, mark it as "Skipped" with the reason.
