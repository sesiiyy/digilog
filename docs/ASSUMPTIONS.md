# Simulation assumptions and metric dictionary

All data is synthetic and all outcomes are simulated. No company data, branding, business rules or enterprise system access is used. DigiLog is an independent portfolio project.

## Units and distributions

Time: simulated minutes. Distance: fictional km. Capacity: item units. Costs: fictional USD. Shift starts empty; no warm-up, replenishment stock or post-shift drain. Costs accrue until the selected horizon. Results at different durations are not directly comparable.

Arrivals form a Poisson process (exponential interarrival mean 60 / configured orders-per-hour). Orders contain uniform integer quantities 1–5. Twelve synthetic SKUs map to three zones; locations are deterministic labels assigned per order. Receiving reserves item slots, receives items, puts away, picks and packs; outbound stock is released after loading. Products are illustrative, without product-specific service differences or stock-outs. Inventory represents received inbound items matched to an outbound order, not retail replenishment.

Per-order service multiplier is lognormal(mu=-0.03125, sigma=0.25), mean 1. Configured mean processing time is picking time. Multipliers are receiving 0.45, put-away 0.6, picking 1.0, packing 0.55. One cross-trained worker is required at every stage. Two receiving, two put-away and two packing stations are fixed. Picking requires a configurable station and handling unit. Acquisition order is station → worker → equipment; stations and workers may be occupied while waiting for a subsequent resource. Resource occupancy includes that blocked time.

All orders reserve their quantity of finite warehouse slots before receiving, and release those slots after loading. This creates upstream backpressure. No order is dropped. Worker/equipment resources are positive integers and never exceed capacity. Synthetic staff and equipment identities are allocated only when the corresponding resource is actually acquired.

Dispatch checks every five minutes, then waits for a vehicle if needed; a FIFO batch cannot exceed item capacity. Minimum vehicle capacity is five so every order fits. No partial-order dispatch. Loading takes 4 + 0.2 × batch units minutes. A batch trip uses the farthest order's radial distance as an aggregate proxy. Destinations are fixed fictional Cartesian coordinates uniform in [-20,20], with a two-km minimum. This is not geographic routing or a real optimized route. The map uses the first destination for visualization, explicitly labeled approximate.

Travel speed is 0.65 km/min. Order travel factors are max(0.2, Normal(1, configurable variability)); batch uses maximum factor. Each order independently flags downtime with the configured probability; a batch with at least one flag experiences a single 25-minute outbound interruption. Larger batches therefore have higher disruption probability. Unloading is 3 + 0.15 × units minutes. Orders complete after outbound travel/downtime/unloading, and the vehicle remains busy during its return trip of equal travel time. There are no drivers as a separate resource or shift overtime costs.

Fictional hourly costs: worker $12, picking station $3, equipment $4, vehicle $9; fixed receiving/put-away/packing infrastructure $12/h combined. Distance cost $0.60 per round-trip km. Resource costs accrue whether idle or busy; round-trip travel cost is committed at departure even if the trip is unfinished at shift end.

## Metric definitions

| API metric | Definition |
|---|---|
| arrived | Orders generated before current horizon |
| throughput | Completed deliveries, not picking completions |
| active | Arrived minus completed |
| pending / queue_length | Orders with queued or capacity-queue status; includes orders holding a station while waiting on a worker/equipment |
| queues | Current order queues grouped by lifecycle stage; terminal values in comparisons, not time averages |
| warehouse_utilization | Reserved inbound + received item slots / configured warehouse capacity |
| inventory_units | Cumulative received units minus cumulative dispatched units |
| utilization | Integral of occupied resource units / (capacity × elapsed time); includes blocked occupancy |
| fleet_utilization | Integral of occupied vehicles / (fleet size × elapsed time) |
| processing_time | Mean arrival-to-delivery cycle time among completed orders; includes waiting and travel |
| waiting_time | Mean pre-storage, stage resource and dispatch waits among completed orders; unfinished waits excluded |
| sla | On-time completed orders / (all completed orders + overdue unfinished orders), using arrival-to-delivery limit |
| sla_eligible | Denominator of SLA; recent unfinished orders are not yet judged |
| cost | Elapsed hourly resource costs + round-trip distance committed at departure |
| bottleneck | Stage with the largest current order queue; ties follow lifecycle order; none if all clear |
| available_workers / vehicles | Current free resource counts, not utilization averages |

Missing completed-order means and SLA with no eligible orders are null, displayed as —. Completed-order averages are subject to completion bias under severe congestion; always inspect backlog and SLA alongside them. At time zero, cost and utilization are zero.

Conservation: arrived = active + delivered; received units = warehouse inventory + dispatched units; 0 ≤ inventory ≤ reserved item slots ≤ capacity. No inventory quantity is inferred from a decorative rack image.

## Experimental controls

Configurable seed governs demand and fictional destinations. Per-order service/route/downtime streams are independent of scheduling so resource-only interventions receive exactly the same arrivals, quantities and processing draws. A changed demand rate intentionally changes arrival times. Comparisons override scenario duration and seed with baseline horizon and paired baseline seed+i. A demand change is flagged and must be read as a stress test rather than a resource-only causal estimate.

Each scenario uses 2–20 independent replications. Show means and two-sided 95% Student-t confidence intervals, including paired scenario-minus-baseline differences. Critical values use exact df 1–9 table entries and conservative df=9 above that range. Intervals are not clamped to physical bounds and describe uncertainty of the mean, not prediction intervals. Null means are excluded and interval sample size is retained. Few replications yield wide intervals.

Optimization tests the baseline plus a seeded random subset of the 3×3×3 grid: workers {-2,0,+2}, picking stations {-1,0,+1}, vehicles {-1,0,+1}, clipped to validated bounds. Equipment is held fixed. Minimize mean operating cost subject to the lower 95% SLA bound meeting the target. No feasible result produces no recommendation. Reported cost saving is relative to the tested baseline. Search is bounded, subject to selection bias and not globally optimal. Validate a winner using new seeds in a separate comparison before operational use.

## Rules and limitations

Rules trigger on picking queue ≥3 (test station + equipment), dispatch queue ≥3 (test vehicle), receiving queue ≥3 with occupancy >85% (test storage), or worker occupancy >80% (test workers). They produce evidence and suggested inputs, never an invented improvement claim. No machine learning model is included: it would add no demonstrated value over direct simulation here.

Not implemented: real layout travel, robot/worker trajectories, SKU replenishment or allocation optimization, real route optimization, labor scheduling, maintenance calendars, model calibration, enterprise data ingestion, user authentication, restartable active simulations, cloud deployment, trained predictions, or native PDF export. Browser print is the supported printable report route. Process nodes represent station/zone groups, not a CAD layout.
