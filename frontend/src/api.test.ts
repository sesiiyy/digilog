import { describe, it, expect } from "vitest";
import { fmt } from "./api";
import type { Run, Config } from "./types";
declare const process: { env: Record<string, string | undefined> };
describe("simulation metric presentation", () => {
  it("preserves missing observations rather than implying perfect service", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined, "percent")).toBe("—");
    expect(fmt(0, "percent")).toBe("0.0%");
  });
  it("uses consistent display units", () => {
    expect(fmt(0.845, "percent")).toBe("84.5%");
    expect(fmt(1234, "money")).toBe("$1,234");
    expect(fmt(12.36)).toBe("12.4");
  });
});
describe.skipIf(!process.env.DIGILOG_API)("live FastAPI contract", () => {
  it("frontend-visible metrics correspond to the backend event state", async () => {
    const base = process.env.DIGILOG_API!;
    const configs = (await fetch(base + "/configurations").then((r) =>
      r.json(),
    )) as { presets: { small: Config } };
    const run = (await fetch(base + "/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...configs.presets.small, duration: 120 }),
    }).then((r) => r.json())) as Run;
    const state = (await fetch(base + "/runs/" + run.id + "/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finish" }),
    }).then((r) => r.json())) as Run;
    const metrics = await fetch(base + "/runs/" + run.id + "/metrics").then(
      (r) => r.json(),
    );
    expect(state.metrics).toEqual(metrics);
    expect(state.metrics.throughput).toBe(
      state.orders.filter((o) => o.completed !== undefined).length,
    );
    expect(state.metrics.active + state.metrics.throughput).toBe(
      state.orders.length,
    );
    expect(fmt(state.metrics.sla, "percent")).toBe(
      state.metrics.sla === null
        ? "—"
        : (state.metrics.sla * 100).toFixed(1) + "%",
    );
    expect(state.clock).toBe(120);
  });
});
