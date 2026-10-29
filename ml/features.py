"""
Intelligent Waste Segregation Analytics — Feature Extraction Pipeline
Supports 4 independent channels (C1, C2, LC1, LC2) across dual microcontrollers (Uno & ESP32).
Provides both offline batch DataFrame transformation and online single-record streaming.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd


FEATURE_COLUMNS = [
    "c1_pct_imputed",
    "c1_raw",
    "c2_pct_imputed",
    "c2_raw",
    "lc1_g_imputed",
    "lc1_raw",
    "lc2_g_imputed",
    "lc2_raw",
    "dist_cm_imputed",
    "prox_val",
    "lid_is_open",
    "lc1_delta_1",
    "lc2_delta_1",
    "c1_delta_1",
    "c2_delta_1",
    "lc1_roll_mean_5",
    "lc1_roll_std_5",
    "lc2_roll_mean_5",
    "lc2_roll_std_5",
    "c1_roll_mean_5",
    "c1_roll_std_5",
    "c2_roll_mean_5",
    "c2_roll_std_5",
    "c1_missing",
    "c2_missing",
    "lc1_missing",
    "lc2_missing",
    "dist_missing",
    "uno_connected",
    "esp32_connected",
    "fault_count",
]


def extract_batch_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transforms a DataFrame of chronological multi-channel telemetry records into engineered features.
    Computes rolling statistics and deltas grouped by session_id to prevent cross-session leakage.
    """
    df = df.copy()

    # Backwards compatibility aliases if input uses singular legacy field names
    if "c1_pct" not in df.columns and "moist_pct" in df.columns:
        df["c1_pct"] = df["moist_pct"]
    if "c1_raw" not in df.columns and "moist_raw" in df.columns:
        df["c1_raw"] = df["moist_raw"]
    if "c2_pct" not in df.columns:
        df["c2_pct"] = np.nan
    if "c2_raw" not in df.columns:
        df["c2_raw"] = np.nan

    if "lc1_g" not in df.columns and "weight_g" in df.columns:
        df["lc1_g"] = df["weight_g"]
    if "lc1_raw" not in df.columns and "weight_raw" in df.columns:
        df["lc1_raw"] = df["weight_raw"]
    if "lc2_g" not in df.columns:
        df["lc2_g"] = np.nan
    if "lc2_raw" not in df.columns:
        df["lc2_raw"] = np.nan

    # Sort chronologically within sessions
    sort_cols = []
    if "sim_session_id" in df.columns:
        sort_cols.append("sim_session_id")
    if "dt_timestamp" in df.columns:
        sort_cols.append("dt_timestamp")
    elif "seq" in df.columns:
        sort_cols.append("seq")

    if sort_cols:
        df = df.sort_values(sort_cols)

    grouped = df.groupby("sim_session_id") if "sim_session_id" in df.columns else [(None, df)]

    feature_dfs = []
    for _, session_df in grouped:
        s = session_df.copy()

        # Missingness flags
        s["c1_missing"] = s["c1_pct"].isna().astype(float)
        s["c2_missing"] = s["c2_pct"].isna().astype(float)
        s["lc1_missing"] = s["lc1_g"].isna().astype(float)
        s["lc2_missing"] = s["lc2_g"].isna().astype(float)
        s["dist_missing"] = s["dist_cm"].isna().astype(float) if "dist_cm" in s.columns else 1.0

        # Imputed numerical values (using realistic midpoints / baselines)
        s["c1_pct_imputed"] = s["c1_pct"].fillna(50.0).astype(float)
        s["c1_raw"] = s["c1_raw"].fillna(2600.0).astype(float)
        s["c2_pct_imputed"] = s["c2_pct"].fillna(15.0).astype(float)
        s["c2_raw"] = s["c2_raw"].fillna(3200.0).astype(float)

        s["lc1_g_imputed"] = s["lc1_g"].fillna(0.0).astype(float)
        s["lc1_raw"] = s["lc1_raw"].fillna(100000.0).astype(float)
        s["lc2_g_imputed"] = s["lc2_g"].fillna(0.0).astype(float)
        s["lc2_raw"] = s["lc2_raw"].fillna(100000.0).astype(float)

        s["dist_cm_imputed"] = s["dist_cm"].fillna(72.0).astype(float) if "dist_cm" in s.columns else 72.0

        # Device connection and state indicators
        s["prox_val"] = s["prox"].astype(bool).astype(float) if "prox" in s.columns else 0.0
        s["lid_is_open"] = (s["lid_cmd"] == "OPEN").astype(float) if "lid_cmd" in s.columns else 0.0

        if "uno_connected" in s.columns:
            s["uno_connected"] = s["uno_connected"].astype(bool).astype(float)
        else:
            s["uno_connected"] = (~s["dist_missing"].astype(bool)).astype(float)

        if "esp32_connected" in s.columns:
            s["esp32_connected"] = s["esp32_connected"].astype(bool).astype(float)
        else:
            s["esp32_connected"] = ((~s["c1_missing"].astype(bool)) | (~s["lc1_missing"].astype(bool))).astype(float)

        # Fault count calculation
        if "faults" in s.columns:
            if len(s) > 0 and isinstance(s["faults"].iloc[0], list):
                s["fault_count"] = s["faults"].apply(lambda f: len(f) if isinstance(f, list) else 0).astype(float)
            else:
                s["fault_count"] = s["faults"].apply(
                    lambda f: len(str(f).split(";")) if pd.notna(f) and str(f).strip() else 0
                ).astype(float)
        else:
            s["fault_count"] = 0.0

        # Deltas / Rates of change
        s["lc1_delta_1"] = s["lc1_g_imputed"].diff().fillna(0.0)
        s["lc2_delta_1"] = s["lc2_g_imputed"].diff().fillna(0.0)
        s["c1_delta_1"] = s["c1_pct_imputed"].diff().fillna(0.0)
        s["c2_delta_1"] = s["c2_pct_imputed"].diff().fillna(0.0)

        # Rolling statistics (window=5)
        s["lc1_roll_mean_5"] = s["lc1_g_imputed"].rolling(window=5, min_periods=1).mean()
        s["lc1_roll_std_5"] = s["lc1_g_imputed"].rolling(window=5, min_periods=1).std().fillna(0.0)
        s["lc2_roll_mean_5"] = s["lc2_g_imputed"].rolling(window=5, min_periods=1).mean()
        s["lc2_roll_std_5"] = s["lc2_g_imputed"].rolling(window=5, min_periods=1).std().fillna(0.0)

        s["c1_roll_mean_5"] = s["c1_pct_imputed"].rolling(window=5, min_periods=1).mean()
        s["c1_roll_std_5"] = s["c1_pct_imputed"].rolling(window=5, min_periods=1).std().fillna(0.0)
        s["c2_roll_mean_5"] = s["c2_pct_imputed"].rolling(window=5, min_periods=1).mean()
        s["c2_roll_std_5"] = s["c2_pct_imputed"].rolling(window=5, min_periods=1).std().fillna(0.0)

        feature_dfs.append(s)

    result_df = pd.concat(feature_dfs, ignore_index=True)
    return result_df


class OnlineFeatureExtractor:
    """
    Maintains a rolling buffer of multi-channel telemetry records to extract
    identical feature representations for single real-time inference requests.
    """

    def __init__(self, buffer_size: int = 10):
        self.buffer_size = buffer_size
        self.history: List[Dict[str, Any]] = []

    def update_and_extract(self, record: Dict[str, Any]) -> pd.DataFrame:
        """
        Appends the incoming record, computes rolling features, and returns
        a 1-row DataFrame containing the exact FEATURE_COLUMNS.
        """
        self.history.append(record)
        if len(self.history) > self.buffer_size:
            self.history.pop(0)

        history_df = pd.DataFrame(self.history)
        features_df = extract_batch_features(history_df)
        return features_df.iloc[[-1]][FEATURE_COLUMNS]

    def reset(self) -> None:
        self.history.clear()
