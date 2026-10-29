"""
Intelligent Waste Segregation Analytics — Sensor Anomaly Detection
Isolation Forest model for 4-channel numerical IoT sensor telemetry with calibrated decision boundary.
Provides channel-level diagnostic attribution across Uno and ESP32.
"""

import os
import joblib
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import precision_recall_fscore_support

from ml.features import FEATURE_COLUMNS, OnlineFeatureExtractor


class SensorAnomalyDetector:
    """
    Sensor-based anomaly detector using Isolation Forest.
    Detects sensor disconnection, communication timeouts, calibration drift, and physical discontinuities.
    """

    def __init__(
        self,
        contamination: float = 0.05,
        random_state: int = 42,
        threshold: float = 0.5,
    ):
        self.contamination = contamination
        self.random_state = random_state
        self.threshold = threshold
        self.model = IsolationForest(
            n_estimators=100,
            contamination=contamination,
            random_state=random_state,
            n_jobs=1,
        )
        self.is_fitted = False
        self.feature_columns = FEATURE_COLUMNS
        self.online_extractor = OnlineFeatureExtractor(buffer_size=10)

        # Baseline training score distribution for normalization
        self.min_score: float = -0.5
        self.max_score: float = 0.5

    def fit(self, X_train: pd.DataFrame, y_train: Optional[pd.Series] = None) -> "SensorAnomalyDetector":
        """Fits the Isolation Forest model on nominal and general training feature matrix."""
        features = X_train[self.feature_columns]
        self.model.fit(features)
        self.is_fitted = True

        raw_scores = self.model.decision_function(features)
        self.min_score = float(np.min(raw_scores))
        self.max_score = float(np.max(raw_scores))
        return self

    def calibrate_threshold(self, X_val: pd.DataFrame, y_val: pd.Series) -> float:
        """
        Calibrates the anomaly classification threshold on validation data to maximize F1 score.
        """
        features = X_val[self.feature_columns]
        scores = self.predict_scores(features)

        best_thresh = 0.5
        best_f1 = 0.0

        for thresh in np.linspace(0.2, 0.8, 61):
            preds = (scores >= thresh).astype(int)
            p, r, f1, _ = precision_recall_fscore_support(y_val.astype(int), preds, average="binary", zero_division=0)
            if f1 > best_f1:
                best_f1 = f1
                best_thresh = thresh

        self.threshold = float(best_thresh)
        return self.threshold

    def predict_scores(self, X: pd.DataFrame) -> np.ndarray:
        """
        Computes normalized anomaly scores where 0.0 is completely nominal and 1.0 is highly anomalous.
        """
        if not self.is_fitted:
            raise RuntimeError("Model is not fitted. Load a trained model or fit first.")

        features = X[self.feature_columns]
        raw_scores = self.model.decision_function(features)

        clipped = np.clip(raw_scores, self.min_score, self.max_score)
        norm_scores = 1.0 - (clipped - self.min_score) / max(1e-6, (self.max_score - self.min_score))
        return np.round(norm_scores, 4)

    def evaluate(self, X_test: pd.DataFrame, y_test: pd.Series) -> Dict[str, Any]:
        """Evaluates model performance against labelled test data."""
        features = X_test[self.feature_columns]
        scores = self.predict_scores(features)
        preds = (scores >= self.threshold).astype(int)
        y_true = y_test.astype(int)

        precision, recall, f1, _ = precision_recall_fscore_support(
            y_true, preds, average="binary", zero_division=0
        )

        return {
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1_score": round(float(f1), 4),
            "calibrated_threshold": round(self.threshold, 4),
            "total_test_samples": len(y_test),
            "true_anomalies": int(y_true.sum()),
            "predicted_anomalies": int(preds.sum()),
            "evaluation_provenance": "SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION"
        }

    def predict_single(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """
        Performs real-time anomaly inference for a single incoming telemetry packet.
        Provides channel-specific attribution (C1, C2, LC1, LC2, Uno, ESP32).
        """
        if not self.is_fitted:
            return {
                "status": "model_unavailable",
                "is_anomaly": False,
                "anomaly_score": 0.0,
                "reasons": ["Anomaly detection model not loaded"],
                "source": record.get("source", "unknown"),
                "provenance": "MODEL_UNAVAILABLE"
            }

        features_df = self.online_extractor.update_and_extract(record)
        score = float(self.predict_scores(features_df)[0])
        is_anomaly = score >= self.threshold

        reasons: List[str] = []
        attributed_channels: List[str] = []

        row = features_df.iloc[0]

        # Device connection attribution (Never confuse ESP32 disconnect with Uno fault)
        if row["esp32_connected"] < 1:
            is_anomaly = True
            reasons.append("ESP32 Sensor Hub (Module B) disconnected or unresponsive")
            attributed_channels.append("ESP32_LINK")

        if row["uno_connected"] < 1:
            is_anomaly = True
            reasons.append("Arduino Uno (Module A) proximity/lid controller disconnected")
            attributed_channels.append("UNO_LINK")

        # Channel-specific hardware checks
        if row["c1_missing"] > 0:
            is_anomaly = True
            reasons.append("Capacitive Sensor C1 (Biodegradable) offline or voltage out of bounds")
            attributed_channels.append("C1")

        if row["c2_missing"] > 0:
            is_anomaly = True
            reasons.append("Capacitive Sensor C2 (Non-Biodegradable) offline or voltage out of bounds")
            attributed_channels.append("C2")

        if row["lc1_missing"] > 0:
            is_anomaly = True
            reasons.append("Load Cell 1 (Compartment A) timeout on GPIO 16/4")
            attributed_channels.append("LC1")

        if row["lc2_missing"] > 0:
            is_anomaly = True
            reasons.append("Load Cell 2 (Compartment B) timeout on GPIO 17/18")
            attributed_channels.append("LC2")

        if abs(row["lc1_delta_1"]) > 350.0 and row["prox_val"] == 0:
            is_anomaly = True
            reasons.append("Abnormal mass jump on Load Cell 1 without proximity approach")
            attributed_channels.append("LC1")

        if abs(row["lc2_delta_1"]) > 350.0 and row["prox_val"] == 0:
            is_anomaly = True
            reasons.append("Abnormal mass jump on Load Cell 2 without proximity approach")
            attributed_channels.append("LC2")

        if row["fault_count"] > 0:
            reasons.append(f"Firmware reported {int(row['fault_count'])} active hardware fault flag(s)")

        if is_anomaly and not reasons:
            reasons.append(f"Multivariate sensor anomaly detected (isolation score: {score:.2f})")

        return {
            "status": "suspected_anomaly" if is_anomaly else "normal",
            "is_anomaly": is_anomaly,
            "anomaly_score": score,
            "calibrated_threshold": round(self.threshold, 4),
            "reasons": reasons if is_anomaly else ["Nominal sensor telemetry distribution"],
            "attributed_channels": attributed_channels,
            "source": record.get("source", "simulation"),
            "provenance": "SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION"
        }

    def save(self, filepath: str) -> None:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        payload = {
            "model": self.model,
            "threshold": self.threshold,
            "min_score": self.min_score,
            "max_score": self.max_score,
            "feature_columns": self.feature_columns,
            "contamination": self.contamination,
            "is_fitted": self.is_fitted
        }
        joblib.dump(payload, filepath)

    @classmethod
    def load(cls, filepath: str) -> "SensorAnomalyDetector":
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Anomaly detector artifact not found at {filepath}")

        payload = joblib.load(filepath)
        detector = cls(
            contamination=payload.get("contamination", 0.05),
            threshold=payload.get("threshold", 0.5)
        )
        detector.model = payload["model"]
        detector.threshold = payload["threshold"]
        detector.min_score = payload["min_score"]
        detector.max_score = payload["max_score"]
        detector.feature_columns = payload.get("feature_columns", FEATURE_COLUMNS)
        detector.is_fitted = payload.get("is_fitted", True)
        return detector
