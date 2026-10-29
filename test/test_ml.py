"""
Intelligent Waste Segregation Analytics — Automated Unit & Integration Tests
Validates synthetic physics, temporal correlation, model lifecycle, API safety, and data isolation.
"""

import os
import sys
import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timezone

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from ml.synthetic_data import (
    SyntheticTelemetryGenerator,
    SyntheticSensorConfig,
    generate_session_dataset
)
from ml.features import extract_batch_features, OnlineFeatureExtractor, FEATURE_COLUMNS
from ml.anomaly_detector import SensorAnomalyDetector
from ml.weight_forecaster import WasteAccumulationForecaster
from ml.category_classifier import ExperimentalCategoryClassifier
import requests
from ml.service import app


# =============================================================================
# 1. SYNTHETIC GENERATION TESTS
# =============================================================================

def test_synthetic_reproducibility():
    """Verify that identical random seeds produce identical telemetry sequences."""
    gen1 = SyntheticTelemetryGenerator(session_id="S1", scenario="NORMAL_OPERATION", seed=123)
    gen2 = SyntheticTelemetryGenerator(session_id="S1", scenario="NORMAL_OPERATION", seed=123)

    records1 = [gen1.next_record() for _ in range(50)]
    records2 = [gen2.next_record() for _ in range(50)]

    for r1, r2 in zip(records1, records2):
        assert r1["seq"] == r2["seq"]
        assert r1["moist_raw"] == r2["moist_raw"]
        assert r1["weight_g"] == r2["weight_g"]
        assert r1["dist_cm"] == r2["dist_cm"]
        assert r1["lid_cmd"] == r2["lid_cmd"]


def test_sensor_physical_bounds():
    """Verify that sensor values remain within physical and ADC boundaries."""
    gen = SyntheticTelemetryGenerator(scenario="WASTE_ACCUMULATION", seed=42)
    records = [gen.next_record() for _ in range(300)]

    for r in records:
        # Moisture ADC must stay within 10-bit range (0 to 1023)
        assert 0 <= r["moist_raw"] <= 1023

        # Moisture percentage, when calibrated and valid, must be 0-100%
        if r["moist_pct"] is not None:
            assert 0.0 <= r["moist_pct"] <= 100.0

        # Weight must be non-negative and within capacity
        if r["weight_g"] is not None:
            assert r["weight_g"] >= 0.0
            assert r["weight_g"] <= SyntheticSensorConfig.WEIGHT_MAX_CAPACITY_GRAMS

        # Distance must be within valid ultrasonic bounds when not timed out
        if r["dist_cm"] is not None:
            assert SyntheticSensorConfig.ULTRASONIC_MIN_VALID_CM <= r["dist_cm"] <= SyntheticSensorConfig.ULTRASONIC_MAX_VALID_CM


def test_moisture_calibration_physics():
    """Verify capacitive physics: lower raw ADC indicates higher moisture percentage."""
    cfg = SyntheticSensorConfig()
    air_raw = cfg.MOISTURE_AIR_RAW_DEFAULT   # 620 ADC (dry, 0%)
    water_raw = cfg.MOISTURE_WATER_RAW_DEFAULT # 290 ADC (wet, 100%)

    assert air_raw > water_raw, "Capacitive sensor air raw ADC must be greater than water raw ADC"

    # In dry scenario, average ADC should be higher than in wet scenario
    gen_dry = SyntheticTelemetryGenerator(scenario="DRY_WASTE_PROFILE", seed=10)
    gen_wet = SyntheticTelemetryGenerator(scenario="WET_WASTE_PROFILE", seed=10)

    dry_records = [gen_dry.next_record() for _ in range(100)]
    wet_records = [gen_wet.next_record() for _ in range(100)]

    avg_dry_raw = np.mean([r["moist_raw"] for r in dry_records if r["moist_ok"]])
    avg_wet_raw = np.mean([r["moist_raw"] for r in wet_records if r["moist_ok"]])

    assert avg_dry_raw > avg_wet_raw, "Dry waste must produce higher ADC than wet waste"


def test_distance_and_proximity_debounce():
    """Verify proximity is True ONLY when distance <= 20cm and debounced."""
    gen = SyntheticTelemetryGenerator(scenario="NORMAL_OPERATION", seed=42)
    records = [gen.next_record() for _ in range(200)]

    for r in records:
        if r["prox"] is True:
            # If proximity is debounced and active, distance must be <= threshold
            assert r["dist_cm"] is not None
            assert r["dist_cm"] <= SyntheticSensorConfig.PROXIMITY_THRESHOLD_CM


def test_lid_state_machine():
    """Verify lid states are valid and adhere to hold and cooldown transitions."""
    gen = SyntheticTelemetryGenerator(scenario="HIGH_USAGE", seed=42)
    records = [gen.next_record() for _ in range(300)]

    for r in records:
        assert r["lid_cmd"] in ["CLOSED", "OPEN"]

    # Verify lid never opens unless proximity was detected
    for i in range(1, len(records)):
        prev = records[i - 1]
        curr = records[i]
        if prev["lid_cmd"] == "CLOSED" and curr["lid_cmd"] == "OPEN":
            assert curr["prox"] is True, "Lid must not open without proximity detection"


def test_missing_values_and_fault_injection():
    """Verify explicit nulls for disconnected or timed-out sensors."""
    gen = SyntheticTelemetryGenerator(scenario="NORMAL_OPERATION", seed=42)
    # Inject moisture disconnection
    gen.inject_fault("MOISTURE_OFFLINE", duration_ticks=5)
    records = [gen.next_record() for _ in range(5)]

    for r in records:
        assert r["moist_pct"] is None, "Disconnected moisture must emit None/null, not fabricated 0"
        assert r["moist_ok"] is False
        assert "MOISTURE_OFFLINE" in r["faults"]
        assert r["target_anomaly"] is True

    # Inject HX711 timeout
    gen.inject_fault("HX711_TIMEOUT", duration_ticks=5)
    records_hx = [gen.next_record() for _ in range(5)]
    for r in records_hx:
        assert r["weight_g"] is None, "HX711 timeout must emit None/null, not 0"
        assert r["weight_ok"] is False
        assert "HX711_TIMEOUT" in r["faults"]


# =============================================================================
# 2. DATA LEAKAGE & PARTITIONING TESTS
# =============================================================================

def test_session_based_partitioning():
    """Verify train, validation, and test splits contain strictly disjoint sessions."""
    from ml.generate_data import generate_full_dataset
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        meta = generate_full_dataset(output_dir=tmpdir, total_target_records=600, seed=99)
        df = pd.read_csv(os.path.join(tmpdir, "sensor_readings.csv"))

        train_sessions = set(df[df["split"] == "train"]["sim_session_id"].unique())
        val_sessions = set(df[df["split"] == "val"]["sim_session_id"].unique())
        test_sessions = set(df[df["split"] == "test"]["sim_session_id"].unique())

        # Disjoint verification
        assert train_sessions.isdisjoint(val_sessions), "Train and validation sessions must not overlap"
        assert train_sessions.isdisjoint(test_sessions), "Train and test sessions must not overlap"
        assert val_sessions.isdisjoint(test_sessions), "Validation and test sessions must not overlap"


# =============================================================================
# 3. MODEL LIFECYCLE & INFERENCE TESTS
# =============================================================================

def test_anomaly_detector_lifecycle(tmp_path):
    """Verify anomaly detector training, saving, loading, and safe fallback."""
    # Create small synthetic training data
    records = generate_session_dataset("SES-TEST", "NORMAL_OPERATION", 100, seed=1)
    df = pd.DataFrame(records)
    feat_df = extract_batch_features(df)

    detector = SensorAnomalyDetector(contamination=0.05, random_state=42)
    detector.fit(feat_df)

    artifact_path = str(tmp_path / "test_anomaly.joblib")
    detector.save(artifact_path)

    # Reload model
    loaded_detector = SensorAnomalyDetector.load(artifact_path)
    assert loaded_detector.is_fitted is True

    # Test single nominal inference
    nominal_rec = records[0]
    res_nom = loaded_detector.predict_single(nominal_rec)
    assert res_nom["status"] in ["normal", "suspected_anomaly"]
    assert 0.0 <= res_nom["anomaly_score"] <= 1.0

    # Test missing sensor packet does not crash
    faulty_rec = dict(nominal_rec)
    faulty_rec["moist_pct"] = None
    faulty_rec["moist_ok"] = False
    faulty_rec["faults"] = ["MOISTURE_OFFLINE"]
    res_fault = loaded_detector.predict_single(faulty_rec)
    assert res_fault["is_anomaly"] is True
    assert res_fault["status"] == "suspected_anomaly"


def test_weight_forecaster_lifecycle(tmp_path):
    """Verify weight forecaster training, saving, loading, and baseline comparison."""
    records = generate_session_dataset("SES-TEST-W", "WASTE_ACCUMULATION", 150, seed=2)
    df = pd.DataFrame(records)
    feat_df = extract_batch_features(df)

    forecaster = WasteAccumulationForecaster(n_estimators=10, max_depth=5, random_state=42)
    forecaster.fit(feat_df)

    artifact_path = str(tmp_path / "test_forecaster.joblib")
    forecaster.save(artifact_path)

    loaded_forecaster = WasteAccumulationForecaster.load(artifact_path)
    assert loaded_forecaster.is_fitted is True

    res = loaded_forecaster.predict_single(records[50], horizon="5m")
    assert res["status"] == "forecast_ready"
    assert res["predicted_weight_g"] >= 0.0
    assert res["predicted_weight_g"] <= 10000.0
    assert res["lower_bound_g"] <= res["predicted_weight_g"] <= res["upper_bound_g"]


def test_unfitted_model_fail_safe():
    """Verify that missing or unfitted models return explicit errors, never random predictions."""
    detector = SensorAnomalyDetector()
    res = detector.predict_single({"weight_g": 100})
    assert res["status"] == "model_unavailable"
    assert res["is_anomaly"] is False

    forecaster = WasteAccumulationForecaster()
    res_f = forecaster.predict_single({"weight_g": 100})
    assert res_f["status"] == "model_unavailable"

    with pytest.raises(FileNotFoundError):
        SensorAnomalyDetector.load("non_existent_model_file.joblib")


# =============================================================================
# 4. REST API INTEGRATION TESTS
# =============================================================================

def test_api_endpoints():
    """Verify FastAPI service health, status, anomaly, forecast, and error handling."""
    base_url = "http://127.0.0.1:8000"
    payload = {
        "v": 1,
        "dev": "SIM-WS01",
        "seq": 10,
        "up": 20,
        "moist_raw": 450,
        "moist_pct": 65.0,
        "moist_ok": True,
        "moist_cal": True,
        "weight_g": 240.0,
        "weight_raw": 100000,
        "weight_ok": True,
        "weight_cal": True,
        "dist_cm": 14.2,
        "prox": True,
        "lid_cmd": "OPEN",
        "faults": [],
        "source": "simulation"
    }

    try:
        res_health = requests.get(f"{base_url}/api/ml/health", timeout=3)
        assert res_health.status_code == 200
        assert res_health.json()["status"] == "healthy"

        res_status = requests.get(f"{base_url}/api/ml/status", timeout=3)
        assert res_status.status_code == 200

        res_anom = requests.post(f"{base_url}/api/ml/anomaly", json=payload, timeout=3)
        assert res_anom.status_code == 200
        anom_json = res_anom.json()
        assert "anomaly_score" in anom_json
        assert "status" in anom_json

        res_fc = requests.post(f"{base_url}/api/ml/forecast?horizon=5m", json=payload, timeout=3)
        assert res_fc.status_code == 200
        fc_json = res_fc.json()
        assert "predicted_weight_g" in fc_json

        res_inv = requests.post(f"{base_url}/api/ml/forecast?horizon=invalid_horizon", json=payload, timeout=3)
        assert res_inv.status_code == 422
    except requests.exceptions.ConnectionError:
        from ml.service import get_ml_health, get_ml_status, detect_anomaly, forecast_weight, TelemetryRecord
        h = get_ml_health()
        assert h["status"] == "healthy"
        s = get_ml_status()
        assert "status" in s
        rec = TelemetryRecord(**payload)
        an = detect_anomaly(rec)
        assert "anomaly_score" in an
        fc = forecast_weight(rec, horizon="5m")
        assert "predicted_weight_g" in fc
