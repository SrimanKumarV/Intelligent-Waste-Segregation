"""
Intelligent Waste Segregation Analytics — Reproducible Synthetic Dataset Generator
Generates >= 24,000 multi-scenario, temporally coherent IoT sensor records across 4 channels (C1, C2, LC1, LC2).
Enforces session-based partitioning to prevent data leakage between train, validation, and test sets.
"""

import os
import sys
import json
import argparse
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

# Ensure parent directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pandas as pd
from ml.synthetic_data import generate_session_dataset, SyntheticSensorConfig


def generate_full_dataset(
    output_dir: str = "data/synthetic",
    total_target_records: int = 24000,
    seed: int = 42,
    sampling_interval_s: float = 1.0,
) -> Dict[str, Any]:
    """
    Generates a multi-session, multi-scenario synthetic dataset for the 4-channel system.
    Splits sessions chronologically into train (70%), validation (15%), and test (15%).
    """
    os.makedirs(output_dir, exist_ok=True)

    scenarios_plan = [
        # Training Sessions (70% ~ 16,800 records)
        {"session_id": "SES-TRAIN-01", "scenario": "NORMAL_OPERATION", "records": 3500, "split": "train"},
        {"session_id": "SES-TRAIN-02", "scenario": "BIN1_ACCUMULATION", "records": 3500, "split": "train"},
        {"session_id": "SES-TRAIN-03", "scenario": "BIN2_ACCUMULATION", "records": 3500, "split": "train"},
        {"session_id": "SES-TRAIN-04", "scenario": "UNO_DISCONNECTED", "records": 2300, "split": "train"},
        {"session_id": "SES-TRAIN-05", "scenario": "ESP32_DISCONNECTED", "records": 2000, "split": "train"},
        {"session_id": "SES-TRAIN-06", "scenario": "SENSOR_FAULTS", "records": 2000, "split": "train"},

        # Validation Sessions (15% ~ 3,600 records)
        {"session_id": "SES-VAL-01", "scenario": "NORMAL_OPERATION", "records": 1200, "split": "val"},
        {"session_id": "SES-VAL-02", "scenario": "BIN1_ACCUMULATION", "records": 1200, "split": "val"},
        {"session_id": "SES-VAL-03", "scenario": "SENSOR_FAULTS", "records": 1200, "split": "val"},

        # Test Sessions (15% ~ 3,600 records)
        {"session_id": "SES-TEST-01", "scenario": "NORMAL_OPERATION", "records": 1200, "split": "test"},
        {"session_id": "SES-TEST-02", "scenario": "BIN2_ACCUMULATION", "records": 1200, "split": "test"},
        {"session_id": "SES-TEST-03", "scenario": "SENSOR_FAULTS", "records": 1200, "split": "test"},
    ]

    all_records: List[Dict[str, Any]] = []
    base_time = datetime(2026, 1, 1, 8, 0, 0, tzinfo=timezone.utc)
    scenario_counts: Dict[str, int] = {}
    split_counts: Dict[str, int] = {"train": 0, "val": 0, "test": 0}
    session_offset_s = 0

    print(f"[DATASET] Generating 4-channel synthetic dataset (seed={seed}, target >={total_target_records})...")

    for idx, plan in enumerate(scenarios_plan):
        session_seed = seed + idx * 101
        session_start = base_time + timedelta(seconds=session_offset_s)

        print(f"  -> Generating session {plan['session_id']} ({plan['scenario']}, {plan['records']} samples, split={plan['split']})...")
        session_data = generate_session_dataset(
            session_id=plan["session_id"],
            scenario=plan["scenario"],
            num_samples=plan["records"],
            sampling_interval_s=sampling_interval_s,
            start_time=session_start,
            seed=session_seed,
        )

        for rec in session_data:
            rec["split"] = plan["split"]
            all_records.append(rec)

        scenario_counts[plan["scenario"]] = scenario_counts.get(plan["scenario"], 0) + len(session_data)
        split_counts[plan["split"]] += len(session_data)
        session_offset_s += int(plan["records"] * sampling_interval_s) + 300  # 5 min gap between sessions

    # Export to JSONL
    jsonl_path = os.path.join(output_dir, "sensor_readings.jsonl")
    print(f"[DATASET] Writing {len(all_records)} records to {jsonl_path}...")
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for r in all_records:
            f.write(json.dumps(r) + "\n")

    # Export to CSV (flattening lists for tabular ML ingestion)
    csv_path = os.path.join(output_dir, "sensor_readings.csv")
    print(f"[DATASET] Writing {len(all_records)} records to {csv_path}...")
    csv_records = []
    for r in all_records:
        r_copy = dict(r)
        r_copy["faults"] = ";".join(r.get("faults", []))
        r_copy["anomaly_reasons"] = ";".join(r.get("anomaly_reasons", []))
        csv_records.append(r_copy)

    df = pd.DataFrame(csv_records)
    df.to_csv(csv_path, index=False)

    faulty_records = sum(1 for r in all_records if r.get("target_anomaly", False))
    fault_rate = round((faulty_records / len(all_records)) * 100, 2)

    metadata: Dict[str, Any] = {
        "dataset_name": "Intelligent Waste Segregation 4-Channel Multi-MCU Synthetic Telemetry",
        "dataset_version": "2.0.0",
        "generator_version": "2.0.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "random_seed": seed,
        "sampling_interval_s": sampling_interval_s,
        "total_records": len(all_records),
        "split_counts": split_counts,
        "scenario_distribution": scenario_counts,
        "fault_statistics": {
            "total_anomalous_records": faulty_records,
            "anomaly_rate_percent": fault_rate,
        },
        "sensor_specifications": {
            "c1_moisture": {
                "role": "Compartment A (Biodegradable Waste)",
                "type": "Capacitive Soil Moisture Analog GPIO 34 (ADC1)",
                "raw_adc_bounds": [0, 4095],
                "valid_adc_bounds": [SyntheticSensorConfig.MOISTURE_ADC_MIN_VALID, SyntheticSensorConfig.MOISTURE_ADC_MAX_VALID],
                "units": "Percent (%) and Raw 12-bit ADC"
            },
            "c2_moisture": {
                "role": "Compartment B (Non-Biodegradable Waste)",
                "type": "Capacitive Soil Moisture Analog GPIO 35 (ADC1)",
                "raw_adc_bounds": [0, 4095],
                "valid_adc_bounds": [SyntheticSensorConfig.MOISTURE_ADC_MIN_VALID, SyntheticSensorConfig.MOISTURE_ADC_MAX_VALID],
                "units": "Percent (%) and Raw 12-bit ADC"
            },
            "lc1_weight": {
                "role": "Compartment A Mass (Biodegradable)",
                "type": "Load Cell 1 + HX711 (DOUT 16, SCK 4)",
                "max_capacity_g": SyntheticSensorConfig.WEIGHT_MAX_CAPACITY_GRAMS,
                "units": "Grams (g) and Raw Counts"
            },
            "lc2_weight": {
                "role": "Compartment B Mass (Non-Biodegradable)",
                "type": "Load Cell 2 + HX711 (DOUT 17, SCK 18)",
                "max_capacity_g": SyntheticSensorConfig.WEIGHT_MAX_CAPACITY_GRAMS,
                "units": "Grams (g) and Raw Counts"
            },
            "ultrasonic": {
                "role": "Module A (Arduino Uno): Proximity Detection",
                "type": "HC-SR04 (TRIG D4, ECHO D5)",
                "proximity_threshold_cm": SyntheticSensorConfig.PROXIMITY_THRESHOLD_CM,
                "units": "Centimetres (cm)"
            },
            "lid_servo": {
                "role": "Module A (Arduino Uno): Autonomous Lid Actuator",
                "type": "Servo Actuator D6",
                "states": ["CLOSED", "OPEN"]
            }
        },
        "compartment_c_status": "RESERVED_FUTURE_USE — No synthetic readings generated",
        "missing_value_handling": "Missing, uncalibrated, or timed-out sensors emit null (None) in JSON and NaN in CSV",
        "data_leakage_prevention": "Strict session-based partitioning; train, validation, and test sets contain disjoint sessions separated chronologically",
        "provenance_statement": "SYNTHETIC MODEL TEST — NOT REAL-WORLD VALIDATION"
    }

    metadata_path = os.path.join(output_dir, "dataset_metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[DATASET] Metadata written to {metadata_path}")
    print(f"[DATASET] Complete! Total samples: {len(all_records)} | Train: {split_counts['train']} | Val: {split_counts['val']} | Test: {split_counts['test']}")

    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic IoT sensor telemetry dataset.")
    parser.add_argument("--output-dir", default="data/synthetic", help="Output directory for datasets")
    parser.add_argument("--records", type=int, default=24000, help="Target total records (default: 24000)")
    parser.add_argument("--seed", type=int, default=42, help="Reproducible random seed (default: 42)")
    parser.add_argument("--interval", type=float, default=1.0, help="Sampling interval in seconds (default: 1.0)")
    args = parser.parse_args()

    generate_full_dataset(
        output_dir=args.output_dir,
        total_target_records=args.records,
        seed=args.seed,
        sampling_interval_s=args.interval
    )
