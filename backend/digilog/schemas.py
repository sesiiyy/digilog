from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class Config(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(default="Medium distribution center", min_length=1, max_length=80)
    seed: int = Field(default=42, ge=0, le=2147483000)
    duration: float = Field(default=480, ge=30, le=1440)
    warehouse_capacity: int = Field(default=240, ge=5, le=5000)
    workers: int = Field(default=8, ge=1, le=50)
    picking_stations: int = Field(default=2, ge=1, le=20)
    equipment: int = Field(default=2, ge=1, le=20)
    arrival_rate: float = Field(default=30, ge=1, le=180)
    processing_time: float = Field(default=6, ge=0.5, le=30)
    fleet_size: int = Field(default=4, ge=1, le=30)
    vehicle_capacity: int = Field(default=20, ge=5, le=100)
    travel_variability: float = Field(default=0.25, ge=0, le=1)
    downtime_probability: float = Field(default=0.05, ge=0, le=0.5)
    sla_minutes: float = Field(default=120, ge=15, le=1440)

PRESETS = {
    "small": Config(name="Small warehouse", workers=4, picking_stations=1, equipment=1, arrival_rate=15, warehouse_capacity=100, fleet_size=2),
    "medium": Config(),
    "high": Config(name="High-demand logistics operation", workers=12, picking_stations=3, equipment=3, arrival_rate=60, warehouse_capacity=400, fleet_size=6),
}
SCENARIOS = {
    "Normal conditions": {}, "Demand surge": {"arrival_rate": 55},
    "Reduced workforce": {"workers": 4}, "Equipment breakdown": {"equipment": 1},
    "Vehicle shortage": {"fleet_size": 1}, "Capacity constraints": {"warehouse_capacity": 30},
    "Processing efficiency": {"processing_time": 4},
    "Combined disruptions": {"workers": 4, "equipment": 1, "fleet_size": 2, "arrival_rate": 45},
}
class Control(BaseModel):
    action: Literal["start", "pause", "resume", "reset", "step", "speed", "finish"]
    speed: float = Field(default=10, ge=1, le=120)
    minutes: float = Field(default=10, ge=0.1, le=60)
class Comparison(BaseModel):
    baseline: Config
    scenario: Config
    replications: int = Field(default=5, ge=2, le=20)
class Optimization(BaseModel):
    config: Config
    target_sla: float = Field(default=0.8, ge=0, le=1)
    trials: int = Field(default=12, ge=3, le=30)
    replications: int = Field(default=3, ge=2, le=5)
class Scenario(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    config: Config
