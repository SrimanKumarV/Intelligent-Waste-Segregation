"""
Intelligent Waste Segregation Analytics — Realistic Multi-Channel Synthetic IoT Data Engine
Physics-grounded, temporally correlated simulation of:
  - Module A (Arduino Uno): HC-SR04 ultrasonic proximity and autonomous servo lid actuation
  - Module B (ESP32): Capacitive Moisture C1 & C2, HX711 Load Cell 1 & 2
  - Dual Microcontroller health and communications
"""

import math
import random
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple


class SyntheticSensorConfig:
    """Hardware calibration parameters and physical limits matching dual-MCU firmware."""

    # Module B: ESP32 12-Bit ADC (0 to 4095, 3.3V Logic)
    # Lower raw ADC = Higher moisture
    MOISTURE_AIR_RAW_DEFAULT: int = 3200      # Dry air (0% moisture)
    MOISTURE_WATER_RAW_DEFAULT: int = 1400    # Water submerged (100% moisture)
    MOISTURE_ADC_MIN_VALID: int = 200         # Below indicates short circuit to GND
    MOISTURE_ADC_MAX_VALID: int = 3950        # Above indicates open circuit / disconnect

    # Load Cell 1 & 2 + HX711
    HX711_CALIBRATION_FACTOR: float = 420.0   # Raw counts per gram
    HX711_TARE_OFFSET: int = 100000           # Baseline raw counts at 0g
    WEIGHT_MAX_CAPACITY_GRAMS: float = 10000.0# 10 kg maximum sanity limit
    WEIGHT_MIN_VALID_GRAMS: float = 2.0       # Tare jitter noise floor

    # Module A: Arduino Uno HC-SR04 Ultrasonic Sensor (Digital D4/D5)
    PROXIMITY_THRESHOLD_CM: float = 20.0      # Target threshold for lid opening
    PROXIMITY_DEBOUNCE_COUNT: int = 2         # Consecutive cycles to trigger lid
    ULTRASONIC_MIN_VALID_CM: float = 2.0      # Sensor blind spot minimum
    ULTRASONIC_MAX_VALID_CM: float = 200.0    # Plausible range limit

    # Lid Servo Actuator (PWM D6)
    LID_HOLD_DURATION_S: float = 4.0          # Seconds lid stays open after approach
    LID_COOLDOWN_DURATION_S: float = 1.5      # Seconds after close before re-opening


class SyntheticTelemetryGenerator:
    """
    Generates realistic, physically grounded IoT telemetry for the 4-channel waste segregation system.
    Simulates independent Module A (Uno) and Module B (ESP32) device streams.
    """

    def __init__(
        self,
        session_id: Optional[str] = None,
        scenario: str = "NORMAL_OPERATION",
        sampling_interval_s: float = 1.0,
        start_time: Optional[datetime] = None,
        seed: Optional[int] = None,
        config: Optional[SyntheticSensorConfig] = None,
    ):
        self.config = config or SyntheticSensorConfig()
        self.scenario = scenario
        self.sampling_interval_s = max(0.1, sampling_interval_s)
        self.seed = seed
        self.rng = random.Random(seed)

        self.session_id = session_id or f"SIM-{int((start_time or datetime.now(timezone.utc)).timestamp())}"
        self.current_time = start_time or datetime.now(timezone.utc)
        self.seq = 0
        self.uptime_s = 0

        # Physical states for Compartment A (Biodegradable: C1 + LC1)
        self.lc1_weight_g: float = 50.0
        self.c1_moisture_pct: float = 65.0   # Wet organic profile

        # Physical states for Compartment B (Non-Biodegradable: C2 + LC2)
        self.lc2_weight_g: float = 40.0
        self.c2_moisture_pct: float = 14.0   # Dry packaging/inorganic profile

        # Module A (Arduino Uno): Proximity & Lid
        self.ambient_distance_cm: float = 72.0
        self.current_distance_cm: float = 72.0
        self.proximity_debounce_counter: int = 0
        self.lid_cmd: str = "CLOSED"
        self.lid_state_timer: float = 0.0
        self.lid_closed_time: float = -100.0

        # Human interaction cycle
        self.interaction_state: str = "IDLE"
        self.interaction_ticks_left: int = 0
        self.pending_deposit_target: str = "LC1" # LC1 or LC2
        self.pending_deposit_mass: float = 0.0
        self.pending_deposit_moist: float = 0.0

        # Fault injection state
        self.injected_fault: Optional[str] = None
        self.fault_duration_ticks: int = 0
        self.stuck_c1_raw: Optional[int] = None
        self.stuck_lc1_raw: Optional[int] = None

        self._init_scenario(self.scenario)

    def _init_scenario(self, scenario: str) -> None:
        self.scenario = scenario
        if scenario == "NORMAL_OPERATION":
            self.lc1_weight_g = self.rng.uniform(30.0, 150.0)
            self.c1_moisture_pct = self.rng.uniform(55.0, 75.0)
            self.lc2_weight_g = self.rng.uniform(20.0, 120.0)
            self.c2_moisture_pct = self.rng.uniform(10.0, 22.0)
        elif scenario == "BIN1_ACCUMULATION":
            self.lc1_weight_g = self.rng.uniform(10.0, 40.0)
            self.c1_moisture_pct = self.rng.uniform(60.0, 80.0)
            self.lc2_weight_g = self.rng.uniform(10.0, 50.0)
            self.c2_moisture_pct = self.rng.uniform(10.0, 18.0)
        elif scenario == "BIN2_ACCUMULATION":
            self.lc1_weight_g = self.rng.uniform(20.0, 60.0)
            self.c1_moisture_pct = self.rng.uniform(50.0, 70.0)
            self.lc2_weight_g = self.rng.uniform(10.0, 30.0)
            self.c2_moisture_pct = self.rng.uniform(8.0, 16.0)
        elif scenario == "UNO_DISCONNECTED":
            self.lc1_weight_g = self.rng.uniform(100.0, 300.0)
            self.c1_moisture_pct = self.rng.uniform(60.0, 75.0)
            self.lc2_weight_g = self.rng.uniform(80.0, 200.0)
            self.c2_moisture_pct = self.rng.uniform(12.0, 20.0)
        elif scenario == "ESP32_DISCONNECTED":
            self.lc1_weight_g = 0.0
            self.c1_moisture_pct = 0.0
            self.lc2_weight_g = 0.0
            self.c2_moisture_pct = 0.0
        elif scenario == "SENSOR_FAULTS":
            self.lc1_weight_g = self.rng.uniform(150.0, 400.0)
            self.c1_moisture_pct = self.rng.uniform(40.0, 60.0)
            self.lc2_weight_g = self.rng.uniform(100.0, 250.0)
            self.c2_moisture_pct = self.rng.uniform(15.0, 30.0)

    def inject_fault(self, fault_type: str, duration_ticks: int = 15) -> None:
        self.injected_fault = fault_type
        self.fault_duration_ticks = duration_ticks

    def _trigger_approach_event(self) -> None:
        self.interaction_state = "APPROACHING"
        self.interaction_ticks_left = self.rng.randint(2, 4)

        # Decide whether visitor disposes into Compartment A or B
        if self.scenario == "BIN1_ACCUMULATION":
            self.pending_deposit_target = "LC1"
            self.pending_deposit_mass = self.rng.uniform(80.0, 280.0)
            self.pending_deposit_moist = self.rng.uniform(65.0, 90.0)
        elif self.scenario == "BIN2_ACCUMULATION":
            self.pending_deposit_target = "LC2"
            self.pending_deposit_mass = self.rng.uniform(25.0, 160.0)
            self.pending_deposit_moist = self.rng.uniform(5.0, 20.0)
        else:
            if self.rng.random() < 0.55:
                self.pending_deposit_target = "LC1"
                self.pending_deposit_mass = self.rng.uniform(50.0, 220.0)
                self.pending_deposit_moist = self.rng.uniform(60.0, 85.0)
            else:
                self.pending_deposit_target = "LC2"
                self.pending_deposit_mass = self.rng.uniform(20.0, 130.0)
                self.pending_deposit_moist = self.rng.uniform(8.0, 22.0)

    def next_record(self) -> Dict[str, Any]:
        self.seq += 1
        self.uptime_s += int(self.sampling_interval_s)
        self.current_time += timedelta(seconds=self.sampling_interval_s)

        fault_list: List[str] = []
        is_synthetic_anomaly = False
        anomaly_reasons: List[str] = []

        # --------------------------------------------------------------------
        # 1. ULTRASONIC & LID STATE MACHINE (MODULE A: ARDUINO UNO)
        # --------------------------------------------------------------------
        uno_connected = True
        if self.scenario == "UNO_DISCONNECTED" or self.injected_fault == "UNO_OFFLINE":
            uno_connected = False
            fault_list.append("UNO_OFFLINE")
            is_synthetic_anomaly = True
            anomaly_reasons.append("Arduino Uno (Module A) communication lost")

        # Proximity interaction progression
        if self.interaction_state == "IDLE":
            prob_approach = 0.08
            if self.scenario in ("BIN1_ACCUMULATION", "BIN2_ACCUMULATION"):
                prob_approach = 0.16
            if self.rng.random() < prob_approach and (self.uptime_s - self.lid_closed_time) > self.config.LID_COOLDOWN_DURATION_S:
                self._trigger_approach_event()
            else:
                self.current_distance_cm = self.ambient_distance_cm + self.rng.gauss(0.0, 1.2)

        elif self.interaction_state == "APPROACHING":
            self.interaction_ticks_left -= 1
            progress = 1.0 - (self.interaction_ticks_left / 4.0)
            self.current_distance_cm = 72.0 - progress * (72.0 - self.rng.uniform(8.0, 16.0))
            if self.interaction_ticks_left <= 0:
                self.interaction_state = "AT_BIN"
                self.interaction_ticks_left = self.rng.randint(3, 6)

        elif self.interaction_state == "AT_BIN":
            self.interaction_ticks_left -= 1
            self.current_distance_cm = self.rng.uniform(6.0, 15.0)

            # Apply deposit halfway through visit
            if self.interaction_ticks_left == 2:
                if self.pending_deposit_target == "LC1":
                    self.lc1_weight_g += self.pending_deposit_mass
                    self.c1_moisture_pct = 0.7 * self.c1_moisture_pct + 0.3 * self.pending_deposit_moist
                else:
                    self.lc2_weight_g += self.pending_deposit_mass
                    self.c2_moisture_pct = 0.8 * self.c2_moisture_pct + 0.2 * self.pending_deposit_moist

            if self.interaction_ticks_left <= 0:
                self.interaction_state = "DEPARTING"
                self.interaction_ticks_left = self.rng.randint(2, 3)

        elif self.interaction_state == "DEPARTING":
            self.interaction_ticks_left -= 1
            self.current_distance_cm = self.rng.uniform(28.0, 65.0)
            if self.interaction_ticks_left <= 0:
                self.interaction_state = "IDLE"
                self.current_distance_cm = self.ambient_distance_cm

        # Debounce proximity detection
        measured_dist = max(2.0, min(200.0, self.current_distance_cm))
        is_in_proximity = (measured_dist <= self.config.PROXIMITY_THRESHOLD_CM)
        if is_in_proximity:
            self.proximity_debounce_counter = min(5, self.proximity_debounce_counter + 1)
        else:
            self.proximity_debounce_counter = 0

        debounced_prox = (self.proximity_debounce_counter >= self.config.PROXIMITY_DEBOUNCE_COUNT)

        # Autonomous Lid State Machine
        if self.lid_cmd == "CLOSED":
            if debounced_prox and (self.uptime_s - self.lid_closed_time) >= self.config.LID_COOLDOWN_DURATION_S:
                self.lid_cmd = "OPEN"
                self.lid_state_timer = self.uptime_s
        elif self.lid_cmd == "OPEN":
            if debounced_prox:
                self.lid_state_timer = self.uptime_s  # Keep holding open
            elif (self.uptime_s - self.lid_state_timer) >= self.config.LID_HOLD_DURATION_S:
                self.lid_cmd = "CLOSED"
                self.lid_closed_time = self.uptime_s

        dist_cm: Optional[float] = round(measured_dist, 1) if uno_connected else None

        # --------------------------------------------------------------------
        # 2. MODULE B (ESP32): 4 INDEPENDENT SENSOR CHANNELS
        # --------------------------------------------------------------------
        esp32_connected = True
        if self.scenario == "ESP32_DISCONNECTED" or self.injected_fault == "ESP32_OFFLINE":
            esp32_connected = False
            fault_list.append("ESP32_OFFLINE")
            is_synthetic_anomaly = True
            anomaly_reasons.append("ESP32 Hub (Module B) communication lost")

        # --- Channel C1 (Compartment A: Biodegradable Moisture) ---
        c1_pct: Optional[float] = None
        c1_raw: Optional[int] = None
        c1_ok = False
        c1_cal = True

        if esp32_connected:
            noise_c1 = self.rng.gauss(0.0, 0.4)
            c1_pct_val = max(0.0, min(100.0, self.c1_moisture_pct + noise_c1))
            span_c1 = self.config.MOISTURE_AIR_RAW_DEFAULT - self.config.MOISTURE_WATER_RAW_DEFAULT
            c1_raw_calc = self.config.MOISTURE_AIR_RAW_DEFAULT - (c1_pct_val / 100.0) * span_c1 + self.rng.gauss(0.0, 3.0)
            c1_raw = int(max(0, min(4095, round(c1_raw_calc))))

            if self.injected_fault == "C1_OFFLINE":
                c1_raw = 4095
                c1_pct = None
                c1_ok = False
                fault_list.append("C1_MOISTURE_OFFLINE")
                is_synthetic_anomaly = True
                anomaly_reasons.append("Capacitive Sensor C1 disconnected (>3950 ADC)")
            else:
                c1_ok = (c1_raw >= self.config.MOISTURE_ADC_MIN_VALID and c1_raw <= self.config.MOISTURE_ADC_MAX_VALID)
                c1_pct = round(c1_pct_val, 1) if c1_ok else None

        # --- Channel C2 (Compartment B: Non-Biodegradable Moisture) ---
        c2_pct: Optional[float] = None
        c2_raw: Optional[int] = None
        c2_ok = False
        c2_cal = True

        if esp32_connected:
            noise_c2 = self.rng.gauss(0.0, 0.3)
            c2_pct_val = max(0.0, min(100.0, self.c2_moisture_pct + noise_c2))
            span_c2 = self.config.MOISTURE_AIR_RAW_DEFAULT - self.config.MOISTURE_WATER_RAW_DEFAULT
            c2_raw_calc = self.config.MOISTURE_AIR_RAW_DEFAULT - (c2_pct_val / 100.0) * span_c2 + self.rng.gauss(0.0, 3.0)
            c2_raw = int(max(0, min(4095, round(c2_raw_calc))))

            if self.injected_fault == "C2_OFFLINE":
                c2_raw = 4095
                c2_pct = None
                c2_ok = False
                fault_list.append("C2_MOISTURE_OFFLINE")
                is_synthetic_anomaly = True
                anomaly_reasons.append("Capacitive Sensor C2 disconnected (>3950 ADC)")
            else:
                c2_ok = (c2_raw >= self.config.MOISTURE_ADC_MIN_VALID and c2_raw <= self.config.MOISTURE_ADC_MAX_VALID)
                c2_pct = round(c2_pct_val, 1) if c2_ok else None

        # --- Channel LC1 (Compartment A: Biodegradable Mass) ---
        lc1_g: Optional[float] = None
        lc1_raw: Optional[int] = None
        lc1_ok = False
        lc1_cal = True

        if esp32_connected:
            lc1_val = max(0.0, min(self.config.WEIGHT_MAX_CAPACITY_GRAMS, self.lc1_weight_g + self.rng.gauss(0.0, 0.4)))
            lc1_raw = int(self.config.HX711_TARE_OFFSET + lc1_val * self.config.HX711_CALIBRATION_FACTOR + self.rng.gauss(0.0, 8.0))

            if self.injected_fault == "LC1_TIMEOUT":
                lc1_g = None
                lc1_raw = 0
                lc1_ok = False
                fault_list.append("LC1_HX711_TIMEOUT")
                is_synthetic_anomaly = True
                anomaly_reasons.append("Load Cell 1 timeout: HX711 not responding")
            elif self.injected_fault == "LC1_SPIKE":
                lc1_raw += 900000
                lc1_g = round((lc1_raw - self.config.HX711_TARE_OFFSET) / self.config.HX711_CALIBRATION_FACTOR, 1)
                lc1_ok = True
                is_synthetic_anomaly = True
                anomaly_reasons.append("Load Cell 1 abnormal mass jump")
            else:
                lc1_ok = True
                lc1_g = round(lc1_val, 1)

        # --- Channel LC2 (Compartment B: Non-Biodegradable Mass) ---
        lc2_g: Optional[float] = None
        lc2_raw: Optional[int] = None
        lc2_ok = False
        lc2_cal = True

        if esp32_connected:
            lc2_val = max(0.0, min(self.config.WEIGHT_MAX_CAPACITY_GRAMS, self.lc2_weight_g + self.rng.gauss(0.0, 0.4)))
            lc2_raw = int(self.config.HX711_TARE_OFFSET + lc2_val * self.config.HX711_CALIBRATION_FACTOR + self.rng.gauss(0.0, 8.0))

            if self.injected_fault == "LC2_TIMEOUT":
                lc2_g = None
                lc2_raw = 0
                lc2_ok = False
                fault_list.append("LC2_HX711_TIMEOUT")
                is_synthetic_anomaly = True
                anomaly_reasons.append("Load Cell 2 timeout: HX711 not responding")
            else:
                lc2_ok = True
                lc2_g = round(lc2_val, 1)

        # Calibration fault simulation
        if self.injected_fault == "CALIBRATION_REQUIRED":
            c1_cal = False
            lc1_cal = False
            fault_list.append("CALIBRATION_REQUIRED")
            is_synthetic_anomaly = True
            anomaly_reasons.append("Sensor channels require dual-point calibration")

        # Target classification heuristic (Strict 2-Class Model: Biodegradable vs Non-Biodegradable)
        synthetic_category = "UNCLASSIFIED"
        if lc1_g is not None and lc2_g is not None:
            if self.pending_deposit_target == "LC1" and self.interaction_state in ("AT_BIN", "DEPARTING"):
                synthetic_category = "BIODEGRADABLE"
            elif self.pending_deposit_target == "LC2" and self.interaction_state in ("AT_BIN", "DEPARTING"):
                synthetic_category = "NON_BIODEGRADABLE"
            elif lc1_g > lc2_g and (c1_pct or 0) > 40:
                synthetic_category = "BIODEGRADABLE"
            elif lc2_g >= lc1_g and (c2_pct or 0) < 30:
                synthetic_category = "NON_BIODEGRADABLE"

        # Telemetry record with 4 channels and backward compatibility
        record: Dict[str, Any] = {
            "v": 1,
            "dev": "SIM-WS01",
            "seq": self.seq,
            "up": self.uptime_s,
            "uno_connected": uno_connected,
            "esp32_connected": esp32_connected,

            # Module A: Uno
            "dist_cm": dist_cm,
            "prox": debounced_prox if uno_connected else False,
            "lid_cmd": self.lid_cmd if uno_connected else "CLOSED",

            # Module B: ESP32 4 Channels
            "c1_raw": c1_raw,
            "c1_pct": c1_pct,
            "c1_ok": c1_ok,
            "c1_cal": c1_cal,

            "c2_raw": c2_raw,
            "c2_pct": c2_pct,
            "c2_ok": c2_ok,
            "c2_cal": c2_cal,

            "lc1_g": lc1_g,
            "lc1_raw": lc1_raw,
            "lc1_ok": lc1_ok,
            "lc1_cal": lc1_cal,

            "lc2_g": lc2_g,
            "lc2_raw": lc2_raw,
            "lc2_ok": lc2_ok,
            "lc2_cal": lc2_cal,

            # Backward compatibility aliases
            "moist_raw": c1_raw,
            "moist_pct": c1_pct,
            "moist_ok": c1_ok,
            "moist_cal": c1_cal,
            "weight_g": lc1_g,
            "weight_raw": lc1_raw,
            "weight_ok": lc1_ok,
            "weight_cal": lc1_cal,

            "faults": fault_list,
            "source": "simulation",
            "scenario": self.scenario,
            "sim_session_id": self.session_id,
            "timestamp": self.current_time.isoformat(),

            # Synthetic ML Ground Truth Labels
            "target_anomaly": is_synthetic_anomaly or len(fault_list) > 0,
            "anomaly_reasons": anomaly_reasons,
            "synthetic_category": synthetic_category,
        }

        # Fault duration management
        if self.fault_duration_ticks > 0:
            self.fault_duration_ticks -= 1
            if self.fault_duration_ticks <= 0:
                self.injected_fault = None

        return record


def generate_session_dataset(
    session_id: str,
    scenario: str,
    num_samples: int,
    sampling_interval_s: float = 1.0,
    start_time: Optional[datetime] = None,
    seed: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Generates a contiguous sequence of multi-channel telemetry records for a single session.
    Computes look-ahead target weights for LC1 and LC2 independently without leaking future state.
    """
    generator = SyntheticTelemetryGenerator(
        session_id=session_id,
        scenario=scenario,
        sampling_interval_s=sampling_interval_s,
        start_time=start_time,
        seed=seed,
    )

    records: List[Dict[str, Any]] = []
    for _ in range(num_samples):
        records.append(generator.next_record())

    h5_steps = int(300 / sampling_interval_s)
    h15_steps = int(900 / sampling_interval_s)
    h30_steps = int(1800 / sampling_interval_s)

    for i in range(len(records)):
        # LC1 Horizons
        records[i]["target_lc1_5m"] = records[min(i + h5_steps, len(records) - 1)]["lc1_g"]
        records[i]["target_lc1_15m"] = records[min(i + h15_steps, len(records) - 1)]["lc1_g"]
        records[i]["target_lc1_30m"] = records[min(i + h30_steps, len(records) - 1)]["lc1_g"]

        # LC2 Horizons
        records[i]["target_lc2_5m"] = records[min(i + h5_steps, len(records) - 1)]["lc2_g"]
        records[i]["target_lc2_15m"] = records[min(i + h15_steps, len(records) - 1)]["lc2_g"]
        records[i]["target_lc2_30m"] = records[min(i + h30_steps, len(records) - 1)]["lc2_g"]

        # Backwards compatibility target weights (mapped to LC1)
        records[i]["target_weight_5m"] = records[i]["target_lc1_5m"]
        records[i]["target_weight_15m"] = records[i]["target_lc1_15m"]
        records[i]["target_weight_30m"] = records[i]["target_lc1_30m"]

    return records
