"""
Intelligent Waste Segregation Analytics — Realistic Synthetic IoT Data Engine
Physics-grounded, temporally correlated simulation of capacitive moisture,
HX711 load cell, HC-SR04 ultrasonic proximity, and non-blocking servo lid actuation.
"""

import math
import random
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple


class SyntheticSensorConfig:
    """Hardware calibration parameters and physical limits matching Arduino Uno firmware."""

    # Moisture Sensor (Capacitive Analog A0: Lower ADC = Higher Moisture)
    MOISTURE_AIR_RAW_DEFAULT: int = 620      # Dry air (0% moisture)
    MOISTURE_WATER_RAW_DEFAULT: int = 290    # Water submerged (100% moisture)
    MOISTURE_ADC_MIN_VALID: int = 50         # Below indicates short circuit
    MOISTURE_ADC_MAX_VALID: int = 980        # Above indicates open circuit / disconnect

    # Load Cell + HX711 (Digital D2/D3)
    HX711_CALIBRATION_FACTOR: float = 420.0  # Raw counts per gram
    HX711_TARE_OFFSET: int = 100000          # Baseline raw counts at 0g
    WEIGHT_MAX_CAPACITY_GRAMS: float = 10000.0  # 10 kg maximum sanity limit
    WEIGHT_MIN_VALID_GRAMS: float = 2.0      # Tare jitter noise floor

    # HC-SR04 Ultrasonic Sensor (Digital D4/D5)
    PROXIMITY_THRESHOLD_CM: float = 20.0     # Target threshold for lid opening
    PROXIMITY_DEBOUNCE_COUNT: int = 2        # Consecutive cycles to trigger lid
    ULTRASONIC_MIN_VALID_CM: float = 2.0     # Sensor blind spot minimum
    ULTRASONIC_MAX_VALID_CM: float = 200.0   # Plausible range limit

    # Lid Servo Actuator (PWM D6)
    LID_HOLD_DURATION_S: float = 4.0         # Seconds lid stays open after approach
    LID_COOLDOWN_DURATION_S: float = 1.5     # Seconds after close before re-opening


class SyntheticTelemetryGenerator:
    """
    Generates realistic, physically grounded IoT telemetry for the waste segregation bin.
    Maintains temporal continuity across sequential ticks and simulates coherent events.
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

        # Physical state variables
        self.current_weight_g: float = 0.0
        self.current_moisture_pct: float = 12.0  # Initial dry bin moisture
        self.ambient_distance_cm: float = 72.0
        self.current_distance_cm: float = 72.0
        self.proximity_debounce_counter: int = 0
        self.lid_cmd: str = "CLOSED"
        self.lid_state_timer: float = 0.0
        self.lid_closed_time: float = -100.0  # Timestamp of last closure

        # Proximity interaction cycle state
        # 'IDLE' -> 'APPROACHING' -> 'AT_BIN' -> 'DEPARTING' -> 'COOLDOWN'
        self.interaction_state: str = "IDLE"
        self.interaction_ticks_left: int = 0
        self.pending_deposit_mass: float = 0.0
        self.pending_deposit_moisture: float = 0.0
        self.pending_deposit_category: str = "NON_BIODEGRADABLE"

        # Fault injection state
        self.injected_fault: Optional[str] = None
        self.fault_duration_ticks: int = 0
        self.stuck_moisture_raw: Optional[int] = None
        self.stuck_weight_raw: Optional[int] = None

        # Calibration drift state
        self.air_raw_drift: float = 0.0
        self.tare_drift: float = 0.0

        # Setup initial conditions based on scenario
        self._init_scenario(self.scenario)

    def _init_scenario(self, scenario: str) -> None:
        """Initialize initial state based on the chosen scenario."""
        self.scenario = scenario
        if scenario == "NORMAL_OPERATION":
            self.current_weight_g = self.rng.uniform(20.0, 150.0)
            self.current_moisture_pct = self.rng.uniform(15.0, 45.0)
        elif scenario == "WASTE_ACCUMULATION":
            self.current_weight_g = self.rng.uniform(0.0, 50.0)
            self.current_moisture_pct = self.rng.uniform(20.0, 35.0)
        elif scenario == "WET_WASTE_PROFILE":
            self.current_weight_g = self.rng.uniform(100.0, 300.0)
            self.current_moisture_pct = self.rng.uniform(65.0, 85.0)
        elif scenario == "DRY_WASTE_PROFILE":
            self.current_weight_g = self.rng.uniform(50.0, 200.0)
            self.current_moisture_pct = self.rng.uniform(8.0, 22.0)
        elif scenario == "HIGH_USAGE":
            self.current_weight_g = self.rng.uniform(50.0, 200.0)
            self.current_moisture_pct = self.rng.uniform(30.0, 60.0)
        elif scenario == "SENSOR_FAULTS":
            self.current_weight_g = self.rng.uniform(150.0, 400.0)
            self.current_moisture_pct = self.rng.uniform(35.0, 55.0)
        elif scenario == "HARDWARE_UNAVAILABLE":
            self.current_weight_g = 0.0
            self.current_moisture_pct = 0.0

    def inject_fault(self, fault_type: str, duration_ticks: int = 15) -> None:
        """Inject a specific sensor fault for a given number of ticks."""
        self.injected_fault = fault_type
        self.fault_duration_ticks = duration_ticks

    def _trigger_approach_event(self) -> None:
        """Initiate a person approaching the bin to dispose of waste."""
        self.interaction_state = "APPROACHING"
        # 3 to 6 ticks to approach the bin
        self.interaction_ticks_left = self.rng.randint(2, 5)

        # Plan the incoming waste item
        if self.scenario == "WET_WASTE_PROFILE":
            self.pending_deposit_category = "BIODEGRADABLE"
            self.pending_deposit_mass = self.rng.uniform(60.0, 320.0)
            self.pending_deposit_moisture = self.rng.uniform(65.0, 92.0)
        elif self.scenario == "DRY_WASTE_PROFILE":
            self.pending_deposit_category = "NON_BIODEGRADABLE"
            self.pending_deposit_mass = self.rng.uniform(15.0, 140.0)
            self.pending_deposit_moisture = self.rng.uniform(5.0, 22.0)
        else:
            # 50/50 mix for general scenarios
            if self.rng.random() < 0.5:
                self.pending_deposit_category = "BIODEGRADABLE"
                self.pending_deposit_mass = self.rng.uniform(40.0, 250.0)
                self.pending_deposit_moisture = self.rng.uniform(55.0, 88.0)
            else:
                self.pending_deposit_category = "NON_BIODEGRADABLE"
                self.pending_deposit_mass = self.rng.uniform(20.0, 180.0)
                self.pending_deposit_moisture = self.rng.uniform(8.0, 28.0)

    def next_record(self) -> Dict[str, Any]:
        """
        Advances simulation by sampling_interval_s and returns a telemetry record dictionary.
        """
        self.seq += 1
        self.uptime_s += int(self.sampling_interval_s)
        self.current_time += timedelta(seconds=self.sampling_interval_s)

        fault_list: List[str] = []
        is_synthetic_anomaly: bool = False
        anomaly_reasons: List[str] = []

        # Stochastic fault trigger for SENSOR_FAULTS scenario
        if self.scenario == "SENSOR_FAULTS" and not self.injected_fault:
            if self.rng.random() < 0.04:  # 4% chance per second
                fault_choice = self.rng.choice([
                    "MOISTURE_OFFLINE",
                    "HX711_TIMEOUT",
                    "ULTRASONIC_TIMEOUT",
                    "STUCK_VALUES",
                    "SUDDEN_SPIKE"
                ])
                self.inject_fault(fault_choice, duration_ticks=self.rng.randint(8, 20))

        if self.scenario == "HARDWARE_UNAVAILABLE":
            fault_list.append("HARDWARE_UNAVAILABLE")

        # --------------------------------------------------------------------
        # 2. PROXIMITY & LID DYNAMICS
        # --------------------------------------------------------------------
        # Decide whether to spawn a new visitor event if idle
        in_cooldown = (self.uptime_s - self.lid_closed_time) < self.config.LID_COOLDOWN_DURATION_S

        if self.interaction_state == "IDLE" and not in_cooldown:
            approach_prob = 0.03  # Normal default ~ once per 33s
            if self.scenario == "HIGH_USAGE":
                approach_prob = 0.12  # High usage ~ once per 8s
            elif self.scenario == "WASTE_ACCUMULATION":
                approach_prob = 0.06

            if self.rng.random() < approach_prob:
                self._trigger_approach_event()

        # Update interaction distance trajectory
        if self.interaction_state == "IDLE":
            # Ambient distance fluctuates gently around baseline 60-80cm
            noise = self.rng.gauss(0.0, 0.4)
            self.current_distance_cm = max(45.0, min(120.0, self.ambient_distance_cm + noise))
            self.interaction_ticks_left = 0

        elif self.interaction_state == "APPROACHING":
            # Distance drops from ambient towards ~12-16cm
            step = (self.current_distance_cm - 14.0) / max(1, self.interaction_ticks_left)
            self.current_distance_cm = max(10.0, self.current_distance_cm - step + self.rng.gauss(0.0, 0.5))
            self.interaction_ticks_left -= 1
            if self.interaction_ticks_left <= 0:
                self.interaction_state = "AT_BIN"
                self.interaction_ticks_left = self.rng.randint(3, 7)  # Stay 3-7s at bin

        elif self.interaction_state == "AT_BIN":
            # Person stands in front of bin, depositing waste
            self.current_distance_cm = self.rng.uniform(10.0, 16.5)
            self.interaction_ticks_left -= 1

            # While at bin with open lid, apply the deposit mass & moisture change
            if self.lid_cmd == "OPEN" and self.pending_deposit_mass > 0:
                fraction = 0.5 if self.interaction_ticks_left > 1 else 1.0
                deposited_now = self.pending_deposit_mass * fraction
                self.pending_deposit_mass -= deposited_now
                self.current_weight_g += deposited_now

                # Blend moisture: wet waste raises moisture, dry lowers moisture
                alpha = min(0.6, deposited_now / max(10.0, self.current_weight_g))
                self.current_moisture_pct = (
                    (1.0 - alpha) * self.current_moisture_pct + alpha * self.pending_deposit_moisture
                )

            if self.interaction_ticks_left <= 0:
                self.interaction_state = "DEPARTING"
                self.interaction_ticks_left = self.rng.randint(2, 4)

        elif self.interaction_state == "DEPARTING":
            # Distance increases back to ambient
            step = (self.ambient_distance_cm - self.current_distance_cm) / max(1, self.interaction_ticks_left)
            self.current_distance_cm = min(120.0, self.current_distance_cm + step + self.rng.gauss(0.0, 0.5))
            self.interaction_ticks_left -= 1
            if self.interaction_ticks_left <= 0:
                self.interaction_state = "IDLE"

        # Occasional bin emptying in WASTE_ACCUMULATION when heavy
        if self.scenario == "WASTE_ACCUMULATION" and self.current_weight_g > 3500.0:
            if self.rng.random() < 0.02:  # 2% chance when full
                self.current_weight_g = self.rng.uniform(0.0, 8.0)
                self.current_moisture_pct = 15.0

        # Proximity evaluation with firmware debounce logic (2 consecutive cycles <= 20.0 cm)
        raw_prox_detected = (self.current_distance_cm <= self.config.PROXIMITY_THRESHOLD_CM)

        if raw_prox_detected:
            self.proximity_debounce_counter += 1
        else:
            self.proximity_debounce_counter = 0

        debounced_prox = (self.proximity_debounce_counter >= self.config.PROXIMITY_DEBOUNCE_COUNT)

        # Firmware Lid State Machine
        if self.lid_cmd == "CLOSED":
            if debounced_prox and not in_cooldown:
                self.lid_cmd = "OPEN"
                self.lid_state_timer = self.config.LID_HOLD_DURATION_S
        elif self.lid_cmd == "OPEN":
            if debounced_prox:
                # Reset hold duration as long as person remains in front
                self.lid_state_timer = self.config.LID_HOLD_DURATION_S
            else:
                self.lid_state_timer -= self.sampling_interval_s
                if self.lid_state_timer <= 0:
                    self.lid_cmd = "CLOSED"
                    self.lid_closed_time = self.uptime_s

        # --------------------------------------------------------------------
        # 3. ULTRASONIC SENSOR OUTPUT
        # --------------------------------------------------------------------
        dist_cm: Optional[float] = round(self.current_distance_cm, 1)

        if self.injected_fault == "ULTRASONIC_TIMEOUT":
            dist_cm = None
            debounced_prox = False
            fault_list.append("ULTRASONIC_TIMEOUT")
            is_synthetic_anomaly = True
            anomaly_reasons.append("Ultrasonic sensor timeout: echo missing or out of range")
        elif dist_cm is not None and (dist_cm < self.config.ULTRASONIC_MIN_VALID_CM or dist_cm > self.config.ULTRASONIC_MAX_VALID_CM):
            dist_cm = None
            debounced_prox = False
            fault_list.append("ULTRASONIC_TIMEOUT")

        # --------------------------------------------------------------------
        # 4. LOAD CELL & HX711 SENSING
        # --------------------------------------------------------------------
        # Mass changes slowly with sensor jitter; clamps >= 0.0g
        weight_noise = self.rng.gauss(0.0, 0.4)
        measured_weight_g = max(0.0, min(self.config.WEIGHT_MAX_CAPACITY_GRAMS, self.current_weight_g + weight_noise))

        # Raw counts: tare offset + weight * factor
        # Tare drift simulates gradual temperature effects
        self.tare_drift += self.rng.gauss(0.0, 0.2)
        weight_raw = int(self.config.HX711_TARE_OFFSET + self.tare_drift + (measured_weight_g * self.config.HX711_CALIBRATION_FACTOR))

        weight_g: Optional[float] = round(measured_weight_g, 1)
        weight_ok: bool = True

        if self.injected_fault == "HX711_TIMEOUT":
            weight_g = None
            weight_raw = 0
            weight_ok = False
            fault_list.append("HX711_TIMEOUT")
            is_synthetic_anomaly = True
            anomaly_reasons.append("HX711 load cell timeout: no serial data received from ADC")
        elif self.injected_fault == "STUCK_VALUES":
            if self.stuck_weight_raw is None:
                self.stuck_weight_raw = weight_raw
            weight_raw = self.stuck_weight_raw
            weight_g = round((weight_raw - self.config.HX711_TARE_OFFSET) / self.config.HX711_CALIBRATION_FACTOR, 1)
            is_synthetic_anomaly = True
            anomaly_reasons.append("Stuck load cell reading: identical raw count output over extended window")
        elif self.injected_fault == "SUDDEN_SPIKE":
            # Unphysical instantaneous jump without lid opening
            weight_raw += 850000
            weight_g = round((weight_raw - self.config.HX711_TARE_OFFSET) / self.config.HX711_CALIBRATION_FACTOR, 1)
            is_synthetic_anomaly = True
            anomaly_reasons.append("Physical discontinuity: abnormal mass jump detected without proximity event")

        # --------------------------------------------------------------------
        # 5. CAPACITIVE MOISTURE SENSING
        # --------------------------------------------------------------------
        # Natural moisture fluctuations (evaporation or mixing)
        moist_noise = self.rng.gauss(0.0, 0.3)
        effective_moist_pct = max(0.0, min(100.0, self.current_moisture_pct + moist_noise))

        # Capacitive Calibration formula from config.h:
        # pct = ((airRaw - raw) / (airRaw - waterRaw)) * 100
        # => raw = airRaw - (pct / 100.0) * (airRaw - waterRaw)
        self.air_raw_drift += self.rng.gauss(0.0, 0.05)
        calibrated_air_raw = self.config.MOISTURE_AIR_RAW_DEFAULT + self.air_raw_drift
        calibrated_water_raw = self.config.MOISTURE_WATER_RAW_DEFAULT

        span = calibrated_air_raw - calibrated_water_raw
        raw_adc = calibrated_air_raw - (effective_moist_pct / 100.0) * span + self.rng.gauss(0.0, 2.5)
        moist_raw = int(max(0, min(1023, round(raw_adc))))

        moist_pct: Optional[float] = round(effective_moist_pct, 1)
        moist_ok: bool = True

        if self.injected_fault == "MOISTURE_OFFLINE":
            # Disconnected sensor floats high (ADC > 980) or shorts to GND (ADC < 50)
            moist_raw = 1023
            moist_pct = None
            moist_ok = False
            fault_list.append("MOISTURE_OFFLINE")
            is_synthetic_anomaly = True
            anomaly_reasons.append("Moisture sensor disconnected: analog reading on A0 > 980 ADC")
        elif moist_raw < self.config.MOISTURE_ADC_MIN_VALID or moist_raw > self.config.MOISTURE_ADC_MAX_VALID:
            moist_pct = None
            moist_ok = False
            fault_list.append("MOISTURE_OFFLINE")
            is_synthetic_anomaly = True
            anomaly_reasons.append("Moisture ADC reading out of valid hardware bounds (50–980)")

        # Target category heuristic based on true physical condition
        # (Explicitly labelled as synthetic heuristic)
        if weight_g is not None and weight_g >= 10.0 and moist_pct is not None:
            if moist_pct >= 50.0:
                synthetic_category = "BIODEGRADABLE"
            elif moist_pct <= 20.0:
                synthetic_category = "NON_BIODEGRADABLE"
            else:
                synthetic_category = "UNCLASSIFIED"
        else:
            synthetic_category = "EMPTY"

        # Build telemetry packet complying strictly with the protocol
        record: Dict[str, Any] = {
            "v": 1,
            "dev": "SIM-WS01",
            "seq": self.seq,
            "up": self.uptime_s,
            "moist_raw": moist_raw,
            "moist_pct": moist_pct,
            "moist_ok": moist_ok,
            "moist_cal": True,
            "weight_g": weight_g,
            "weight_raw": weight_raw,
            "weight_ok": weight_ok,
            "weight_cal": True,
            "dist_cm": dist_cm,
            "prox": debounced_prox,
            "lid_cmd": self.lid_cmd,
            "faults": fault_list,
            # Provenance metadata
            "source": "simulation",
            "scenario": self.scenario,
            "sim_session_id": self.session_id,
            "timestamp": self.current_time.isoformat(),
            # Synthetic ML ground truth labels for pipeline training & validation
            "target_anomaly": is_synthetic_anomaly or len(fault_list) > 0,
            "anomaly_reasons": anomaly_reasons,
            "synthetic_category": synthetic_category,
        }

        # Fault duration lifecycle management
        if self.fault_duration_ticks > 0:
            self.fault_duration_ticks -= 1
            if self.fault_duration_ticks <= 0:
                self.injected_fault = None
                self.stuck_moisture_raw = None
                self.stuck_weight_raw = None

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
    Generates a contiguous sequence of telemetry records for a single session.
    Computes look-ahead targets (future weights at +5m, +15m, +30m) without leaking
    information to earlier records.
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

    # Calculate future weight horizons:
    # 5 min (300s), 15 min (900s), 30 min (1800s)
    h5_steps = int(300 / sampling_interval_s)
    h15_steps = int(900 / sampling_interval_s)
    h30_steps = int(1800 / sampling_interval_s)

    for i in range(len(records)):
        # Horizon +5 minutes
        if i + h5_steps < len(records):
            records[i]["target_weight_5m"] = records[i + h5_steps]["weight_g"]
        else:
            records[i]["target_weight_5m"] = records[-1]["weight_g"]

        # Horizon +15 minutes
        if i + h15_steps < len(records):
            records[i]["target_weight_15m"] = records[i + h15_steps]["weight_g"]
        else:
            records[i]["target_weight_15m"] = records[-1]["weight_g"]

        # Horizon +30 minutes
        if i + h30_steps < len(records):
            records[i]["target_weight_30m"] = records[i + h30_steps]["weight_g"]
        else:
            records[i]["target_weight_30m"] = records[-1]["weight_g"]

    return records
