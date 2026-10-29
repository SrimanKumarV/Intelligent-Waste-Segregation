"""
Intelligent Waste Segregation Analytics — Experimental Waste Category Classifier
PROTOTYPE ONLY: Demonstrates ML classifier pipeline on synthetic sensor distributions.

CRITICAL ARCHITECTURE CONSTRAINTS:
1. Strict 2-Class Model: "BIODEGRADABLE" (Category A) vs "NON_BIODEGRADABLE" (Category B).
2. Compartment C is an unconfigured future-use bin, NOT a classification label.
3. Moisture and mass alone cannot conclusively determine real-world chemical identity.
"""

import os
import joblib
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier

from ml.features import FEATURE_COLUMNS, OnlineFeatureExtractor


class ExperimentalCategoryClassifier:
    """
    Experimental prototype classifier predicting synthetic categories
    ("BIODEGRADABLE", "NON_BIODEGRADABLE").
    """

    CATEGORIES = ["BIODEGRADABLE", "NON_BIODEGRADABLE"]

    def __init__(self, n_estimators: int = 80, random_state: int = 42):
        self.n_estimators = n_estimators
        self.random_state = random_state
        self.feature_columns = FEATURE_COLUMNS
        self.model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=8,
            random_state=random_state,
            n_jobs=1
        )
        self.is_fitted = False
        self.online_extractor = OnlineFeatureExtractor(buffer_size=10)

    def fit(self, X_train: pd.DataFrame, y_train: pd.Series) -> "ExperimentalCategoryClassifier":
        """Fits classifier strictly on active 2 categories (Biodegradable vs Non-Biodegradable)."""
        valid_mask = y_train.isin(self.CATEGORIES)
        if valid_mask.sum() > 0:
            self.model.fit(X_train.loc[valid_mask, self.feature_columns], y_train.loc[valid_mask])
            self.is_fitted = True
        return self

    def predict_single(self, record: Dict[str, Any]) -> Dict[str, Any]:
        """Inference for a single record with explicit experimental disclaimer."""
        if not self.is_fitted:
            return {
                "status": "model_unavailable",
                "predicted_category": "UNCLASSIFIED",
                "confidence": 0.0,
                "disclaimer": "Experimental classifier not fitted or unavailable"
            }

        features_df = self.online_extractor.update_and_extract(record)
        probs = self.model.predict_proba(features_df[self.feature_columns])[0]
        classes = self.model.classes_
        best_idx = int(np.argmax(probs))
        pred_cat = str(classes[best_idx])
        confidence = round(float(probs[best_idx]) * 100, 1)

        return {
            "status": "classified",
            "predicted_category": pred_cat,
            "confidence_percent": confidence,
            "classes": [str(c) for c in classes],
            "probabilities": [round(float(p), 4) for p in probs],
            "is_experimental": True,
            "disclaimer": "SYNTHETIC PROFILE INFERENCE — NOT REAL-WORLD MATERIAL VERIFICATION",
            "provenance": "SYNTHETIC MODEL TEST"
        }

    def save(self, filepath: str) -> None:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump({
            "model": self.model,
            "is_fitted": self.is_fitted,
            "feature_columns": self.feature_columns,
            "categories": self.CATEGORIES
        }, filepath)

    @classmethod
    def load(cls, filepath: str) -> "ExperimentalCategoryClassifier":
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Classifier artifact not found at {filepath}")
        payload = joblib.load(filepath)
        clf = cls()
        clf.model = payload["model"]
        clf.is_fitted = payload.get("is_fitted", True)
        clf.feature_columns = payload.get("feature_columns", FEATURE_COLUMNS)
        return clf
