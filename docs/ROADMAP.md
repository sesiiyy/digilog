# Future development and integration roadmap

DigiLog is a personal project and has no company affiliation or production integration.

1. Model fidelity: order/product demand distributions, SKU replenishment, spatial travel and picker routing, labor calendars, explicit disruptions and measured calibration with authorized anonymized inputs. Validate conservation, event semantics and confidence intervals before extending visuals.
2. Statistical validation: new-seed holdout evaluation for optimization winners, sensitivity analysis, warm-up and drain policies, variance reduction diagnostics, richer confidence interval methods and model uncertainty.
3. Predictive learning only after a measurable need: generate synthetic training histories across seeds/configurations, split by run and seed before fitting, use a pipeline fitted on training data only, publish held-out MAE/RMSE and a simple baseline, and mark forecasts separately from simulated outcomes. Current version deliberately has no trained model.
4. Application maturity: feature-level frontend modules, durable worker queue with cancellation/progress and restartable job history, archived run browsing, authenticated ownership and authorization, audit logs, migrations, retention limits, dependency scanning, access tests and performance profiling.
5. Optional enterprise integration must be explicitly authorized and separately security-reviewed. Use read-only least-privilege connectors first, documented data contracts, consented synthetic or anonymized test sets, lineage, encryption, secret management, retention, isolated deployments and an approved validation plan. No connector, credential or enterprise assumption ships here.

Public hosting is not a default or acceptance prerequisite. Before exposing the API, add authentication, authorization, origin policy, TLS, resource quotas and production job isolation. The current setup is a localhost development POC.
