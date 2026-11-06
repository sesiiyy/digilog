import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Box,
  Boxes,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  MapPin,
  Package,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Truck,
  Users,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Button } from "./components/ui/button";
import { api, fmt } from "./api";
import type {
  Config,
  Run,
  Recommendation,
  Comparison,
  Optimization,
  Task,
  Interval,
} from "./types";
import Twin from "./Twin";
const navigation = [
  ["Overview", LayoutDashboard],
  ["Live Digital Twin", GitBranch],
  ["Warehouse Operations", Warehouse],
  ["Fleet Operations", Truck],
  ["Scenario Lab", FlaskConical],
  ["AI Recommendations", Lightbulb],
  ["Optimization", Target],
  ["Reports", BarChart3],
  ["Settings", Settings2],
] as const;
const fields: [keyof Config, string, number, number, number, string][] = [
  ["workers", "Cross-trained workers", 1, 50, 1, "people"],
  ["picking_stations", "Picking stations", 1, 20, 1, "stations"],
  ["equipment", "Handling equipment", 1, 20, 1, "units"],
  ["warehouse_capacity", "Warehouse capacity", 5, 5000, 5, "item units"],
  ["arrival_rate", "Order arrival rate", 1, 180, 1, "orders / hour"],
  ["processing_time", "Mean picking time", 0.5, 30, 0.5, "minutes"],
  ["duration", "Shift duration", 30, 1440, 30, "minutes"],
  ["fleet_size", "Available vehicles", 1, 30, 1, "vehicles"],
  ["vehicle_capacity", "Vehicle capacity", 5, 100, 1, "item units"],
  ["sla_minutes", "Delivery SLA", 15, 1440, 5, "minutes"],
  ["seed", "Random seed", 0, 2147483000, 1, "seed"],
  ["travel_variability", "Travel-time variability", 0, 1, 0.05, "coefficient"],
  [
    "downtime_probability",
    "Trip downtime probability",
    0,
    0.5,
    0.01,
    "probability",
  ],
];
function Section({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h3>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Value({
  value,
  style = "number",
}: {
  value: number | null | undefined;
  style?: "number" | "percent" | "money";
}) {
  return <>{fmt(value, style)}</>;
}
function ConfigFields({
  config,
  setConfig,
  compact = false,
}: {
  config: Config;
  setConfig: (c: Config) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "config-fields compact" : "config-fields"}>
      {fields.map(([key, label, min, max, step, unit]) => (
        <label key={key}>
          <span>
            {label}
            <small>{unit}</small>
          </span>
          <input
            aria-label={label}
            type="number"
            min={min}
            max={max}
            step={step}
            required
            value={config[key]}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n)) setConfig({ ...config, [key]: n });
            }}
          />
        </label>
      ))}
    </div>
  );
}
function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  title: string;
  value: React.ReactNode;
  detail: string;
  icon: typeof Box;
  accent?: boolean;
}) {
  return (
    <div className={"metric-card " + (accent ? "metric-accent" : "")}>
      <div className="metric-title">
        {title}
        <Icon size={17} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  );
}
function IntervalCell({
  v,
  percent = false,
}: {
  v: Interval;
  percent?: boolean;
}) {
  return (
    <>
      <b>{fmt(v.mean, percent ? "percent" : "number")}</b>
      <small>
        {v.n > 1
          ? `${fmt(v.low, percent ? "percent" : "number")} – ${fmt(v.high, percent ? "percent" : "number")}`
          : "Insufficient observations"}
      </small>
    </>
  );
}
export default function App() {
  const [page, setPage] = useState("Live Digital Twin");
  const [presets, setPresets] = useState<Record<string, Config>>({});
  const [scenarioPresets, setScenarioPresets] = useState<
    Record<string, Partial<Config>>
  >({});
  const [config, setConfig] = useState<Config | null>(null);
  const [scenario, setScenario] = useState<Config | null>(null);
  const [environment, setEnvironment] = useState("medium");
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [scenarioName, setScenarioName] = useState("Custom scenario");
  const [saved, setSaved] = useState<
    { id: string; name: string; config: Config }[]
  >([]);
  const [notice, setNotice] = useState("");
  const [replications, setReplications] = useState(5);
  const [target, setTarget] = useState(0.8);
  const [trials, setTrials] = useState(12);
  const [experiment, setExperiment] = useState<Task<
    Comparison | Optimization
  > | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [archives, setArchives] = useState<Task<Comparison | Optimization>[]>(
    [],
  );
  const runRef = useRef<string | null>(null);
  const commandVersion = useRef(0);
  const accept = (r: Run) => {
    runRef.current = r.id;
    setRun(r);
  };
  async function attempt(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    api<{
      presets: Record<string, Config>;
      scenarios: Record<string, Partial<Config>>;
    }>("/configurations")
      .then(async (data) => {
        if (!alive) return;
        setPresets(data.presets);
        setScenarioPresets(data.scenarios);
        setConfig(data.presets.medium);
        setScenario({
          ...data.presets.medium,
          picking_stations: 3,
          equipment: 3,
        });
        const r = await api<Run>("/runs", data.presets.medium);
        if (alive) accept(r);
      })
      .catch((e) => {
        if (alive)
          setError(
            "Cannot connect to the local backend. Start FastAPI on port 8000. " +
              e.message,
          );
      });
    api<typeof saved>("/scenarios")
      .then((s) => {
        if (alive) setSaved(s);
      })
      .catch(() => {});
    api<typeof archives>("/experiments")
      .then((s) => {
        if (alive) setArchives(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!run?.id) return;
    let cancelled = false;
    const id = run.id;
    const timer = setInterval(async () => {
      const version = commandVersion.current;
      try {
        const r = await api<Run>("/runs/" + id);
        if (
          !cancelled &&
          runRef.current === id &&
          version === commandVersion.current
        )
          setRun(r);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 800);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [run?.id]);
  useEffect(() => {
    if (!run?.id) return;
    api<Recommendation[]>("/runs/" + run.id + "/recommendations")
      .then(setRecs)
      .catch(() => {});
  }, [run?.id, run?.metrics.bottleneck, Math.floor((run?.clock ?? 0) / 20)]);
  useEffect(() => {
    if (!experiment || !["queued", "running"].includes(experiment.status))
      return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const j = await api<Task<Comparison | Optimization>>(
          "/jobs/" + experiment.id,
        );
        if (cancelled) return;
        setExperiment(j);
        if (j.status === "completed" && j.result) {
          if (j.kind === "comparison") setComparison(j.result as Comparison);
          else setOptimization(j.result as Optimization);
          api<typeof archives>("/experiments")
            .then(setArchives)
            .catch(() => {});
        }
        if (j.status === "failed") setError(j.error ?? "Experiment failed");
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setExperiment(null);
        }
      }
    }, 700);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [experiment?.id, experiment?.status]);
  const control = (action: string, extra = {}) =>
    attempt(async () => {
      if (!run) return;
      commandVersion.current++;
      accept(
        await api<Run>("/runs/" + run.id + "/control", { action, ...extra }),
      );
    });
  const createRun = (c: Config) =>
    attempt(async () => {
      if (run?.status === "running")
        await api("/runs/" + run.id + "/control", { action: "pause" });
      commandVersion.current++;
      accept(await api<Run>("/runs", c));
      setDrawer(false);
      setNotice(
        "New run created with your configuration. Start to observe the changed system.",
      );
    });
  const m = run?.metrics;
  const working =
    experiment && ["queued", "running"].includes(experiment.status);
  const startComparison = () =>
    attempt(async () => {
      if (!config || !scenario) return;
      setExperiment(
        await api<Task<Comparison>>("/comparisons", {
          baseline: config,
          scenario,
          replications,
        }),
      );
    });
  const saveScenario = () =>
    attempt(async () => {
      if (!scenario) return;
      await api("/scenarios", { name: scenarioName, config: scenario });
      setSaved(await api("/scenarios"));
      setNotice("Custom scenario saved locally.");
    });
  const exportExperiment = (
    result: Comparison | Optimization,
    name: string,
  ) => {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Overview");
          }}
        >
          <span className="brand-symbol">
            <Boxes size={27} />
          </span>
          <div>
            DigiLog<span>LOGISTICS DIGITAL TWIN</span>
          </div>
        </a>
        <div className="workspace-label">OPERATIONS WORKSPACE</div>
        <nav>
          {navigation.map(([name, Icon]) => (
            <button
              aria-label={name}
              title={name}
              key={name}
              className={page === name ? "nav-active" : ""}
              onClick={() => setPage(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {page === name && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="synthetic-card">
            <ShieldCheck size={19} />
            <strong>Synthetic by design</strong>
            <p>
              Fictional operations.
              <br />
              Real simulation logic.
            </p>
          </div>
          <div className="profile">
            <span>DL</span>
            <div>
              DigiLog Workspace<small>Local proof of concept</small>
            </div>
            <CircleHelp size={16} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{page}</span>
          </div>
          <div className="topbar-right">
            <span className="simulation-badge">
              <i /> SYNTHETIC DATA
            </span>
            <span className="local-status">
              <i /> Local environment
            </span>
            <div className="avatar">DL</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                DIGILOG / INDEPENDENT SIMULATION PROJECT
              </div>
              <h1>{page}</h1>
              <p>
                {page === "Live Digital Twin"
                  ? "An operational view of your warehouse, from arrival to delivery."
                  : page === "Scenario Lab"
                    ? "Test a decision before it reaches your operations."
                    : page === "Optimization"
                      ? "Find a cost-effective configuration within a bounded search."
                      : "Explore, understand, and improve your simulated operations."}
              </p>
            </div>
            <Button variant="outline" onClick={() => setDrawer(true)}>
              <SlidersHorizontal size={16} /> Configure model
            </Button>
          </div>
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice-banner">
              <Check size={16} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!run || !config || !m ? (
            <div className="loading-state">
              <Loader2 className="spin" />
              <h3>Connecting to the simulation engine</h3>
              <p>All operational data stays on your computer.</p>
            </div>
          ) : (
            <>
              <div className="run-toolbar">
                <div className="environment-select">
                  <span className="environment-icon">
                    <Warehouse size={20} />
                  </span>
                  <div>
                    <label htmlFor="environment">SIMULATION ENVIRONMENT</label>
                    <select
                      id="environment"
                      value={environment}
                      onChange={(e) => {
                        const key = e.target.value;
                        setEnvironment(key);
                        setConfig(presets[key]);
                        setScenario(presets[key]);
                        createRun(presets[key]);
                      }}
                      disabled={busy}
                    >
                      {Object.entries(presets).map(([key, c]) => (
                        <option key={key} value={key}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="run-clock">
                  <Clock3 size={17} />
                  <strong>
                    {Math.floor(run.clock / 60)
                      .toString()
                      .padStart(2, "0")}
                    :
                    {Math.floor(run.clock % 60)
                      .toString()
                      .padStart(2, "0")}
                  </strong>
                  <span>/ {fmt(run.config.duration / 60)}h shift</span>
                  <span className={"status-pill " + run.status}>
                    {run.status}
                  </span>
                </div>
                <div className="run-actions">
                  <select
                    aria-label="Simulation speed"
                    disabled={busy}
                    value={run.speed}
                    onChange={(e) =>
                      control("speed", { speed: Number(e.target.value) })
                    }
                  >
                    {[1, 5, 10, 30, 60, 120].map((s) => (
                      <option key={s} value={s}>
                        {s}× speed
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || run.status === "completed"}
                    title="Advance 30 simulated minutes and pause"
                    onClick={() => control("step", { minutes: 30 })}
                  >
                    +30m
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    title="Reset to seed and time zero"
                    disabled={busy}
                    onClick={() => control("reset")}
                  >
                    <RotateCcw size={16} />
                  </Button>
                  <Button
                    disabled={busy || run.status === "completed"}
                    onClick={() =>
                      control(run.status === "running" ? "pause" : "start")
                    }
                  >
                    {run.status === "running" ? (
                      <Pause size={15} />
                    ) : (
                      <Play size={15} />
                    )}{" "}
                    {run.status === "running" ? "Pause" : "Start simulation"}
                  </Button>
                </div>
              </div>
              {[
                "Live Digital Twin",
                "Overview",
                "Warehouse Operations",
                "Fleet Operations",
              ].includes(page) && (
                <div className="metric-grid">
                  <MetricCard
                    title="Completed deliveries"
                    value={<Value value={m.throughput} />}
                    detail={`${m.arrived} orders arrived · ${m.active} active`}
                    icon={Package}
                  />
                  <MetricCard
                    title="Warehouse occupancy"
                    value={
                      <Value value={m.warehouse_utilization} style="percent" />
                    }
                    detail={`${m.reserved_units} / ${run.config.warehouse_capacity} item slots reserved`}
                    icon={Warehouse}
                  />
                  <MetricCard
                    title="Delivery SLA"
                    value={<Value value={m.sla} style="percent" />}
                    detail={`${m.sla_eligible} eligible orders · target ${run.config.sla_minutes}m`}
                    icon={ShieldCheck}
                    accent
                  />
                  <MetricCard
                    title="Operating cost"
                    value={<Value value={m.cost} style="money" />}
                    detail="USD · resource time + dispatched distance"
                    icon={Activity}
                  />
                </div>
              )}
              {(page === "Live Digital Twin" || page === "Overview") && (
                <>
                  <div className="live-layout">
                    <Section
                      title="Warehouse process twin"
                      eyebrow="LIVE OPERATIONS"
                      action={
                        <span className="live-indicator">
                          <i />
                          {run.status === "running"
                            ? "Engine running"
                            : "Engine " + run.status}
                        </span>
                      }
                    >
                      <Twin run={run} />
                      <div className="twin-summary">
                        <span>
                          <Users size={16} />
                          <b>{m.available_workers}</b> workers available
                        </span>
                        <span>
                          <Truck size={16} />
                          <b>{m.available_vehicles}</b> vehicles available
                        </span>
                        <span>
                          <Box size={16} />
                          <b>{m.inventory_units}</b> items in warehouse
                        </span>
                        <span>
                          <Clock3 size={16} />
                          Updated at {fmt(run.clock)} min
                        </span>
                      </div>
                    </Section>
                    <div className="right-stack">
                      <Section title="Flow health" eyebrow="SYSTEM SIGNALS">
                        <div className="bottleneck-card">
                          <span className="signal-label">
                            {m.bottleneck === "none"
                              ? "NO ACTIVE BOTTLENECK"
                              : "CURRENT BOTTLENECK"}
                          </span>
                          <h2>
                            {m.bottleneck === "none"
                              ? "Flow is clear"
                              : m.bottleneck}
                          </h2>
                          <p>
                            {m.bottleneck === "none"
                              ? "Start the simulation to observe demand and resource contention."
                              : `${m.queues[m.bottleneck]} orders waiting at this stage. Inspect resources before making a change.`}
                          </p>
                        </div>
                        <div className="health-metrics">
                          <div>
                            <span>Mean order cycle</span>
                            <b>
                              {fmt(m.processing_time)} <small>min</small>
                            </b>
                          </div>
                          <div>
                            <span>Mean waiting time</span>
                            <b>
                              {fmt(m.waiting_time)} <small>min</small>
                            </b>
                          </div>
                          <div>
                            <span>Queued orders</span>
                            <b>{m.queue_length}</b>
                          </div>
                        </div>
                        <small className="footnote">
                          Cycle and waiting means use completed deliveries. —
                          means no completed observations.
                        </small>
                      </Section>
                      <Section
                        title="Next best experiment"
                        action={<Lightbulb size={17} />}
                      >
                        <div className="recommendation-mini">
                          <h4>{recs[0]?.title ?? "Observe a full shift"}</h4>
                          <p>
                            {recs[0]?.evidence ??
                              "Run the model to generate evidence."}
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPage("AI Recommendations")}
                          >
                            Review reasoning <ArrowRight size={14} />
                          </Button>
                        </div>
                      </Section>
                    </div>
                  </div>
                  <div className="bottom-grid">
                    <Section
                      title="Throughput & backlog"
                      eyebrow="SHIFT TREND"
                      action={
                        <span className="subtle">5-minute observations</span>
                      }
                    >
                      <div className="chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={run.history}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                            />
                            <XAxis
                              dataKey="time"
                              tickFormatter={(v) => v + "m"}
                            />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Area
                              type="monotone"
                              dataKey="throughput"
                              name="Delivered"
                              fill="#d3eeea"
                              stroke="#177d73"
                              strokeWidth={2}
                            />
                            <Area
                              type="monotone"
                              dataKey="active"
                              name="Active orders"
                              fill="#e8edf4"
                              stroke="#778aa6"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </Section>
                    <Section
                      title="Event stream"
                      eyebrow="ENGINE ACTIVITY"
                      action={
                        <span className="subtle">Most recent transitions</span>
                      }
                    >
                      <div className="event-list">
                        {run.events.length ? (
                          run.events
                            .slice(-6)
                            .reverse()
                            .map((e, i) => (
                              <div key={`${e.order}-${e.time}-${i}`}>
                                <span className="event-dot" />
                                <div>
                                  <b>{e.order}</b>
                                  <span>
                                    {e.stage} · {e.status}
                                  </span>
                                </div>
                                <time>{fmt(e.time)}m</time>
                              </div>
                            ))
                        ) : (
                          <div className="empty">
                            Start the simulation to see order events.
                          </div>
                        )}
                      </div>
                    </Section>
                  </div>
                </>
              )}
              {page === "Warehouse Operations" && (
                <>
                  <div className="two-column">
                    <Section
                      title="Resource utilization"
                      eyebrow="TIME-WEIGHTED OCCUPANCY"
                    >
                      {Object.entries(m.utilization)
                        .filter(([k]) => k !== "fleet")
                        .map(([key, value]) => (
                          <div className="util-row" key={key}>
                            <div>
                              <span>{key}</span>
                              <b>{fmt(value, "percent")}</b>
                            </div>
                            <div className="progress-track">
                              <i style={{ width: value * 100 + "%" }} />
                            </div>
                            <small>
                              {run.resources[key]?.busy} occupied /{" "}
                              {run.resources[key]?.capacity} available capacity
                              · {run.resources[key]?.queue} resource requests
                              waiting
                            </small>
                          </div>
                        ))}
                    </Section>
                    <Section
                      title="Inventory & conservation"
                      eyebrow="ITEM LEDGER"
                    >
                      <div className="ledger">
                        <div>
                          <span>Received</span>
                          <b>{m.received_units}</b>
                        </div>
                        <div>
                          <span>Dispatched</span>
                          <b>− {m.dispatched_units}</b>
                        </div>
                        <div>
                          <span>Inventory in warehouse</span>
                          <b>{m.inventory_units}</b>
                        </div>
                        <div>
                          <span>Reserved inbound + stored</span>
                          <b>
                            {m.reserved_units} / {run.config.warehouse_capacity}
                          </b>
                        </div>
                      </div>
                      <p className="explainer">
                        Each order reserves storage before receiving. Inventory
                        enters after receiving and leaves after loading. Inbound
                        reservations explain the difference between stock and
                        occupied capacity.
                      </p>
                      <div className="location-ledger">
                        {Object.entries(run.inventory_locations)
                          .filter(([, units]) => units > 0)
                          .map(([location, units]) => (
                            <span
                              key={location}
                              title="Received units still stored"
                            >
                              {location} <b>{units} units</b>
                            </span>
                          ))}
                      </div>
                      <div className="product-grid">
                        {run.dataset.products.map((p) => (
                          <div key={p.id}>
                            <Box size={17} />
                            <b>{p.id}</b>
                            <span>{p.zone}</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  </div>
                  <Section
                    title="Order lifecycle"
                    action={<span className="subtle">Last 100 arrivals</span>}
                  >
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>SKU</th>
                            <th>Units</th>
                            <th>Stage</th>
                            <th>Status</th>
                            <th>Arrived</th>
                            <th>Completed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.orders
                            .slice(-100)
                            .reverse()
                            .map((o) => (
                              <tr key={o.id}>
                                <td>
                                  <b>{o.id}</b>
                                </td>
                                <td>{o.sku}</td>
                                <td>{o.units}</td>
                                <td>{o.stage}</td>
                                <td>
                                  <span className="table-tag">{o.status}</span>
                                </td>
                                <td>{fmt(o.created)}m</td>
                                <td>
                                  {o.completed ? fmt(o.completed) + "m" : "—"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                </>
              )}
              {page === "Fleet Operations" && (
                <>
                  <div className="two-column">
                    <Section
                      title="Fictional dispatch network"
                      eyebrow="SYNTHETIC COORDINATES · NOT REAL ROUTES"
                    >
                      <div className="route-map">
                        <svg
                          viewBox="0 0 480 360"
                          role="img"
                          aria-label="Fictional warehouse and delivery destinations"
                        >
                          <defs>
                            <pattern
                              id="map-grid"
                              width="24"
                              height="24"
                              patternUnits="userSpaceOnUse"
                            >
                              <path
                                d="M 24 0 L 0 0 0 24"
                                fill="none"
                                stroke="#dce7e8"
                              />
                            </pattern>
                          </defs>
                          <rect
                            width="480"
                            height="360"
                            fill="url(#map-grid)"
                          />
                          {run.dataset.destinations.map((d) => (
                            <g key={d.id}>
                              <line
                                x1="240"
                                y1="180"
                                x2={240 + d.x * 8}
                                y2={180 + d.y * 7}
                                stroke="#c3d5d7"
                                strokeDasharray="4 4"
                              />
                              <circle
                                cx={240 + d.x * 8}
                                cy={180 + d.y * 7}
                                r="5"
                                fill="#78959a"
                              />
                              <text
                                x={250 + d.x * 8}
                                y={180 + d.y * 7}
                                fontSize="10"
                                fill="#53717a"
                              >
                                {d.id}
                              </text>
                            </g>
                          ))}
                          {run.jobs
                            .filter((j) =>
                              ["outbound", "returning", "loading"].includes(
                                j.status,
                              ),
                            )
                            .map((j) => {
                              const elapsed =
                                run.clock - (j.depart ?? run.clock);
                              const travel = j.travel_minutes ?? 1;
                              const progress =
                                j.status === "loading"
                                  ? 0
                                  : j.status === "returning"
                                    ? Math.max(
                                        0,
                                        1 -
                                          (run.clock -
                                            (j.delivered ?? run.clock)) /
                                            travel,
                                      )
                                    : Math.min(1, elapsed / travel);
                              return (
                                <g key={j.id}>
                                  <circle
                                    cx={240 + j.destination.x * 8 * progress}
                                    cy={180 + j.destination.y * 7 * progress}
                                    r="8"
                                    fill="#168378"
                                  />
                                  <text
                                    x={250 + j.destination.x * 8 * progress}
                                    y={176 + j.destination.y * 7 * progress}
                                    fontSize="10"
                                    fill="#106b64"
                                  >
                                    {j.vehicle}
                                  </text>
                                </g>
                              );
                            })}
                          <rect
                            x="225"
                            y="165"
                            width="30"
                            height="30"
                            rx="6"
                            fill="#172f39"
                          />
                          <text
                            x="240"
                            y="185"
                            textAnchor="middle"
                            fontSize="12"
                            fill="white"
                          >
                            WH
                          </text>
                        </svg>
                      </div>
                      <p className="footnote">
                        Positions interpolate backend trip timestamps. Each
                        batch uses a representative destination; travel cost
                        uses its farthest distance. No route optimization is
                        performed.
                      </p>
                    </Section>
                    <Section
                      title="Fleet availability"
                      eyebrow="CAPACITY & STATUS"
                    >
                      <div className="fleet-kpis">
                        <MetricCard
                          title="Utilization"
                          value={fmt(m.fleet_utilization, "percent")}
                          detail="Time-weighted vehicle busy time"
                          icon={Truck}
                        />
                        <MetricCard
                          title="Distance committed"
                          value={fmt(m.distance_km) + " km"}
                          detail={`${m.delivery_jobs} dispatch batches`}
                          icon={MapPin}
                        />
                      </div>
                      {run.dataset.vehicles.map((v) => {
                        const job = [...run.jobs]
                          .reverse()
                          .find((j) => j.vehicle === v.id);
                        return (
                          <div className="vehicle-row" key={v.id}>
                            <span className="vehicle-icon">
                              <Truck size={20} />
                            </span>
                            <div>
                              <b>{v.id}</b>
                              <small>
                                {v.capacity} item capacity · {job?.units ?? 0}{" "}
                                last batch units
                              </small>
                            </div>
                            <span className="table-tag">
                              {job?.status ?? "available"}
                            </span>
                          </div>
                        );
                      })}
                    </Section>
                  </div>
                  <Section title="Dispatch ledger">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Job</th>
                            <th>Vehicle</th>
                            <th>Orders</th>
                            <th>Units</th>
                            <th>Started</th>
                            <th>Status</th>
                            <th>Downtime</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.jobs
                            .slice(-50)
                            .reverse()
                            .map((j) => (
                              <tr key={j.id}>
                                <td>{j.id}</td>
                                <td>{j.vehicle}</td>
                                <td>{j.orders.length}</td>
                                <td>{j.units}</td>
                                <td>{fmt(j.started)}m</td>
                                <td>{j.status}</td>
                                <td>{j.downtime ?? 0}m</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                </>
              )}
              {page === "Scenario Lab" && scenario && (
                <>
                  <div className="scenario-intro">
                    <FlaskConical size={24} />
                    <div>
                      <h3>A controlled experiment, every time.</h3>
                      <p>
                        Identical shift duration. Paired seeds. Independent
                        replications. Reported 95% confidence intervals.
                      </p>
                    </div>
                    <span>{replications} REPLICATIONS</span>
                  </div>
                  <div className="scenario-layout">
                    <Section
                      title="Configure your scenario"
                      eyebrow="EXPERIMENT DESIGN"
                    >
                      <label className="field-label">
                        Scenario preset
                        <select
                          onChange={(e) => {
                            const changes = scenarioPresets[e.target.value];
                            if (changes) {
                              setScenario({ ...config, ...changes });
                              setScenarioName(e.target.value);
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>
                            Select a disruption or improvement
                          </option>
                          {Object.keys(scenarioPresets).map((k) => (
                            <option key={k}>{k}</option>
                          ))}
                        </select>
                      </label>
                      {saved.length > 0 && (
                        <label className="field-label">
                          Saved scenarios
                          <select
                            defaultValue=""
                            onChange={(e) => {
                              const s = saved.find(
                                (s) => s.id === e.target.value,
                              );
                              if (s) {
                                setScenario(s.config);
                                setScenarioName(s.name);
                              }
                            }}
                          >
                            <option value="" disabled>
                              Load a custom scenario
                            </option>
                            {saved.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="baseline-note">
                        <b>Baseline: {config.name}</b>
                        <span>
                          {config.workers} workers · {config.picking_stations}{" "}
                          picking stations · {config.fleet_size} vehicles ·{" "}
                          {config.arrival_rate} orders/h
                        </span>
                        <small>
                          The configured model is the baseline; an active live
                          run is independent.
                        </small>
                      </div>
                      <label className="field-label">
                        Scenario name
                        <input
                          value={scenarioName}
                          maxLength={80}
                          onChange={(e) => setScenarioName(e.target.value)}
                        />
                      </label>
                      <ConfigFields
                        config={scenario}
                        setConfig={setScenario}
                        compact
                      />
                      <div className="experiment-actions">
                        <label>
                          Replications
                          <input
                            type="number"
                            min="2"
                            max="20"
                            value={replications}
                            onChange={(e) =>
                              setReplications(Number(e.target.value))
                            }
                          />
                        </label>
                        <Button
                          disabled={busy || !!working}
                          onClick={startComparison}
                        >
                          {working ? (
                            <Loader2 size={16} className="spin" />
                          ) : (
                            <Play size={16} />
                          )}{" "}
                          Compare
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={saveScenario}
                        >
                          Save scenario
                        </Button>
                      </div>
                      <p className="footnote">
                        Scenario duration and seed are overridden by baseline
                        duration and paired baseline seeds. A demand change is
                        explicitly flagged.
                      </p>
                    </Section>
                    <Section
                      title="Baseline vs. scenario"
                      eyebrow="SIMULATED OUTCOMES"
                      action={
                        comparison && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              exportExperiment(comparison, "digilog-comparison")
                            }
                          >
                            <ArrowDownToLine size={14} />
                            JSON
                          </Button>
                        )
                      }
                    >
                      {working ? (
                        <div className="empty">
                          <Loader2 className="spin" /> Running experiment… You
                          can continue viewing the live twin.
                        </div>
                      ) : comparison ? (
                        <>
                          <div className="comparison-meta">
                            {comparison.replications} replications ·{" "}
                            {comparison.duration} min · seeds{" "}
                            {comparison.seeds.join(", ")}
                            {comparison.demand_changed && (
                              <strong>
                                Demand differs: compare as a stress test, not a
                                resource-only intervention.
                              </strong>
                            )}
                          </div>
                          <div className="table-scroll">
                            <table className="comparison-table">
                              <thead>
                                <tr>
                                  <th>Metric</th>
                                  <th>Baseline</th>
                                  <th>Scenario</th>
                                  <th>Paired difference</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(comparison.metrics).map(
                                  ([key, row]) => (
                                    <tr key={key}>
                                      <td>{key.replaceAll("_", " ")}</td>
                                      <td>
                                        <IntervalCell
                                          v={row.baseline}
                                          percent={
                                            key === "sla" ||
                                            key === "fleet_utilization"
                                          }
                                        />
                                      </td>
                                      <td>
                                        <IntervalCell
                                          v={row.scenario}
                                          percent={
                                            key === "sla" ||
                                            key === "fleet_utilization"
                                          }
                                        />
                                      </td>
                                      <td>
                                        <IntervalCell
                                          v={row.difference}
                                          percent={
                                            key === "sla" ||
                                            key === "fleet_utilization"
                                          }
                                        />
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          </div>
                          <p className="footnote">
                            Values show mean and 95% Student-t confidence
                            interval. Differences are scenario minus baseline;
                            rate differences are percentage points. Time in
                            minutes, cost in USD. Intervals describe mean
                            uncertainty and may extend beyond physical bounds.
                          </p>
                          <h4 className="inset-heading">
                            Resource utilization · baseline → scenario
                          </h4>
                          {Object.entries(comparison.resource_utilization).map(
                            ([key, v]) => (
                              <div className="comparison-resource" key={key}>
                                <span>{key}</span>
                                <b>
                                  {fmt(v.baseline.mean, "percent")} →{" "}
                                  {fmt(v.scenario.mean, "percent")}
                                </b>
                              </div>
                            ),
                          )}
                          <div className="baseline-note">
                            <b>Bottlenecks across replications</b>
                            <span>
                              Baseline:{" "}
                              {comparison.bottlenecks.baseline.join(", ")}
                            </span>
                            <span>
                              Scenario:{" "}
                              {comparison.bottlenecks.scenario.join(", ")}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="empty">
                          <GitBranch size={34} />
                          <h3>Your next decision starts here</h3>
                          <p>
                            Adjust a scenario and run a paired comparison to
                            quantify the operational difference.
                          </p>
                        </div>
                      )}
                    </Section>
                  </div>
                </>
              )}
              {page === "AI Recommendations" && (
                <>
                  <div className="scenario-intro">
                    <Lightbulb size={24} />
                    <div>
                      <h3>Explainable decision support</h3>
                      <p>
                        Transparent rules tied to simulation evidence. No LLM,
                        paid API, or unvalidated predictive model.
                      </p>
                    </div>
                    <span>RULE-BASED</span>
                  </div>
                  <div className="recommendation-grid">
                    {recs.map((rec, i) => (
                      <Section
                        key={rec.title}
                        title={rec.title}
                        eyebrow={`RECOMMENDATION 0${i + 1}`}
                      >
                        <p className="recommendation-evidence">
                          {rec.evidence}
                        </p>
                        <div className="rule-explanation">
                          <b>Why this appeared</b>
                          <p>
                            {rec.title.includes("picking")
                              ? "Picking queue ≥ 3. Test another station and handling unit."
                              : rec.title.includes("vehicle")
                                ? "Dispatch queue ≥ 3. Test another available vehicle."
                                : rec.title.includes("workers")
                                  ? "Time-weighted worker utilization > 80%."
                                  : rec.title.includes("storage")
                                    ? "Receiving queue ≥ 3 and storage occupancy > 85%."
                                    : "No configured intervention threshold was crossed."}
                          </p>
                          <small>{rec.method}</small>
                        </div>
                        {Object.keys(rec.suggested_changes).length > 0 && (
                          <>
                            <div className="change-chips">
                              {Object.entries(rec.suggested_changes).map(
                                ([k, v]) => (
                                  <span key={k}>
                                    {k.replaceAll("_", " ")} → {v}
                                  </span>
                                ),
                              )}
                            </div>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setScenario({
                                  ...run.config,
                                  ...rec.suggested_changes,
                                });
                                setConfig(run.config);
                                setScenarioName(rec.title);
                                setPage("Scenario Lab");
                              }}
                            >
                              Test in Scenario Lab <ArrowRight size={15} />
                            </Button>
                          </>
                        )}
                      </Section>
                    ))}
                  </div>
                  <p className="footnote">
                    These interventions have no claimed improvement until
                    tested. Station occupancy can include time awaiting a worker
                    or equipment; inspect coupled constraints together.
                  </p>
                </>
              )}
              {page === "Optimization" && (
                <>
                  <div className="two-column">
                    <Section
                      title="Search configuration"
                      eyebrow="BOUNDED EXPERIMENT"
                    >
                      <p className="explainer">
                        Minimize average shift cost while maintaining the target
                        SLA lower confidence bound. Search workers ±2, picking
                        stations ±1, vehicles ±1 around your configured model;
                        equipment stays fixed.
                      </p>
                      <label className="field-label">
                        Target SLA
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step=".05"
                          value={target}
                          onChange={(e) => setTarget(Number(e.target.value))}
                        />
                      </label>
                      <label className="field-label">
                        Maximum configurations
                        <input
                          type="number"
                          min="3"
                          max="30"
                          value={trials}
                          onChange={(e) => setTrials(Number(e.target.value))}
                        />
                      </label>
                      <p className="footnote">
                        Three paired-seed replications per configuration.
                        Conservative 95% lower-bound constraint; no feasible
                        result is a valid outcome.
                      </p>
                      <Button
                        disabled={busy || !!working}
                        onClick={() =>
                          attempt(async () => {
                            setExperiment(
                              await api<Task<Optimization>>("/optimizations", {
                                config,
                                target_sla: target,
                                trials,
                                replications: 3,
                              }),
                            );
                          })
                        }
                      >
                        {working ? (
                          <Loader2 className="spin" size={16} />
                        ) : (
                          <Target size={16} />
                        )}{" "}
                        Run bounded search
                      </Button>
                    </Section>
                    <Section
                      title="Recommended configuration"
                      eyebrow="COST / SERVICE TRADE-OFF"
                    >
                      {optimization ? (
                        <>
                          <div className="optimization-result">
                            <h2>
                              {optimization.recommended
                                ? "Feasible candidate found"
                                : "No feasible candidate"}
                            </h2>
                            <p>{optimization.constraint}</p>
                            {optimization.recommended && (
                              <>
                                <div className="change-chips">
                                  <span>
                                    {optimization.recommended.workers} workers
                                  </span>
                                  <span>
                                    {optimization.recommended.picking_stations}{" "}
                                    picking stations
                                  </span>
                                  <span>
                                    {optimization.recommended.fleet_size}{" "}
                                    vehicles
                                  </span>
                                </div>
                                <strong>
                                  {fmt(
                                    optimization.recommended.cost.mean,
                                    "money",
                                  )}{" "}
                                  <small>mean shift cost</small>
                                </strong>
                                <p>
                                  {fmt(optimization.estimated_savings, "money")}{" "}
                                  estimated savings relative to the tested
                                  baseline.
                                </p>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    const r = optimization.recommended!;
                                    setScenario({
                                      ...config,
                                      workers: r.workers,
                                      picking_stations: r.picking_stations,
                                      fleet_size: r.fleet_size,
                                    });
                                    setScenarioName("Optimization validation");
                                    setPage("Scenario Lab");
                                  }}
                                >
                                  Validate in Scenario Lab{" "}
                                  <ArrowRight size={15} />
                                </Button>
                              </>
                            )}
                          </div>
                          <p className="footnote">{optimization.limitations}</p>
                        </>
                      ) : (
                        <div className="empty">
                          <Target size={34} />
                          <h3>Explore your resource trade-offs</h3>
                          <p>
                            Test configurations against cost and service
                            constraints.
                          </p>
                        </div>
                      )}
                    </Section>
                  </div>
                  {optimization && (
                    <Section
                      title="Tested configurations"
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            exportExperiment(
                              optimization,
                              "digilog-optimization",
                            )
                          }
                        >
                          Export JSON
                        </Button>
                      }
                    >
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Workers</th>
                              <th>Picking stations</th>
                              <th>Vehicles</th>
                              <th>Mean cost / 95% CI</th>
                              <th>Mean SLA / 95% CI</th>
                              <th>Delivered / 95% CI</th>
                              <th>Constraint</th>
                            </tr>
                          </thead>
                          <tbody>
                            {optimization.tested.map((t, i) => (
                              <tr key={i}>
                                <td>{t.workers}</td>
                                <td>{t.picking_stations}</td>
                                <td>{t.fleet_size}</td>
                                <td>
                                  <IntervalCell v={t.cost} />
                                </td>
                                <td>
                                  <IntervalCell v={t.sla} percent />
                                </td>
                                <td>
                                  <IntervalCell v={t.throughput} />
                                </td>
                                <td>
                                  <span
                                    className={
                                      "table-tag " +
                                      (t.feasible ? "success" : "")
                                    }
                                  >
                                    {t.feasible ? "Feasible" : "Below target"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Section>
                  )}
                </>
              )}
              {page === "Reports" && (
                <>
                  <Section
                    title="Simulation report"
                    eyebrow="SYNTHETIC OPERATIONS · DECISION SUPPORT"
                    action={
                      <div className="button-group">
                        <Button
                          variant="outline"
                          onClick={() => window.print()}
                        >
                          Print report
                        </Button>
                        <Button asChild>
                          <a
                            href={"/api/runs/" + run.id + "/export.csv"}
                            download
                          >
                            <ArrowDownToLine size={16} />
                            Export CSV
                          </a>
                        </Button>
                      </div>
                    }
                  >
                    <div className="report-meta">
                      <b>{run.config.name}</b>
                      <span>Run {run.id}</span>
                      <span>
                        Created {run.created_at} · seed {run.config.seed} ·
                        simulated minute {fmt(run.clock)} /{" "}
                        {run.config.duration} · {run.status}
                      </span>
                    </div>
                    <div className="report-grid">
                      {Object.entries(m)
                        .filter(([, v]) => typeof v !== "object" || v === null)
                        .map(([key, v]) => (
                          <div key={key}>
                            <span>{key.replaceAll("_", " ")}</span>
                            <b>
                              {typeof v === "number"
                                ? fmt(v)
                                : String(v ?? "No observations")}
                            </b>
                          </div>
                        ))}
                    </div>
                    <h4 className="inset-heading">
                      Configuration & assumptions
                    </h4>
                    <div className="report-grid">
                      {Object.entries(run.config).map(([k, v]) => (
                        <div key={k}>
                          <span>{k.replaceAll("_", " ")}</span>
                          <b>{v}</b>
                        </div>
                      ))}
                    </div>
                    <p className="explainer">
                      Minutes, km, item units and USD. Poisson demand, lognormal
                      service times, fictional labor and operating rates.
                      Warehouse throughput counts completed deliveries. SLA
                      counts completed deliveries and overdue unfinished orders.
                      No warm-up or post-shift drain. See the repository
                      assumptions document for metric definitions.
                    </p>
                    <h4 className="inset-heading">
                      Evidence & recommendations
                    </h4>
                    {recs.map((r) => (
                      <p key={r.title} className="explainer">
                        <b>{r.title}.</b> {r.evidence} {r.method}.
                      </p>
                    ))}
                    <h4 className="inset-heading">
                      Expected improvement & limitations
                    </h4>
                    <p className="explainer">
                      {comparison
                        ? `Last comparison (${comparison.replications} replications): mean delivered-order difference ${fmt(comparison.metrics.throughput.difference.mean)}, mean cost difference ${fmt(comparison.metrics.cost.difference.mean, "money")}. This experiment may use a different configuration from the current live run; its configurations and intervals are available in Scenario Lab and JSON export.`
                        : "No comparison has been run in this session. Improvement is unmeasured."}{" "}
                      This model uses synthetic data only. It models a fictional
                      logistics operation for portfolio demonstration. No
                      production integration, trained predictive model, or
                      optimized real-world route is included.
                    </p>
                  </Section>
                  <Section
                    title="Saved experiments"
                    eyebrow="LOCAL SQLITE HISTORY"
                  >
                    {archives.length ? (
                      archives.map((a) => (
                        <div className="archive-row" key={a.id}>
                          <div>
                            <b>{a.kind}</b>
                            <small>{a.id}</small>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (a.result)
                                exportExperiment(a.result, "digilog-" + a.id);
                            }}
                          >
                            Download JSON
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="explainer">
                        Completed comparisons and optimization jobs are saved
                        locally.
                      </p>
                    )}
                  </Section>
                </>
              )}
              {page === "Settings" && (
                <div className="two-column">
                  <Section
                    title="Model configuration"
                    eyebrow="APPLIES TO A NEW RUN"
                  >
                    <label className="field-label">
                      Environment name
                      <input
                        value={config.name}
                        maxLength={80}
                        onChange={(e) =>
                          setConfig({ ...config, name: e.target.value })
                        }
                      />
                    </label>
                    <ConfigFields config={config} setConfig={setConfig} />
                    <Button disabled={busy} onClick={() => createRun(config)}>
                      <Plus size={16} />
                      Create configured run
                    </Button>
                  </Section>
                  <div>
                    <Section title="Privacy & model boundaries">
                      <div className="privacy-note">
                        <ShieldCheck size={29} />
                        <h3>Local. Synthetic. Reproducible.</h3>
                        <p>
                          No application telemetry, external data feeds,
                          embedded credentials, or paid APIs. SQLite holds local
                          reports and scenarios. All operating inputs are
                          fictional.
                        </p>
                        <p>
                          The API has no authentication and is intended for
                          localhost development only. Do not expose it publicly.
                        </p>
                        <p>
                          Configuration changes create a new run. Existing runs
                          keep immutable resource capacities so comparisons
                          remain reproducible.
                        </p>
                        <a
                          href="http://127.0.0.1:8000/docs"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open local API documentation ↗
                        </a>
                      </div>
                    </Section>
                  </div>
                </div>
              )}
              <footer>
                <span>
                  <ShieldCheck size={13} /> All data and outcomes are simulated.
                  Independent personal project.
                </span>
                <span>
                  DigiLog · Digital Twin POC{" "}
                  <span className="footer-version">v1.0</span>
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {drawer && config && (
        <div className="drawer-overlay" onClick={() => setDrawer(false)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Configure model"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">SIMULATION INPUTS</span>
                <h2>Configure model</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close configuration"
                onClick={() => setDrawer(false)}
              >
                <X size={20} />
              </Button>
            </div>
            <p className="explainer">
              Changes create a new reproducible run. Current run resources
              remain fixed.
            </p>
            <ConfigFields config={config} setConfig={setConfig} />
            <div className="drawer-footer">
              <Button disabled={busy} onClick={() => createRun(config)}>
                <Plus size={16} />
                Apply & create new run
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
