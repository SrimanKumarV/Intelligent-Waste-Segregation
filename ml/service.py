"""
Intelligent Waste Segregation Analytics — Fast, Resilient ML Inference Microservice
REST API serving real-time anomaly detection, multi-horizon weight forecasting for dual load cells,
experimental category classification, and model metadata.
"""

import os
import sys
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml.anomaly_detector import SensorAnomalyDetector
from ml.weight_forecaster import WasteAccumulationForecaster
from ml.category_classifier import ExperimentalCategoryClassifier


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_all_models()
    yield

# -----------------------------------------------------------------------------
# APPLICATION & CONFIGURATION
# -----------------------------------------------------------------------------
app = FastAPI(
    title="Intelligent Waste Segregation — ML Inference Service",
    description="Real-time multi-channel sensor anomaly detection and dual load cell forecasting.",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
ANOMALY_MODEL_PATH = os.path.join(MODELS_DIR, "anomaly_detector.joblib")
FORECASTER_MODEL_PATH = os.path.join(MODELS_DIR, "weight_forecaster.joblib")
CLASSIFIER_MODEL_PATH = os.path.join(MODELS_DIR, "category_classifier.joblib")
METADATA_PATH = os.path.join(MODELS_DIR, "model_metadata.json")

# In-memory loaded models
anomaly_detector: Optional[SensorAnomalyDetector] = None
weight_forecaster: Optional[WasteAccumulationForecaster] = None
category_classifier: Optional[ExperimentalCategoryClassifier] = None
model_metadata: Dict[str, Any] = {}


def load_all_models() -> None:
    """Loads all model artifacts and training metadata on startup."""
    global anomaly_detector, weight_forecaster, category_classifier, model_metadata

    if os.path.exists(ANOMALY_MODEL_PATH):
        try:
            anomaly_detector = SensorAnomalyDetector.load(ANOMALY_MODEL_PATH)
            print(f"[ML SERVICE] Loaded Anomaly Detector from {ANOMALY_MODEL_PATH}")
        except Exception as e:
            print(f"[ML SERVICE] Failed loading anomaly detector: {e}")
            anomaly_detector = None
    else:
        print(f"[ML SERVICE] Anomaly detector artifact not found at {ANOMALY_MODEL_PATH}")

    if os.path.exists(FORECASTER_MODEL_PATH):
        try:
            weight_forecaster = WasteAccumulationForecaster.load(FORECASTER_MODEL_PATH)
            print(f"[ML SERVICE] Loaded Weight Forecaster from {FORECASTER_MODEL_PATH}")
        except Exception as e:
            print(f"[ML SERVICE] Failed loading weight forecaster: {e}")
            weight_forecaster = None
    else:
        print(f"[ML SERVICE] Weight forecaster artifact not found at {FORECASTER_MODEL_PATH}")

    if os.path.exists(CLASSIFIER_MODEL_PATH):
        try:
            category_classifier = ExperimentalCategoryClassifier.load(CLASSIFIER_MODEL_PATH)
            print(f"[ML SERVICE] Loaded Category Classifier from {CLASSIFIER_MODEL_PATH}")
        except Exception as e:
            print(f"[ML SERVICE] Failed loading category classifier: {e}")
            category_classifier = None

    if os.path.exists(METADATA_PATH):
        try:
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                model_metadata = json.load(f)
        except Exception as e:
            print(f"[ML SERVICE] Failed loading model metadata: {e}")


# -----------------------------------------------------------------------------
# TELEMETRY INPUT SCHEMA (4 CHANNELS + DUAL DEVICE SUPPORT)
# -----------------------------------------------------------------------------
class TelemetryRecord(BaseModel):
    v: Optional[Any] = 1
    dev: Optional[str] = "SIM-WS01"
    seq: Optional[int] = 0
    up: Optional[int] = 0
    uno_connected: Optional[bool] = True
    esp32_connected: Optional[bool] = True

    # Module A: Uno
    dist_cm: Optional[float] = None
    prox: Optional[bool] = False
    lid_cmd: Optional[str] = "CLOSED"

    # Module B: ESP32 4 Channels
    c1_raw: Optional[int] = None
    c1_pct: Optional[float] = None
    c1_ok: Optional[bool] = True
    c1_cal: Optional[bool] = True

    c2_raw: Optional[int] = None
    c2_pct: Optional[float] = None
    c2_ok: Optional[bool] = True
    c2_cal: Optional[bool] = True

    lc1_g: Optional[float] = None
    lc1_raw: Optional[int] = None
    lc1_ok: Optional[bool] = True
    lc1_cal: Optional[bool] = True

    lc2_g: Optional[float] = None
    lc2_raw: Optional[int] = None
    lc2_ok: Optional[bool] = True
    lc2_cal: Optional[bool] = True

    # Legacy Backward-Compatibility Aliases
    moist_raw: Optional[int] = None
    moist_pct: Optional[float] = None
    moist_ok: Optional[bool] = True
    moist_cal: Optional[bool] = True
    weight_g: Optional[float] = None
    weight_raw: Optional[int] = None
    weight_ok: Optional[bool] = True
    weight_cal: Optional[bool] = True

    faults: Optional[List[str]] = Field(default_factory=list)
    source: Optional[str] = "simulation"
    scenario: Optional[str] = None
    timestamp: Optional[str] = None


# -----------------------------------------------------------------------------
# REST API ENDPOINTS
# -----------------------------------------------------------------------------
@app.get("/api/ml/health")
def get_ml_health():
    """Returns microservice operational health and model readiness status."""
    return {
        "status": "healthy",
        "service": "Intelligent Waste Segregation ML Service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "models_loaded": {
            "anomaly_detector": anomaly_detector is not None and anomaly_detector.is_fitted,
            "weight_forecaster": weight_forecaster is not None and weight_forecaster.is_fitted,
            "category_classifier": category_classifier is not None and category_classifier.is_fitted,
        },
        "provenance": "SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION"
    }


@app.get("/api/ml/status")
def get_ml_status():
    """Returns detailed model versions, feature schemas, and training parameters."""
    if not model_metadata:
        return {
            "status": "models_uninitialized",
            "message": "No model metadata found. Please train models first using ml/train.py.",
            "loaded_models": {
                "anomaly_detector": anomaly_detector is not None,
                "weight_forecaster": weight_forecaster is not None,
                "category_classifier": category_classifier is not None
            }
        }

    return {
        "status": "ready",
        "model_version": model_metadata.get("model_version", "2.0.0"),
        "training_timestamp": model_metadata.get("training_timestamp"),
        "training_samples": model_metadata.get("training_sample_count"),
        "validation_samples": model_metadata.get("validation_sample_count"),
        "test_samples": model_metadata.get("test_sample_count"),
        "feature_schema": model_metadata.get("feature_schema", []),
        "provenance_statement": model_metadata.get("provenance_statement"),
    }


@app.get("/api/ml/metrics")
def get_ml_metrics():
    """Returns cross-validated test metrics for anomaly detection and weight forecasting."""
    if not model_metadata:
        return {
            "status": "metrics_unavailable",
            "message": "No model metadata available. Execute ml/train.py to generate metrics."
        }

    models_info = model_metadata.get("models", {})
    return {
        "status": "success",
        "dataset_provenance": "synthetic",
        "disclaimer": "SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION",
        "anomaly_detector": models_info.get("anomaly_detector", {}).get("metrics_on_test", {}),
        "weight_forecaster": models_info.get("weight_forecaster", {}).get("metrics_on_test", {}),
        "category_classifier": models_info.get("category_classifier", {}),
    }


@app.post("/api/ml/anomaly")
def detect_anomaly(telemetry: TelemetryRecord):
    """
    Performs real-time anomaly detection with channel-specific attribution (C1, C2, LC1, LC2, Uno, ESP32).
    """
    if anomaly_detector is None or not anomaly_detector.is_fitted:
        return {
            "status": "model_unavailable",
            "is_anomaly": False,
            "anomaly_score": 0.0,
            "reasons": ["Anomaly detector model is offline or not loaded"],
            "source": telemetry.source or "unknown",
            "provenance": "MODEL_UNAVAILABLE"
        }

    record_dict = telemetry.model_dump()
    return anomaly_detector.predict_single(record_dict)


@app.post("/api/ml/forecast")
def forecast_weight(
    telemetry: TelemetryRecord,
    horizon: str = Query("5m", pattern="^(5m|15m|30m)$", description="Forecast horizon: 5m, 15m, or 30m")
):
    """
    Predicts future waste mass (grams) for Load Cell 1 and Load Cell 2 independently (+5m, +15m, +30m).
    """
    if weight_forecaster is None or not weight_forecaster.is_fitted:
        current_lc1 = float(telemetry.lc1_g or telemetry.weight_g or 0.0)
        current_lc2 = float(telemetry.lc2_g or 0.0)
        return {
            "status": "model_unavailable",
            "horizon": horizon,
            "plain_english_summary": "ML forecaster offline. Displaying current weights.",
            "lc1": {"current_grams": current_lc1, "forecast_grams": current_lc1, "projected_delta_grams": 0.0},
            "lc2": {"current_grams": current_lc2, "forecast_grams": current_lc2, "projected_delta_grams": 0.0},
            "provenance": "MODEL_UNAVAILABLE"
        }

    record_dict = telemetry.model_dump()
    return weight_forecaster.predict_single(record_dict, horizon=horizon)


@app.post("/api/ml/classify")
def classify_waste_category(telemetry: TelemetryRecord):
    """
    Experimental prototype waste category classifier (Strict 2-Class Model: Biodegradable vs Non-Biodegradable).
    """
    if category_classifier is None or not category_classifier.is_fitted:
        return {
            "status": "model_unavailable",
            "predicted_category": "UNCLASSIFIED",
            "confidence_percent": 0.0,
            "disclaimer": "Classifier artifact not loaded. Execute ml/train.py to initialize.",
            "provenance": "MODEL_UNAVAILABLE"
        }

    record_dict = telemetry.model_dump()
    return category_classifier.predict_single(record_dict)
