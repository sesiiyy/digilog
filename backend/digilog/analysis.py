import itertools
import random
import numpy as np
from .engine import simulate
from .schemas import Config

METRICS = ["throughput", "processing_time", "queue_length", "sla", "cost", "waiting_time", "fleet_utilization"]
def interval(values):
    clean = [v for v in values if v is not None]
    if not clean:
        return {"mean": None, "low": None, "high": None, "n": 0}
    # Conservative small-sample Student-t critical values (two-sided 95%).
    critical = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262}.get(len(clean)-1, 2.262)
    mean = float(np.mean(clean))
    half = critical * float(np.std(clean, ddof=1)) / np.sqrt(len(clean)) if len(clean) > 1 else 0
    return {"mean": mean, "low": float(mean-half), "high": float(mean+half), "n": len(clean)}

def compare(request):
    # Enforce identical horizon and paired seeds, irrespective of the scenario's seed field.
    baseline, scenario = [], []
    for i in range(request.replications):
        seed = request.baseline.seed + i
        baseline.append(simulate(request.baseline.model_copy(update={"seed": seed})))
        scenario.append(simulate(request.scenario.model_copy(update={"seed": seed, "duration": request.baseline.duration})))
    return {"synthetic": True, "replications": request.replications, "seeds": [request.baseline.seed+i for i in range(request.replications)],
            "duration": request.baseline.duration, "baseline_config": request.baseline.model_dump(),
            "scenario_config": request.scenario.model_copy(update={"duration": request.baseline.duration, "seed": request.baseline.seed}).model_dump(),
            "demand_changed": request.baseline.arrival_rate != request.scenario.arrival_rate,
            "metrics": {key: {"baseline": interval([m[key] for m in baseline]), "scenario": interval([m[key] for m in scenario]),
                        "difference": interval([s[key]-b[key] for b,s in zip(baseline, scenario) if b[key] is not None and s[key] is not None])} for key in METRICS},
            "resource_utilization": {key: {"baseline": interval([m["utilization"][key] for m in baseline]), "scenario": interval([m["utilization"][key] for m in scenario])} for key in baseline[0]["utilization"]},
            "bottlenecks": {"baseline": [m["bottleneck"] for m in baseline], "scenario": [m["bottleneck"] for m in scenario]}}

def recommendations(metrics, config):
    out = []
    def add(title, reason, change):
        out.append({"title": title, "evidence": reason, "suggested_changes": change, "method": "Transparent rule; validate with paired simulations"})
    for stage, queue in metrics["queues"].items():
        if queue < 3:
            continue
        if stage == "picking":
            add("Expand picking capacity", f"{queue} orders are waiting at picking; station utilization is {metrics['utilization']['picking']:.0%}.", {"picking_stations": min(20, config.picking_stations+1), "equipment": min(20, config.equipment+1)})
        elif stage in ("dispatch", "delivery"):
            add("Test another vehicle", f"{queue} orders are queued for dispatch; fleet utilization is {metrics['fleet_utilization']:.0%}.", {"fleet_size": min(30, config.fleet_size+1)})
        elif stage == "receiving" and metrics["warehouse_utilization"] > .85:
            add("Relieve storage pressure", f"Storage reservations occupy {metrics['warehouse_utilization']:.0%} of capacity.", {"warehouse_capacity": min(5000, config.warehouse_capacity+100)})
    if metrics["utilization"]["workers"] > .8:
        add("Test more cross-trained workers", f"Worker utilization is {metrics['utilization']['workers']:.0%}.", {"workers": min(50, config.workers+2)})
    if not out:
        add("Collect a longer observation window", "No rule threshold was crossed. Compare a full shift before changing capacity.", {})
    return out

def optimize(request):
    c = request.config
    values = list(itertools.product(sorted({max(1,c.workers-2),c.workers,min(50,c.workers+2)}), sorted({max(1,c.picking_stations-1),c.picking_stations,min(20,c.picking_stations+1)}), sorted({max(1,c.fleet_size-1),c.fleet_size,min(30,c.fleet_size+1)})))
    random.Random(c.seed).shuffle(values)
    base = (c.workers,c.picking_stations,c.fleet_size)
    values = [base] + [v for v in values if v != base]
    rows = []
    for w,p,v in values[:request.trials]:
        cfg = Config(**{**c.model_dump(), "workers":w,"picking_stations":p,"fleet_size":v})
        results = [simulate(cfg.model_copy(update={"seed": c.seed+i})) for i in range(request.replications)]
        sla = interval([m["sla"] for m in results])
        cost = interval([m["cost"] for m in results])
        rows.append({"workers": w, "picking_stations": p, "fleet_size": v, "sla": sla, "cost":cost,
                     "throughput": interval([m["throughput"] for m in results]),
                     "feasible": sla["low"] is not None and sla["low"] >= request.target_sla})
    feasible = [r for r in rows if r["feasible"]]
    best = min(feasible, key=lambda r:r["cost"]["mean"]) if feasible else None
    return {"synthetic": True, "objective": "Minimize mean shift operating cost (USD)",
            "constraint": f"95% lower confidence bound of SLA >= {request.target_sla:.0%}", "target_sla": request.target_sla,
            "replications": request.replications, "tested": rows, "recommended": best,
            "estimated_savings": rows[0]["cost"]["mean"]-best["cost"]["mean"] if best else None,
            "limitations": "Bounded search, not a global optimum. In-sample selection; independently validate before use. Equipment remains fixed. SLA counts overdue unfinished orders."}
