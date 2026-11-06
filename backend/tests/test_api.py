import time
import pytest
from fastapi.testclient import TestClient
from digilog import main, store
from digilog.schemas import Config

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(store,'DB',tmp_path/'test.sqlite3')
    main.runs.clear()
    main.jobs.clear()
    with TestClient(main.app) as c:
        yield c

def new(client):
    response = client.post('/api/runs',json=Config(duration=120).model_dump())
    assert response.status_code == 201
    return response.json()['id']

def wait_job(client,key):
    for _ in range(200):
        result=client.get('/api/jobs/'+key).json()
        if result['status'] in ('completed','failed'):
            return result
        time.sleep(.02)
    pytest.fail('Job timed out')

def test_controls_clock_reset_and_export(client):
    key = new(client)
    assert client.post(f'/api/runs/{key}/control',json={'action':'step','minutes':30}).json()['clock'] == 30
    client.post(f'/api/runs/{key}/control',json={'action':'start'})
    time.sleep(.3)
    paused=client.post(f'/api/runs/{key}/control',json={'action':'pause'}).json()
    assert paused['clock'] > 30
    time.sleep(.3)
    assert client.get(f'/api/runs/{key}').json()['clock'] == paused['clock']
    final=client.post(f'/api/runs/{key}/control',json={'action':'finish'}).json()
    assert final['status'] == 'completed' and final['clock'] == 120
    assert client.post(f'/api/runs/{key}/control',json={'action':'start'}).status_code == 409
    response=client.get(f'/api/runs/{key}/export.csv')
    assert response.status_code == 200 and 'text/csv' in response.headers['content-type']
    assert 'assumptions' in response.text and 'warehouse_capacity' in response.text
    report=client.get(f'/api/runs/{key}/report').json()
    assert report['metrics'] == final['metrics']
    assert report['recommendations']
    reset=client.post(f'/api/runs/{key}/control',json={'action':'reset'}).json()
    assert reset['clock']==0 and reset['orders']==[] and reset['metrics']['cost']==0

def test_frontend_state_matches_authoritative_metrics_and_events(client):
    key=new(client)
    state=client.post(f'/api/runs/{key}/control',json={'action':'finish'}).json()
    assert state['metrics']==client.get(f'/api/runs/{key}/metrics').json()
    assert state['metrics']['throughput']==sum('completed' in o for o in state['orders'])
    assert client.get(f'/api/runs/{key}/events?limit=2').json()==main.runs[key]['twin'].events[:2]
    assert client.get(f'/api/runs/{key}/recommendations').status_code==200

def test_api_validation_and_errors(client):
    assert client.post('/api/runs',json={'workers':0}).status_code==422
    assert client.post('/api/runs',json={'unexpected':1}).status_code==422
    assert client.get('/api/runs/missing').status_code==404
    assert client.get('/api/jobs/missing').status_code==404
    key=new(client)
    assert client.post(f'/api/runs/{key}/control',json={'action':'speed','speed':0}).status_code==422
    assert client.get(f'/api/runs/{key}/events?offset=-1').status_code==422
    assert client.post('/api/comparisons',json={'baseline':{},'scenario':{},'replications':1}).status_code==422
    assert client.get('/openapi.json').status_code==200

def test_scenarios_and_async_comparison_persist(client):
    c=Config(duration=60).model_dump()
    assert client.post('/api/scenarios',json={'name':'Custom','config':c}).status_code==201
    assert client.get('/api/scenarios').json()[0]['name']=='Custom'
    queued=client.post('/api/comparisons',json={'baseline':c,'scenario':c,'replications':2})
    assert queued.status_code==202
    job=wait_job(client,queued.json()['id'])
    assert job['status']=='completed'
    assert job['result']['metrics']['throughput']['difference']['mean']==0
    assert client.get('/api/experiments').json()[0]['id']==job['id']

def test_optimization_job_and_failure_status(client,monkeypatch):
    c=Config(duration=60).model_dump()
    q=client.post('/api/optimizations',json={'config':c,'trials':3,'replications':2,'target_sla':.5})
    assert q.status_code==202
    assert wait_job(client,q.json()['id'])['result']['tested']
    def fail(req):
        raise RuntimeError('private details')
    monkeypatch.setattr(main,'compare',fail)
    q=client.post('/api/comparisons',json={'baseline':c,'scenario':c,'replications':2})
    failed=wait_job(client,q.json()['id'])
    assert failed['status']=='failed' and 'private details' not in failed['error']


def test_documentation_assets_are_local(client):
    response = client.get('/docs')
    assert response.status_code == 200
    assert '/docs-assets/swagger-ui-bundle.js' in response.text
    assert 'cdn.jsdelivr' not in response.text
    assert client.get('/docs-assets/swagger-ui.css').status_code == 200
