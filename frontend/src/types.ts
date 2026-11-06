export type Config = {
  name: string;
  seed: number;
  duration: number;
  warehouse_capacity: number;
  workers: number;
  picking_stations: number;
  equipment: number;
  arrival_rate: number;
  processing_time: number;
  fleet_size: number;
  vehicle_capacity: number;
  travel_variability: number;
  downtime_probability: number;
  sla_minutes: number;
};
export type Metric = {
  arrived: number;
  throughput: number;
  active: number;
  pending: number;
  queues: Record<string, number>;
  queue_length: number;
  warehouse_utilization: number;
  inventory_units: number;
  received_units: number;
  dispatched_units: number;
  reserved_units: number;
  fleet_utilization: number;
  utilization: Record<string, number>;
  available_workers: number;
  available_vehicles: number;
  processing_time: number | null;
  waiting_time: number | null;
  cost: number;
  sla: number | null;
  sla_eligible: number;
  bottleneck: string;
  delivery_jobs: number;
  distance_km: number;
};
export type Order = {
  id: string;
  created: number;
  units: number;
  sku: string;
  location: string;
  stage: string;
  status: string;
  stage_since: number;
  completed?: number;
  vehicle?: string;
  destination: { id: string; x: number; y: number };
};
export type Job = {
  id: string;
  vehicle: string;
  orders: string[];
  units: number;
  started: number;
  status: string;
  destination: { x: number; y: number };
  depart?: number;
  travel_minutes?: number;
  delivered?: number;
  returned?: number;
  downtime?: number;
};
export type Run = {
  id: string;
  clock: number;
  status: string;
  speed: number;
  created_at: string;
  synthetic: true;
  config: Config;
  metrics: Metric;
  orders: Order[];
  jobs: Job[];
  agents: Record<string, { id: string; order: string; stage: string }[]>;
  inventory_locations: Record<string, number>;
  resources: Record<string, { capacity: number; busy: number; queue: number }>;
  history: ({ time: number } & Metric)[];
  events: { time: number; order: string; stage: string; status: string }[];
  dataset: {
    vehicles: { id: string; capacity: number }[];
    destinations: { id: string; x: number; y: number }[];
    products: { id: string; name: string; zone: string }[];
    employees: { id: string; role: string }[];
    equipment: { id: string; type: string }[];
  };
};
export type Recommendation = {
  title: string;
  evidence: string;
  suggested_changes: Partial<Config>;
  method: string;
};
export type Interval = {
  mean: number | null;
  low: number | null;
  high: number | null;
  n: number;
};
export type Comparison = {
  replications: number;
  seeds: number[];
  duration: number;
  baseline_config: Config;
  scenario_config: Config;
  demand_changed: boolean;
  metrics: Record<
    string,
    { baseline: Interval; scenario: Interval; difference: Interval }
  >;
  resource_utilization: Record<
    string,
    { baseline: Interval; scenario: Interval }
  >;
  bottlenecks: { baseline: string[]; scenario: string[] };
};
export type Trial = {
  workers: number;
  picking_stations: number;
  fleet_size: number;
  sla: Interval;
  cost: Interval;
  throughput: Interval;
  feasible: boolean;
};
export type Optimization = {
  objective: string;
  constraint: string;
  target_sla: number;
  replications: number;
  tested: Trial[];
  recommended: Trial | null;
  estimated_savings: number | null;
  limitations: string;
};
export type Task<T> = {
  id: string;
  status: string;
  kind: string;
  result: T | null;
  error: string | null;
};
