import { memo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type NodeProps,
  type Node,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Package,
  Truck,
  ScanLine,
  Layers,
  Boxes,
  CheckCheck,
} from "lucide-react";
import type { Run, Order } from "./types";
import { fmt } from "./api";
const stages = [
  "receiving",
  "putaway",
  "picking",
  "packing",
  "dispatch",
  "delivery",
];
const labels = [
  "Receiving",
  "Put-away",
  "Picking",
  "Packing",
  "Dispatch",
  "Delivery",
];
const icons = [ScanLine, Layers, Boxes, Package, Truck, CheckCheck];
type StageNode = Node<
  {
    index: number;
    orders: Order[];
    queue: number;
    busy: number;
    capacity: number;
    bottleneck: boolean;
    agents: { id: string; order: string; kind: string }[];
    inventory: [string, number][];
  },
  "station"
>;
const Station = memo(({ data }: NodeProps<StageNode>) => {
  const Icon = icons[data.index];
  return (
    <div className={"station " + (data.bottleneck ? "station-alert" : "")}>
      <Handle type="target" position={Position.Left} />
      <div className="station-top">
        <span className="station-icon">
          <Icon size={20} />
        </span>
        <span className="station-number">0{data.index + 1}</span>
      </div>
      <strong>{labels[data.index]}</strong>
      <span className="stage-sub">
        {data.index === 1
          ? "Storage zones A · B · C"
          : data.index === 5
            ? "Fictional delivery network"
            : `${data.busy} / ${data.capacity} resources occupied`}
      </span>
      {data.index === 1 && (
        <div className="racks">
          {data.inventory.map(([location, units]) => (
            <i
              key={location}
              className={units ? "rack-occupied" : ""}
              title={`${location}: ${units} stored units`}
            >
              {units || ""}
            </i>
          ))}
        </div>
      )}
      <div className="order-tokens">
        {data.orders.slice(0, 8).map((o) => (
          <span
            key={o.id}
            title={`${o.id} · ${o.status} · ${o.units} units`}
            className={
              o.status === "processing" || o.status === "loading"
                ? "token processing"
                : "token"
            }
          >
            {o.id.slice(-2)}
          </span>
        ))}
        {data.orders.length > 8 && <small>+{data.orders.length - 8}</small>}
      </div>
      <div className="agent-markers">
        {data.agents.map((a) => (
          <span
            key={a.id}
            title={`${a.id} assigned to ${a.order}`}
            className={a.kind}
          >
            {a.id}
          </span>
        ))}
      </div>
      <div className="station-foot">
        <span>{data.orders.length} active</span>
        <b>{data.queue} queued</b>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
const nodeTypes = { station: Station };
export default function Twin({ run }: { run: Run }) {
  const [selected, setSelected] = useState<string | null>(null);
  const nodes: StageNode[] = stages.map((stage, i) => ({
    id: stage,
    type: "station",
    position: { x: (i % 3) * 285, y: i < 3 ? 30 : 315 },
    data: {
      index: i,
      orders: run.orders.filter(
        (o) => o.stage === stage && o.status !== "completed",
      ),
      queue: run.metrics.queues[stage],
      busy:
        run.resources[stage]?.busy ??
        run.config.fleet_size - run.metrics.available_vehicles,
      capacity: run.resources[stage]?.capacity ?? run.config.fleet_size,
      bottleneck: run.metrics.bottleneck === stage,
      agents: Object.entries(run.agents).flatMap(([kind, agents]) =>
        agents.filter((a) => a.stage === stage).map((a) => ({ ...a, kind })),
      ),
      inventory: Array.from({ length: 24 }, (_, i) => {
        const location = `Z${Math.floor(i / 8) + 1}-R${(i % 8) + 1}`;
        return [location, run.inventory_locations[location] ?? 0] as [
          string,
          number,
        ];
      }),
    },
  }));
  const edges = stages.slice(1).map((stage, i) => ({
    id: `e${i}`,
    source: stages[i],
    target: stage,
    type: "smoothstep",
    animated: run.status === "running",
    style: { stroke: "#4b8d91", strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#4b8d91" },
  }));
  const orders = run.orders.filter(
    (o) => o.stage === selected && o.status !== "completed",
  );
  return (
    <>
      <div className="twin-canvas">
        <div className="floor-label">
          WH-01 <span>SIMULATED FACILITY / PROCESS VIEW</span>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.14 }}
          minZoom={0.4}
          maxZoom={1.3}
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_, n) => setSelected(n.id)}
        >
          <Background color="#2e4650" gap={22} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
        <div className="canvas-legend">
          <span>
            <i className="legend-dot" /> Processing
          </span>
          <span>
            <i className="legend-dot queued" /> Waiting
          </span>
          <span>
            <i className="legend-dot alert" /> Bottleneck
          </span>
          <span>Click a station to inspect orders</span>
        </div>
      </div>
      {selected && (
        <div className="station-detail">
          <div className="section-heading">
            <h3>{selected} · active orders</h3>
            <button onClick={() => setSelected(null)}>Close ×</button>
          </div>
          <div className="order-strip">
            {orders.length ? (
              orders.slice(0, 30).map((o) => (
                <span key={o.id}>
                  {o.id} · {o.units} units · {o.status} · since{" "}
                  {fmt(o.stage_since)}m
                </span>
              ))
            ) : (
              <p>No active orders at this station.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
