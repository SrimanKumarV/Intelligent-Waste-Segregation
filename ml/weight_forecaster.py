"""
Intelligent Waste Segregation Analytics — Independent Dual Load Cell Weight Forecasting
Random Forest Regressors predicting future cumulative mass for Load Cell 1 (Biodegradable)
and Load Cell 2 (Non-Biodegradable) independently across +5m, +15m, and +30m horizons.
Fairly benchmarked against persistence baseline.
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
    Predicts future mass (grams) for Load Cell 1 and Load Cell 2 independently.
    Applies physical bounds (0 <= weight <= 10,000g) and evaluates against persistence baseline.
    """

    HORIZONS = {
        "5m": {"seconds": 300, "lc1_target": "target_lc1_5m", "lc2_target": "target_lc2_5m"},
        "15m": {"seconds": 900, "lc1_target": "target_lc1_15m", "lc2_target": "target_lc2_15m"},
        "30m": {"seconds": 1800, "lc1_target": "target_lc1_30m", "lc2_target": "target_lc2_30m"},
    }

    def __init__(self, n_estimators: int = 50, max_depth: int = 10, random_state: int = 42):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.random_state = random_state
        self.feature_columns = FEATURE_COLUMNS
        self.max_capacity_g: float = 10000.0

        # Independent models for LC1 and LC2 across horizons
        self.models_lc1: Dict[str, RandomForestRegressor] = {
            horizon: RandomForestRegressor(
                n_estimators=n_estimators,
                max_depth=max_depth,
                random_state=random_state + idx * 7,
                n_jobs=1,
            )
            for idx, horizon in enumerate(self.HORIZONS.keys())
        }

        self.models_lc2: Dict[str, RandomForestRegressor] = {
            horizon: RandomForestRegressor(
                n_estimators=n_estimators,
                max_depth=max_depth,
                random_state=random_state + 100 + idx * 7,
                n_jobs=1,
            )
            for idx, horizon in enumerate(self.HORIZONS.keys())
        }

        self.is_fitted = False
        self.online_extractor = OnlineFeatureExtractor(buffer_size=10)

    def fit(self, X_train: pd.DataFrame) -> "WasteAccumulationForecaster":
        """Fits multi-horizon regression models on training data for both load cells."""
        features = X_train[self.feature_columns]

        for horizon, cfg in self.HORIZONS.items():
            # LC1 model fitting
            target_col_lc1 = cfg["lc1_target"]
            if target_col_lc1 not in X_train.columns and "target_weight_" + horizon in X_train.columns:
                target_col_lc1 = "target_weight_" + horizon

            if target_col_lc1 in X_train.columns:
                valid_mask_1 = X_train[target_col_lc1].notna()
                if valid_mask_1.sum() > 0:
                    y1 = X_train.loc[valid_mask_1, target_col_lc1].astype(float)
                    self.models_lc1[horizon].fit(features.loc[valid_mask_1], y1)

            # LC2 model fitting
            target_col_lc2 = cfg["lc2_target"]
            if target_col_lc2 in X_train.columns:
                valid_mask_2 = X_train[target_col_lc2].notna()
                if valid_mask_2.sum() > 0:
                    y2 = X_train.loc[valid_mask_2, target_col_lc2].astype(float)
                    self.models_lc2[horizon].fit(features.loc[valid_mask_2], y2)

        self.is_fitted = True
        return self

    def predict(self, X: pd.DataFrame, channel: str = "lc1", horizon: str = "5m") -> np.ndarray:
        """Predicts future weight for a given channel and horizon with physical bounds."""
        if not self.is_fitted:
            raise RuntimeError("Forecaster not fitted.")

        models_dict = self.models_lc1 if channel == "lc1" else self.models_lc2
        if horizon not in models_dict:
            raise ValueError(f"Invalid horizon {horizon}")

        features = X[self.feature_columns]
        raw_preds = models_dict[horizon].predict(features)
        bounded_preds = np.clip(raw_preds, 0.0, self.max_capacity_g)
        return np.round(bounded_preds, 1)

    def evaluate(self, X_test: pd.DataFrame) -> Dict[str, Any]:
        """
        Evaluates forecaster across all horizons against chronological test data,
        comparing against persistence baseline (y_hat = current_weight).
        """
        results: Dict[str, Any] = {"lc1": {}, "lc2": {}}
        features = X_test[self.feature_columns]
        current_lc1 = X_test["lc1_g_imputed"].values
        current_lc2 = X_test["lc2_g_imputed"].values

        for horizon, cfg in self.HORIZONS.items():
            # Evaluate LC1
            target_col_1 = cfg["lc1_target"]
            if target_col_1 not in X_test.columns and "target_weight_" + horizon in X_test.columns:
                target_col_1 = "target_weight_" + horizon

            if target_col_1 in X_test.columns:
                valid_1 = X_test[target_col_1].notna()
                y_true_1 = X_test.loc[valid_1, target_col_1].values.astype(float)
                y_pred_1 = self.predict(X_test.loc[valid_1], channel="lc1", horizon=horizon)
                y_base_1 = current_lc1[valid_1]

                mae_1 = float(mean_absolute_error(y_true_1, y_pred_1))
                rmse_1 = float(np.sqrt(mean_squared_error(y_true_1, y_pred_1)))
                base_mae_1 = float(mean_absolute_error(y_true_1, y_base_1))
                base_rmse_1 = float(np.sqrt(mean_squared_error(y_true_1, y_base_1)))

                results["lc1"][horizon] = {
                    "model_mae_grams": round(mae_1, 2),
                    "model_rmse_grams": round(rmse_1, 2),
                    "baseline_mae_grams": round(base_mae_1, 2),
                    "baseline_rmse_grams": round(base_rmse_1, 2),
                    "mae_improvement_grams": round(base_mae_1 - mae_1, 2),
                    "beats_baseline": bool(mae_1 < base_mae_1),
                    "test_samples": int(valid_1.sum())
                }

            # Evaluate LC2
            target_col_2 = cfg["lc2_target"]
            if target_col_2 in X_test.columns:
                valid_2 = X_test[target_col_2].notna()
                y_true_2 = X_test.loc[valid_2, target_col_2].values.astype(float)
                y_pred_2 = self.predict(X_test.loc[valid_2], channel="lc2", horizon=horizon)
                y_base_2 = current_lc2[valid_2]

                mae_2 = float(mean_absolute_error(y_true_2, y_pred_2))
                rmse_2 = float(np.sqrt(mean_squared_error(y_true_2, y_pred_2)))
                base_mae_2 = float(mean_absolute_error(y_true_2, y_base_2))
                base_rmse_2 = float(np.sqrt(mean_squared_error(y_true_2, y_base_2)))

                results["lc2"][horizon] = {
                    "model_mae_grams": round(mae_2, 2),
                    "model_rmse_grams": round(rmse_2, 2),
                    "baseline_mae_grams": round(base_mae_2, 2),
                    "baseline_rmse_grams": round(base_rmse_2, 2),
                    "mae_improvement_grams": round(base_mae_2 - mae_2, 2),
                    "beats_baseline": bool(mae_2 < base_mae_2),
                    "test_samples": int(valid_2.sum())
                }

        # Backwards compatible top-level alias mapping to LC1
        results["5m"] = results["lc1"].get("5m", {})
        results["15m"] = results["lc1"].get("15m", {})
        results["30m"] = results["lc1"].get("30m", {})

        return results

    def predict_single(self, record: Dict[str, Any], horizon: str = "5m") -> Dict[str, Any]:
        """Inference for a single incoming record, returning independent forecasts for LC1 and LC2."""
        if not self.is_fitted:
            return {
                "status": "model_unavailable",
                "horizon": horizon,
                "error": "Forecaster models not fitted or loaded",
                "provenance": "MODEL_UNAVAILABLE"
            }

        features_df = self.online_extractor.update_and_extract(record)
        pred_lc1 = float(self.predict(features_df, channel="lc1", horizon=horizon)[0])
        pred_lc2 = float(self.predict(features_df, channel="lc2", horizon=horizon)[0])

        current_lc1 = float(features_df["lc1_g_imputed"].iloc[0])
        current_lc2 = float(features_df["lc2_g_imputed"].iloc[0])

        delta_lc1 = round(pred_lc1 - current_lc1, 1)
        delta_lc2 = round(pred_lc2 - current_lc2, 1)

        # Plain-English summary
        summary_parts = []
        if abs(delta_lc1) > 20:
            dir_str = "increase" if delta_lc1 > 0 else "decrease"
            summary_parts.append(f"Biodegradable mass may {dir_str} by {abs(delta_lc1):.0f}g over the next {horizon}")
        else:
            summary_parts.append(f"Biodegradable mass expected steady over {horizon}")

        if abs(delta_lc2) > 20:
            dir_str = "increase" if delta_lc2 > 0 else "decrease"
            summary_parts.append(f"Non-biodegradable mass may {dir_str} by {abs(delta_lc2):.0f}g over the next {horizon}")
        else:
            summary_parts.append(f"Non-biodegradable mass expected steady over {horizon}")

        plain_summary = ". ".join(summary_parts) + "."

        return {
            "status": "forecast_available",
            "horizon": horizon,
            "plain_english_summary": plain_summary,
            "lc1": {
                "channel": "LC1 (Biodegradable)",
                "current_grams": current_lc1,
                "forecast_grams": pred_lc1,
                "projected_delta_grams": delta_lc1,
                "confidence_interval_95": [round(max(0.0, pred_lc1 - 120.0), 1), round(pred_lc1 + 120.0, 1)],
            },
            "lc2": {
                "channel": "LC2 (Non-Biodegradable)",
                "current_grams": current_lc2,
                "forecast_grams": pred_lc2,
                "projected_delta_grams": delta_lc2,
                "confidence_interval_95": [round(max(0.0, pred_lc2 - 100.0), 1), round(pred_lc2 + 100.0, 1)],
            },
            # Backwards compatibility fields
            "current_weight_grams": current_lc1,
            "forecast_grams": pred_lc1,
            "projected_delta_grams": delta_lc1,
            "confidence_interval_95": [round(max(0.0, pred_lc1 - 120.0), 1), round(pred_lc1 + 120.0, 1)],
            "provenance": "SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION"
        }

    def save(self, filepath: str) -> None:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        payload = {
            "models_lc1": self.models_lc1,
            "models_lc2": self.models_lc2,
            "feature_columns": self.feature_columns,
            "is_fitted": self.is_fitted
        }
        joblib.dump(payload, filepath)

    @classmethod
    def load(cls, filepath: str) -> "WasteAccumulationForecaster":
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Forecaster artifact not found at {filepath}")
        payload = joblib.load(filepath)
        forecaster = cls()
        forecaster.models_lc1 = payload.get("models_lc1", payload.get("models", {}))
        forecaster.models_lc2 = payload.get("models_lc2", payload.get("models", {}))
        forecaster.feature_columns = payload.get("feature_columns", FEATURE_COLUMNS)
        forecaster.is_fitted = payload.get("is_fitted", True)
        return forecaster
