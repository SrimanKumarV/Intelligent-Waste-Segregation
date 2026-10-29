"""
Intelligent Waste Segregation Analytics — Model Training & Evaluation Pipeline
Trains Anomaly Detector, Multi-Channel Weight Forecaster, and Strict 2-Category Classifier.
Evaluates chronologically on held-out sessions, records full metadata, and exports artifacts.
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone
from typing import Dict, Any

# Ensure workspace root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd
from ml.features import extract_batch_features, FEATURE_COLUMNS
from ml.anomaly_detector import SensorAnomalyDetector
from ml.weight_forecaster import WasteAccumulationForecaster
from ml.category_classifier import ExperimentalCategoryClassifier


def train_and_evaluate(
    data_path: str = "data/synthetic/sensor_readings.csv",
    models_dir: str = "models",
    random_seed: int = 42,
) -> Dict[str, Any]:
    """
    Executes complete ML training and chronological evaluation workflow on 4-channel telemetry.
    """
    os.makedirs(models_dir, exist_ok=True)

    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Synthetic dataset not found at {data_path}. Run generate_data.py first.")

    print(f"[TRAIN] Loading dataset from {data_path}...")
    df = pd.read_csv(data_path)
    print(f"  Loaded {len(df)} total records across splits: {df['split'].value_counts().to_dict()}")

    print("[TRAIN] Extracting features across sessions...")
    features_df = extract_batch_features(df)

    # Split into Train, Validation, and Test by session
    train_df = features_df[features_df["split"] == "train"].copy()
    val_df = features_df[features_df["split"] == "val"].copy()
    test_df = features_df[features_df["split"] == "test"].copy()

    print(f"  Partitioned: Train={len(train_df)}, Val={len(val_df)}, Test={len(test_df)}")

    # -------------------------------------------------------------------------
    # 1. TRAIN MODEL A: SENSOR ANOMALY DETECTOR (ISOLATION FOREST)
    # -------------------------------------------------------------------------
    print("\n[TRAIN: Model A] Fitting Isolation Forest Sensor Anomaly Detector...")
    anomaly_detector = SensorAnomalyDetector(contamination=0.06, random_state=random_seed)
    anomaly_detector.fit(train_df)

    print("  Calibrating anomaly threshold on validation sessions...")
    val_y = val_df["target_anomaly"].astype(bool)
    calibrated_thresh = anomaly_detector.calibrate_threshold(val_df, val_y)
    print(f"  Optimized threshold: {calibrated_thresh:.4f}")

    print("  Evaluating Anomaly Detector on held-out test sessions...")
    test_y = test_df["target_anomaly"].astype(bool)
    anomaly_metrics = anomaly_detector.evaluate(test_df, test_y)
    print(f"  -> Precision: {anomaly_metrics['precision']:.4f}")
    print(f"  -> Recall:    {anomaly_metrics['recall']:.4f}")
    print(f"  -> F1 Score:  {anomaly_metrics['f1_score']:.4f}")

    anomaly_artifact_path = os.path.join(models_dir, "anomaly_detector.joblib")
    anomaly_detector.save(anomaly_artifact_path)
    print(f"  Saved artifact to {anomaly_artifact_path}")

    # -------------------------------------------------------------------------
    # 2. TRAIN MODEL B: DUAL LOAD CELL WEIGHT FORECASTER (RANDOM FOREST)
    # -------------------------------------------------------------------------
    print("\n[TRAIN: Model B] Fitting Multi-Horizon Random Forest Weight Forecaster for LC1 & LC2...")
    forecaster = WasteAccumulationForecaster(n_estimators=50, max_depth=10, random_state=random_seed)
    forecaster.fit(train_df)

    print("  Evaluating Forecaster on held-out test sessions (vs Persistence Baseline)...")
    forecast_metrics = forecaster.evaluate(test_df)

    print("  -- Load Cell 1 (Biodegradable) --")
    for horizon, m in forecast_metrics["lc1"].items():
        print(f"  -> LC1 +{horizon}: Model MAE={m['model_mae_grams']}g | Baseline={m['baseline_mae_grams']}g (Improvement: {m['mae_improvement_grams']}g, Beats Baseline: {m['beats_baseline']})")

    print("  -- Load Cell 2 (Non-Biodegradable) --")
    for horizon, m in forecast_metrics["lc2"].items():
        print(f"  -> LC2 +{horizon}: Model MAE={m['model_mae_grams']}g | Baseline={m['baseline_mae_grams']}g (Improvement: {m['mae_improvement_grams']}g, Beats Baseline: {m['beats_baseline']})")

    forecaster_artifact_path = os.path.join(models_dir, "weight_forecaster.joblib")
    forecaster.save(forecaster_artifact_path)
    print(f"  Saved artifact to {forecaster_artifact_path}")

    # -------------------------------------------------------------------------
    # 3. TRAIN MODEL C: STRICT 2-CATEGORY CLASSIFIER (PROTOTYPE)
    # -------------------------------------------------------------------------
    print("\n[TRAIN: Model C] Fitting Strict 2-Category Classifier (Biodegradable vs Non-Biodegradable)...")
    classifier = ExperimentalCategoryClassifier(n_estimators=60, random_state=random_seed)
    classifier.fit(train_df, train_df["synthetic_category"])

    classifier_artifact_path = os.path.join(models_dir, "category_classifier.joblib")
    classifier.save(classifier_artifact_path)
    print(f"  Saved artifact to {classifier_artifact_path}")

    # -------------------------------------------------------------------------
    # 4. EXPORT COMPREHENSIVE MODEL METADATA
    # -------------------------------------------------------------------------
    metadata: Dict[str, Any] = {
        "model_version": "2.0.0",
        "training_timestamp": datetime.now(timezone.utc).isoformat(),
        "random_seed": random_seed,
        "dataset_path": data_path,
        "training_sample_count": len(train_df),
        "validation_sample_count": len(val_df),
        "test_sample_count": len(test_df),
        "feature_schema": FEATURE_COLUMNS,
        "models": {
            "anomaly_detector": {
                "algorithm": "IsolationForest",
                "artifact": "anomaly_detector.joblib",
                "calibrated_threshold": calibrated_thresh,
                "metrics_on_test": anomaly_metrics,
            },
            "weight_forecaster": {
                "algorithm": "RandomForestRegressor (Dual Channel LC1 & LC2)",
                "artifact": "weight_forecaster.joblib",
                "horizons": ["5m", "15m", "30m"],
                "metrics_on_test": {
                    "lc1": forecast_metrics["lc1"],
                    "lc2": forecast_metrics["lc2"],
                    # Backwards compatible horizon keys
                    "5m": forecast_metrics.get("5m", {}),
                    "15m": forecast_metrics.get("15m", {}),
                    "30m": forecast_metrics.get("30m", {})
                },
            },
            "category_classifier": {
                "algorithm": "RandomForestClassifier (Strict 2-Class)",
                "artifact": "category_classifier.joblib",
                "categories": ["BIODEGRADABLE", "NON_BIODEGRADABLE"],
                "is_experimental": True,
                "disclaimer": "SYNTHETIC PROFILE INFERENCE — NOT REAL-WORLD MATERIAL VERIFICATION"
            }
        },
        "compartment_c_status": "RESERVED_FUTURE_USE — Explicitly excluded from classifier labels",
        "provenance_statement": "SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION"
    }

    metadata_path = os.path.join(models_dir, "model_metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n[TRAIN] Metadata successfully written to {metadata_path}")
    print("[TRAIN] All models trained, validated, and saved successfully!")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train and evaluate sensor ML models.")
    parser.add_argument("--data", default="data/synthetic/sensor_readings.csv", help="Path to sensor readings dataset")
    parser.add_argument("--models-dir", default="models", help="Directory to save model artifacts")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    args = parser.parse_args()

    train_and_evaluate(data_path=args.data, models_dir=args.models_dir, random_seed=args.seed)
