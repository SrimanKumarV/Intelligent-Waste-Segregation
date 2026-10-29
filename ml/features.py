"""
Intelligent Waste Segregation Analytics — Feature Extraction Pipeline
Supports both offline batch DataFrame transformation and online single-record streaming.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd


FEATURE_COLUMNS = [
    "moist_pct_imputed",
    "moist_raw",
    "weight_g_imputed",
    "weight_raw",
    "dist_cm_imputed",
    "prox_val",
    "lid_is_open",
    "weight_delta_1",
    "moist_delta_1",
    "weight_roll_mean_5",
    "weight_roll_std_5",
    "moist_roll_mean_5",
    "moist_roll_std_5",
    "moist_missing",
    "weight_missing",
    "dist_missing",
    "moist_ok_val",
    "weight_ok_val",
    "fault_count",
]


def extract_batch_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transforms a DataFrame of chronological telemetry records into engineered features.
    Computes rolling windows and deltas grouped by session_id to prevent cross-session bleeding.
    """
    df = df.copy()

    # Sort chronologically if columns exist
    sort_cols = []
    if "sim_session_id" in df.columns:
        sort_cols.append("sim_session_id")
    if "dt_timestamp" in df.columns:
        sort_cols.append("dt_timestamp")
    elif "seq" in df.columns:
        sort_cols.append("seq")

    if sort_cols:
        df = df.sort_values(sort_cols)

    # Group by session if available, else process as a single sequence
    grouped = df.groupby("sim_session_id") if "sim_session_id" in df.columns else [(None, df)]

    feature_dfs = []
    for _, session_df in grouped:
        s = session_df.copy()

        # Missingness flags
        s["moist_missing"] = s["moist_pct"].isna().astype(float)
        s["weight_missing"] = s["weight_g"].isna().astype(float)
        s["dist_missing"] = s["dist_cm"].isna().astype(float)

        # Imputed values
        s["moist_pct_imputed"] = s["moist_pct"].fillna(50.0).astype(float)
        s["moist_raw"] = s["moist_raw"].fillna(620).astype(float)
        s["weight_g_imputed"] = s["weight_g"].fillna(0.0).astype(float)
        s["weight_raw"] = s["weight_raw"].fillna(100000).astype(float)
        s["dist_cm_imputed"] = s["dist_cm"].fillna(70.0).astype(float)

        # Boolean and categorical flags
        s["prox_val"] = s["prox"].astype(bool).astype(float)
        s["lid_is_open"] = (s["lid_cmd"] == "OPEN").astype(float)
        s["moist_ok_val"] = s["moist_ok"].astype(bool).astype(float)
        s["weight_ok_val"] = s["weight_ok"].astype(bool).astype(float)

        # Fault count
        if "faults" in s.columns:
            if isinstance(s["faults"].iloc[0], list):
                s["fault_count"] = s["faults"].apply(lambda f: len(f) if isinstance(f, list) else 0).astype(float)
            else:
                s["fault_count"] = s["faults"].apply(
                    lambda f: len(str(f).split(";")) if pd.notna(f) and str(f).strip() else 0
                ).astype(float)
        else:
            s["fault_count"] = 0.0

        # Rate of change / Deltas
        s["weight_delta_1"] = s["weight_g_imputed"].diff().fillna(0.0)
        s["moist_delta_1"] = s["moist_pct_imputed"].diff().fillna(0.0)

        # Rolling statistics (window=5)
        s["weight_roll_mean_5"] = s["weight_g_imputed"].rolling(window=5, min_periods=1).mean()
        s["weight_roll_std_5"] = s["weight_g_imputed"].rolling(window=5, min_periods=1).std().fillna(0.0)
        s["moist_roll_mean_5"] = s["moist_pct_imputed"].rolling(window=5, min_periods=1).mean()
        s["moist_roll_std_5"] = s["moist_pct_imputed"].rolling(window=5, min_periods=1).std().fillna(0.0)

        feature_dfs.append(s)

    result_df = pd.concat(feature_dfs, ignore_index=True)
    return result_df


class OnlineFeatureExtractor:
    """
    Maintains a rolling buffer of recent telemetry records to extract identical
    features for single real-time inference requests.
    """

    def __init__(self, buffer_size: int = 10):
        self.buffer_size = buffer_size
        self.history: List[Dict[str, Any]] = []

    def update_and_extract(self, record: Dict[str, Any]) -> pd.DataFrame:
        """
        Appends the new record, calculates rolling statistics over the buffer,
        and returns a 1-row DataFrame containing the feature columns.
        """
        self.history.append(record)
        if len(self.history) > self.buffer_size:
            self.history.pop(0)

        history_df = pd.DataFrame(self.history)
        features_df = extract_batch_features(history_df)
        return features_df.iloc[[-1]][FEATURE_COLUMNS]

    def reset(self) -> None:
        self.history.clear()
