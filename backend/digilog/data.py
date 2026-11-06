"""Entirely fictional input data. Units: minutes, km, item units, USD."""
import random

def synthetic_data(config):
    rng = random.Random(config.seed)
    return {
        "synthetic": True,
        "products": [{"id": f"SKU-{i:03}", "name": f"Fictional product {i}", "zone": f"Z-{i % 3 + 1}"} for i in range(1, 13)],
        "zones": [{"id": f"Z-{i}", "label": f"Storage zone {i}", "locations": [f"Z{i}-R{j}" for j in range(1, 9)]} for i in range(1, 4)],
        "employees": [{"id": f"W-{i}", "role": "Cross-trained operator"} for i in range(1, config.workers + 1)],
        "equipment": [{"id": f"MHE-{i}", "type": "Picking trolley"} for i in range(1, config.equipment + 1)],
        "vehicles": [{"id": f"V-{i}", "capacity": config.vehicle_capacity} for i in range(1, config.fleet_size + 1)],
        "destinations": [{"id": f"D-{i}", "x": round(rng.uniform(-20, 20), 2), "y": round(rng.uniform(-20, 20), 2)} for i in range(1, 13)],
        "cost_rates": {"worker_per_hour": 12, "station_per_hour": 3, "equipment_per_hour": 4, "vehicle_per_hour": 9, "per_km": 0.6},
    }
