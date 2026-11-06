# Five-minute portfolio demonstration

Introduce DigiLog as an independent personal project exploring discrete-event logistics simulation and explainable decision support. Everything shown is fictional. Do not imply company sponsorship or operational validation.

1. Open Live Digital Twin. Select Medium distribution center. Start at 30× or 60×. Order tokens populate actual backend lifecycle stages. Pause; the authoritative clock and state stop. Use +30m to advance and pause quickly. Inspect a station to read actual queued/processing orders.
2. Configure model: set arrival rate 40, workers 10, picking stations 1, equipment 1, vehicles 10. Create a run, then start or step through 180+ minutes. Picking becomes the queue bottleneck. Warehouse Operations shows exact resource occupancy, item ledger and order transitions.
3. Open AI Recommendations. Inspect the queue-based evidence and click Test in Scenario Lab. The current run's config becomes baseline. Set picking stations 4 and equipment 4, keeping all other fields unchanged. Compare five replications. Read completed-delivery difference, queue reduction, paired intervals and cost trade-off. Recommendations make no improvement claim until this experiment is run.
4. Open Fleet Operations. Explain the fictional destinations and representative vehicle positions. Use the Vehicle shortage scenario to demonstrate downstream constraints backing up warehouse stock.
5. Optimization runs a small bounded search with explicit cost/SLA objective. If no candidate meets the lower-bound SLA target, state that clearly. Try a lower service target or adequate equipment after explaining the changed assumptions. Never call a sampled winner a global optimum.
6. Reports exports current run configuration, metrics, assumptions, metadata, limitations and recommendations as CSV. Print the report. Comparison/optimization JSON carries configurations, seeds, means, uncertainty and search details. Saved experiments remain in local SQLite after restart.

Suggested talking points: a shared clock, immutable run inputs, common random numbers, conservation, overdue-order SLA, time-weighted utilization, and experiment design. A process twin is not a calibrated real warehouse replica. No trained ML model is needed for this demonstrable decision loop.
