import asyncio
import copy
import os
from pathlib import Path
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from threading import RLock
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.docs import get_swagger_ui_html
from .schemas import Config, Control, Comparison, Optimization, Scenario, PRESETS, SCENARIOS
from .engine import Twin
from .analysis import compare, optimize, recommendations
from . import store

runs = {}
jobs = {}
lock = RLock()
pool = ThreadPoolExecutor(max_workers=2)

async def ticker():
    while True:
        await asyncio.sleep(.25)
        with lock:
            for run in runs.values():
                if run["status"] == "running":
                    run["twin"].advance(run["speed"] * .25)
                    if run["twin"].env.now >= run["twin"].config.duration:
                        run["status"] = "completed"
                        store.save(run["id"], "run", view(run))

@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(ticker())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="DigiLog Logistics Digital Twin", description="Synthetic logistics decision-support POC. Minutes / km / item units / USD.", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET","POST"], allow_headers=["Content-Type"])

def get_run(key):
    if key not in runs:
        raise HTTPException(404, "Simulation run not found. Create a new run after a server restart.")
    return runs[key]
def view(run):
    return copy.deepcopy({"id": run["id"], "status": run["status"], "speed": run["speed"], "created_at": run["created_at"], **run["twin"].snapshot()})

@app.get("/api/health")
def health():
    return {"status": "ok", "synthetic_only": True}
@app.get("/api/configurations")
def configurations():
    return {"presets": {key: c.model_dump() for key,c in PRESETS.items()}, "scenarios": SCENARIOS}
@app.post("/api/runs", status_code=201)
def create(config: Config):
    with lock:
        if len(runs) >= 30:
            removable = next((k for k,r in runs.items() if r["status"] != "running"), None)
            if removable is None:
                raise HTTPException(429, "Pause an existing run before creating another.")
            del runs[removable]
        key = str(uuid.uuid4())
        runs[key] = {"id": key, "status": "ready", "speed": 10, "twin": Twin(config), "created_at": datetime.now(timezone.utc).isoformat()}
        return view(runs[key])
@app.get("/api/runs/{key}")
def state(key: str):
    with lock:
        return view(get_run(key))
@app.post("/api/runs/{key}/control")
def control(key: str, command: Control):
    with lock:
        run = get_run(key)
        if command.action in ("start", "resume"):
            if run["twin"].env.now >= run["twin"].config.duration:
                raise HTTPException(409, "Shift complete. Reset to run it again.")
            run["status"] = "running"
        elif command.action == "pause":
            run["status"] = "paused" if run["status"] != "completed" else "completed"
        elif command.action == "reset":
            run["twin"] = Twin(run["twin"].config)
            run["status"] = "ready"
        elif command.action == "speed":
            run["speed"] = command.speed
        elif command.action in ("step", "finish"):
            run["status"] = "paused"
            run["twin"].advance(command.minutes if command.action == "step" else run["twin"].config.duration)
            if run["twin"].env.now >= run["twin"].config.duration:
                run["status"] = "completed"
        result = view(run)
        if run["status"] == "completed":
            store.save(key, "run", result)
        return result
@app.get("/api/runs/{key}/metrics")
def metrics(key: str):
    with lock:
        return get_run(key)["twin"].metrics()
@app.get("/api/runs/{key}/events")
def events(key: str, offset: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=1000)):
    with lock:
        return copy.deepcopy(get_run(key)["twin"].events[offset:offset+limit])
@app.get("/api/runs/{key}/recommendations")
def recommend(key: str):
    with lock:
        t = get_run(key)["twin"]
        return recommendations(t.metrics(),t.config)
@app.get("/api/scenarios")
def scenarios():
    return store.list_kind("scenario")
@app.post("/api/scenarios", status_code=201)
def save_scenario(scenario: Scenario):
    payload = {"id": str(uuid.uuid4()), **scenario.model_dump()}
    store.save(payload["id"], "scenario", payload)
    return payload

def submit(kind, fn, request):
    with lock:
        if sum(j["status"] in ("queued", "running") for j in jobs.values()) >= 4:
            raise HTTPException(429, "Experiment queue is full. Wait for a running job.")
        key = str(uuid.uuid4())
        jobs[key] = {"id": key, "kind": kind, "status": "queued", "result": None, "error": None}
    def execute():
        with lock:
            jobs[key]["status"] = "running"
        try:
            result = fn(request)
            with lock:
                jobs[key].update(status="completed", result=result)
                store.save(key, "experiment", copy.deepcopy(jobs[key]))
        except Exception:
            with lock:
                jobs[key].update(status="failed", error="Experiment failed. Check the local server logs and retry with a smaller configuration.")
            import logging
            logging.exception("Experiment %s failed", key)
    pool.submit(execute)
    with lock:
        return copy.deepcopy(jobs[key])
@app.post("/api/comparisons", status_code=202)
def comparison(request: Comparison):
    return submit("comparison", compare, request)
@app.post("/api/optimizations", status_code=202)
def optimization(request: Optimization):
    return submit("optimization", optimize, request)
@app.get("/api/jobs/{key}")
def job(key: str):
    with lock:
        if key not in jobs:
            raise HTTPException(404,"Job not found")
        return copy.deepcopy(jobs[key])
@app.get("/api/experiments")
def experiments():
    return store.list_kind("experiment")
@app.get("/api/runs/{key}/report")
def report(key: str):
    with lock:
        r = view(get_run(key))
        r["recommendations"] = recommendations(r["metrics"], get_run(key)["twin"].config)
        r["assumptions"] = "Synthetic only. Minutes, km, units, USD. Poisson arrivals; lognormal service; fictional radial delivery batches. No real routing. Completed-order cycle/wait means; SLA includes overdue unfinished orders. No warm-up or drain."
        r["limitations"] = "Decision support only. No learned model. Recommendations are unvalidated until compared. Costs are fictional. Batch trips approximate multiple destinations using the farthest distance. No enterprise data or systems."
        return r
@app.get("/api/runs/{key}/export.csv")
def export(key: str):
    r = report(key)
    rows = [{"section":"metadata", "key":k, "value":str(r[k])} for k in ("id","created_at","clock","status","synthetic","assumptions","limitations")]
    for section in ("config","metrics"):
        rows += [{"section":section,"key":k,"value":str(v)} for k,v in r[section].items()]
    rows += [{"section":"recommendation","key":x["title"],"value":x["evidence"]} for x in r["recommendations"]]
    return Response(pd.DataFrame(rows).to_csv(index=False), media_type="text/csv", headers={"Content-Disposition":f'attachment; filename="digilog-{key}.csv"'})

# Documentation assets are bundled locally; browsing /docs makes no CDN requests.
app.mount("/docs-assets", StaticFiles(directory=Path(__file__).parent / "static"), name="docs-assets")
@app.get("/docs", include_in_schema=False)
def docs():
    return get_swagger_ui_html(openapi_url="/openapi.json", title="DigiLog API", swagger_js_url="/docs-assets/swagger-ui-bundle.js", swagger_css_url="/docs-assets/swagger-ui.css", swagger_favicon_url="/docs-assets/favicon-32x32.png", swagger_ui_parameters={"validatorUrl": None, "persistAuthorization": False})

frontend = os.environ.get("DIGILOG_FRONTEND")
if frontend:
    app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
