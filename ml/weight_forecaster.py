"""
Intelligent Waste Segregation Analytics — Waste Accumulation Forecasting
Random Forest Regressor with persistence baseline comparison and physical capacity bounds.
"""

import os
import joblib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

from ml.features import FEATURE_COLUMNS, OnlineFeatureExtractor


class WasteAccumulationForecaster:
    """
    Predicts future cumulative bin mass (grams) for multiple horizons (+5m, +15m, +30m).
    Applies physical bounds (0 <= weight <= 10,000g) and evaluates against persistence baseline.
    """

    HORIZONS = {
        "5m": {"seconds": 300, "target_col": "target_weight_5m"},
        "15m": {"seconds": 900, "target_col": "target_weight_15m"},
        "30m": {"seconds": 1800, "target_col": "target_weight_30m"},
    }

    def __init__(self, n_estimators: int = 100, max_depth: int = 12, random_state: int = 42):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.random_state = random_state
        self.feature_columns = FEATURE_COLUMNS
        self.max_capacity_g: float = 10000.0

        # Multi-horizon regression models
        self.models: Dict[str, RandomForestRegressor] = {
            horizon: RandomForestRegressor(
                n_estimators=50,
                max_depth=10,
                random_state=random_state + idx * 7,
                n_jobs=1,
            )
            for idx, horizon in enumerate(self.HORIZONS.keys())
        }
        self.is_fitted = False
        self.online_extractor = OnlineFeatureExtractor(buffer_size=10)

    def fit(self, X_train: pd.DataFrame) -> "WasteAccumulationForecaster":
        """Fits multi-horizon regression models on training data."""
        features = X_train[self.feature_columns]

        for horizon, cfg in self.HORIZONS.items():
            target_col = cfg["target_col"]
            if target_col in X_train.columns:
                valid_mask = X_train[target_col].notna()
                y = X_train.loc[valid_mask, target_col].astype(float)
                X = features.loc[valid_mask]
                self.models[horizon].fit(X, y)

        self.is_fitted = True
        return self

    def predict(self, X: pd.DataFrame, horizon: str = "5m") -> np.ndarray:
        """Predicts future weight for a given horizon with physical bounds."""
        if not self.is_fitted or horizon not in self.models:
            raise RuntimeError(f"Forecaster not fitted or invalid horizon {horizon}")

        features = X[self.feature_columns]
        raw_preds = self.models[horizon].predict(features)

        # Apply physical constraints: mass cannot be negative or exceed bin capacity
        bounded_preds = np.clip(raw_preds, 0.0, self.max_capacity_g)
        return np.round(bounded_preds, 1)

    def evaluate(self, X_test: pd.DataFrame) -> Dict[str, Any]:
        """
        Evaluates forecaster across all horizons against chronological test data,
        comparing against persistence baseline (y_hat = current_weight).
        """
        results: Dict[str, Any] = {}
        features = X_test[self.feature_columns]
        current_weight = X_test["weight_g_imputed"].values

        for horizon, cfg in self.HORIZONS.items():
            target_col = cfg["target_col"]
            if target_col not in X_test.columns:
                continue

            valid_mask = X_test[target_col].notna()
            y_true = X_test.loc[valid_mask, target_col].values.astype(float)
            y_pred = self.predict(X_test.loc[valid_mask], horizon=horizon)
            y_baseline = current_weight[valid_mask]

            # Model metrics
            model_mae = float(mean_absolute_error(y_true, y_pred))
            model_rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))

            # Baseline metrics (persistence: weight stays constant)
            baseline_mae = float(mean_absolute_error(y_true, y_baseline))
            baseline_rmse = float(np.sqrt(mean_squared_error(y_true, y_baseline)))

            results[horizon] = {
                "horizon_seconds": cfg["seconds"],
                "model_mae_grams": round(model_mae, 2),
                "model_rmse_grams": round(model_rmse, 2),
                "baseline_persistence_mae_grams": round(baseline_mae, 2),
                "baseline_persistence_rmse_grams": round(baseline_rmse, 2),
                "mae_improvement_grams": round(baseline_mae - model_mae, 2),
                "beats_baseline": bool(model_mae < baseline_mae),
                "test_samples": int(valid_mask.sum())
            }

        return {
            "horizons": results,
            "evaluation_provenance": "SYNTHETIC CHRONOLOGICAL TEST — NOT REAL-WORLD VALIDATION"
        }

    def predict_single(self, record: Dict[str, Any], horizon: str = "5m") -> Dict[str, Any]:
        """
        Real-time weight forecast for a single telemetry record.
        """
        current_g = float(record.get("weight_g") or 0.0)

        if not self.is_fitted:
            return {
                "status": "model_unavailable",
                "predicted_weight_g": current_g,
                "current_weight_g": current_g,
                "horizon": horizon,
                "provenance": "MODEL_UNAVAILABLE"
            }

        features_df = self.online_extractor.update_and_extract(record)
        pred_g = float(self.predict(features_df, horizon=horizon)[0])

        # Estimate simple uncertainty envelope based on tree variance
        trees = self.models[horizon].estimators_
        tree_preds = [t.predict(features_df[self.feature_columns])[0] for t in trees]
        std_dev = float(np.std(tree_preds))

        lower_bound = max(0.0, round(pred_g - 1.96 * std_dev, 1))
        upper_bound = min(self.max_capacity_g, round(pred_g + 1.96 * std_dev, 1))

        return {
            "status": "forecast_ready",
            "current_weight_g": round(current_g, 1),
            "predicted_weight_g": round(pred_g, 1),
            "horizon": horizon,
            "horizon_seconds": self.HORIZONS.get(horizon, {}).get("seconds", 300),
            "lower_bound_g": lower_bound,
            "upper_bound_g": upper_bound,
            "persistence_baseline_g": round(current_g, 1),
            "source": record.get("source", "simulation"),
            "provenance": "SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION"
        }

    def save(self, filepath: str) -> None:
        """Saves models to a joblib artifact."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        payload = {
            "models": self.models,
            "feature_columns": self.feature_columns,
            "is_fitted": self.is_fitted,
            "n_estimators": self.n_estimators,
            "max_depth": self.max_depth,
            "max_capacity_g": self.max_capacity_g
        }
        joblib.dump(payload, filepath)

    @classmethod
    def load(cls, filepath: str) -> "WasteAccumulationForecaster":
        """Loads models from a joblib artifact."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Forecaster artifact not found at {filepath}")

        payload = joblib.load(filepath)
        forecaster = cls(
            n_estimators=payload.get("n_estimators", 100),
            max_depth=payload.get("max_depth", 12)
        )
        forecaster.models = payload["models"]
        forecaster.feature_columns = payload.get("feature_columns", FEATURE_COLUMNS)
        forecaster.is_fitted = payload.get("is_fitted", True)
        forecaster.max_capacity_g = payload.get("max_capacity_g", 10000.0)
        return forecaster
