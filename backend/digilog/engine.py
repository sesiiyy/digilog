import math
import random
import simpy
from .schemas import Config
from .data import synthetic_data

STAGES = ["receiving", "putaway", "picking", "packing", "dispatch", "delivery"]
class Twin:
    def __init__(self, config: Config):
        self.config = config
        self.env = simpy.Environment()
        self.data = synthetic_data(config)
        self.orders = []
        self.events = []
        self.jobs = []
        self.history = []
        self.received = self.dispatched_units = 0
        self.distance = 0.0
        self.resources = {"workers": simpy.Resource(self.env, config.workers),
                          "receiving": simpy.Resource(self.env, 2),
                          "putaway": simpy.Resource(self.env, 2),
                          "picking": simpy.Resource(self.env, config.picking_stations),
                          "packing": simpy.Resource(self.env, 2),
                          "equipment": simpy.Resource(self.env, config.equipment)}
        self.busy = {name: 0.0 for name in [*self.resources, "fleet"]}
        self.active = {name: {} for name in self.busy}
        self.assignments = {"workers": {}, "equipment": {}}
        self.slots = simpy.Container(self.env, capacity=config.warehouse_capacity, init=config.warehouse_capacity)
        self.ready = simpy.Store(self.env)
        self.vehicles = simpy.Store(self.env)
        for i in range(config.fleet_size):
            self.vehicles.put(f"V-{i+1}")
        self.env.process(self.arrivals())
        self.env.process(self.dispatcher())
        self.env.process(self.monitor())

    def event(self, order, stage, status):
        order.update(stage=stage, status=status, stage_since=self.env.now)
        self.events.append({"time": round(self.env.now, 3), "order": order["id"], "stage": stage, "status": status})

    def use(self, key, token):
        self.active[key][token] = self.env.now
        if key in self.assignments:
            population = self.data["employees" if key == "workers" else "equipment"]
            used = set(self.assignments[key].values())
            self.assignments[key][token] = next(p["id"] for p in population if p["id"] not in used)

    def release(self, key, token):
        self.busy[key] += self.env.now - self.active[key].pop(token)
        if key in self.assignments:
            self.assignments[key].pop(token)

    def arrivals(self):
        rng = random.Random(self.config.seed)
        i = 0
        while True:
            yield self.env.timeout(rng.expovariate(self.config.arrival_rate / 60))
            i += 1
            # Per-order streams are independent of resource scheduling: paired scenarios share demand.
            r = random.Random(self.config.seed * 100000 + i)
            dest = self.data["destinations"][r.randrange(12)]
            distance = max(2, math.hypot(dest["x"], dest["y"]))
            order = {"id": f"ORD-{i:04}", "created": self.env.now, "units": r.randint(1, 5),
                     "sku": f"SKU-{r.randint(1,12):03}", "location": f"Z{i % 3 + 1}-R{i % 8 + 1}", "destination": dest,
                     "distance": distance, "factor": r.lognormvariate(-0.03125, 0.25),
                     "travel_factor": max(0.2, r.gauss(1, self.config.travel_variability)),
                     "breakdown": r.random() < self.config.downtime_probability,
                     "wait": 0.0, "stage": "receiving", "status": "queued", "stage_since": self.env.now}
            self.orders.append(order)
            self.env.process(self.lifecycle(order))

    def stage(self, order, name, multiplier):
        self.event(order, name, "queued")
        start = self.env.now
        station = self.resources[name]
        with station.request() as request:
            yield request
            self.use(name, order["id"])
            with self.resources["workers"].request() as worker:
                yield worker
                self.use("workers", order["id"])
                if name == "picking":
                    with self.resources["equipment"].request() as equipment:
                        yield equipment
                        self.use("equipment", order["id"])
                        order["wait"] += self.env.now - start
                        self.event(order, name, "processing")
                        yield self.env.timeout(self.config.processing_time * multiplier * order["factor"])
                        self.release("equipment", order["id"])
                else:
                    order["wait"] += self.env.now - start
                    self.event(order, name, "processing")
                    yield self.env.timeout(self.config.processing_time * multiplier * order["factor"])
                self.release("workers", order["id"])
            self.release(name, order["id"])

    def lifecycle(self, order):
        self.event(order, "receiving", "capacity queue")
        start = self.env.now
        yield self.slots.get(order["units"])
        order["wait"] += self.env.now - start
        yield self.env.process(self.stage(order, "receiving", .45))
        self.received += order["units"]
        order["received"] = True
        for name, mult in [("putaway", .6), ("picking", 1), ("packing", .55)]:
            yield self.env.process(self.stage(order, name, mult))
        self.event(order, "dispatch", "queued")
        order["ready_at"] = self.env.now
        yield self.ready.put(order)

    def dispatcher(self):
        while True:
            yield self.env.timeout(5)
            if not self.ready.items:
                continue
            vehicle = yield self.vehicles.get()
            batch, units = [], 0
            while self.ready.items and units + self.ready.items[0]["units"] <= self.config.vehicle_capacity:
                order = yield self.ready.get()
                units += order["units"]
                batch.append(order)
            if batch:
                self.env.process(self.trip(vehicle, batch, units))
            else:
                yield self.vehicles.put(vehicle)

    def trip(self, vehicle, batch, units):
        self.use("fleet", vehicle)
        job = {"id": f"JOB-{len(self.jobs)+1}", "vehicle": vehicle, "orders": [o["id"] for o in batch],
               "units": units, "started": self.env.now, "status": "loading", "destination": batch[0]["destination"]}
        self.jobs.append(job)
        for o in batch:
            o["wait"] += self.env.now - o["ready_at"]
            self.event(o, "dispatch", "loading")
            o["vehicle"] = vehicle
        yield self.env.timeout(4 + units * .2)
        distance = max(o["distance"] for o in batch)
        self.distance += distance * 2
        self.dispatched_units += units
        yield self.slots.put(units)
        travel = distance / .65 * max(o["travel_factor"] for o in batch)
        downtime = 25 if any(o["breakdown"] for o in batch) else 0
        job.update(status="outbound", depart=self.env.now, travel_minutes=travel, downtime=downtime, distance=distance)
        for o in batch:
            self.event(o, "delivery", "in transit")
        yield self.env.timeout(travel + downtime + 3 + units * .15)
        for o in batch:
            o["completed"] = self.env.now
            self.event(o, "delivery", "completed")
        job.update(status="returning", delivered=self.env.now)
        yield self.env.timeout(travel)
        job.update(status="available", returned=self.env.now)
        self.release("fleet", vehicle)
        yield self.vehicles.put(vehicle)

    def monitor(self):
        while True:
            self.history.append({"time": self.env.now, **self.metrics()})
            yield self.env.timeout(5)

    def advance(self, minutes):
        target = min(self.config.duration, self.env.now + minutes)
        if target > self.env.now:
            self.env.run(until=target)
        return self.snapshot()

    def metrics(self):
        now = float(self.env.now)
        done = [o for o in self.orders if "completed" in o]
        pending = [o for o in self.orders if "completed" not in o]
        eligible = [o for o in self.orders if "completed" in o or now - o["created"] >= self.config.sla_minutes]
        on_time = sum(o.get("completed", float("inf")) - o["created"] <= self.config.sla_minutes for o in eligible)
        queues = {stage: sum(o["stage"] == stage and o["status"] in ("queued", "capacity queue") for o in pending) for stage in STAGES}
        utilization = {}
        for name in self.busy:
            cap = self.config.fleet_size if name == "fleet" else self.resources[name].capacity
            occupied = self.busy[name] + sum(now - started for started in self.active[name].values())
            utilization[name] = round(occupied / (cap * now), 5) if now else 0
        # Stock is received items still inside; inbound reserved slots are tracked separately.
        inventory = self.received - self.dispatched_units
        cost = now / 60 * (self.config.workers * 12 + self.config.picking_stations * 3 + self.config.equipment * 4 + self.config.fleet_size * 9 + 12) + self.distance * .6
        bottleneck = max(queues, key=queues.get) if any(queues.values()) else "none"
        return {"arrived": len(self.orders), "throughput": len(done), "active": len(pending),
                "pending": sum(queues.values()), "queues": queues, "queue_length": sum(queues.values()),
                "warehouse_utilization": (self.config.warehouse_capacity - self.slots.level) / self.config.warehouse_capacity,
                "inventory_units": inventory, "received_units": self.received, "dispatched_units": self.dispatched_units,
                "reserved_units": self.config.warehouse_capacity - self.slots.level,
                "fleet_utilization": utilization["fleet"], "utilization": utilization,
                "available_workers": self.resources["workers"].capacity - self.resources["workers"].count,
                "available_vehicles": len(self.vehicles.items),
                "processing_time": sum(o["completed"] - o["created"] for o in done) / len(done) if done else None,
                "waiting_time": sum(o["wait"] for o in done) / len(done) if done else None,
                "cost": round(cost, 2), "sla": on_time / len(eligible) if eligible else None,
                "sla_eligible": len(eligible), "bottleneck": bottleneck,
                "delivery_jobs": len(self.jobs), "distance_km": round(self.distance, 2)}

    def snapshot(self):
        return {"synthetic": True, "clock": float(self.env.now), "config": self.config.model_dump(),
                "metrics": self.metrics(), "orders": self.orders, "jobs": self.jobs,
                "resources": {k: {"capacity": r.capacity, "busy": r.count, "queue": len(r.queue)} for k, r in self.resources.items()},
                "history": self.history, "events": self.events[-150:], "dataset": self.data,
                "agents": {key: [{"id": ident, "order": order_id, "stage": next(o["stage"] for o in self.orders if o["id"] == order_id)} for order_id, ident in assigned.items()] for key, assigned in self.assignments.items()},
                "inventory_locations": {loc: sum(o["units"] for o in self.orders if o.get("received") and o["stage"] != "delivery" and o["location"] == loc) for loc in sorted({o["location"] for o in self.orders})}}

def simulate(config):
    twin = Twin(config)
    twin.advance(config.duration)
    return twin.metrics()
