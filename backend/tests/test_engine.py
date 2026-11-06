import pytest
from digilog.engine import Twin, simulate, STAGES
from digilog.schemas import Config, Comparison, Optimization
from digilog.analysis import compare, optimize, interval, recommendations


def test_reproducibility_and_step_equivalence():
    c = Config(duration=240)
    a, b = Twin(c), Twin(c)
    a.advance(240)
    for _ in range(24):
        b.advance(10)
    assert a.metrics() == b.metrics()
    assert a.events == b.events
    assert a.orders == b.orders


def test_conservation_at_every_checkpoint():
    t = Twin(Config(warehouse_capacity=30, arrival_rate=80, duration=300, fleet_size=1))
    for _ in range(60):
        s = t.advance(5)
        m = s['metrics']
        assert m['arrived'] == m['active'] + m['throughput']
        assert m['inventory_units'] == m['received_units'] - m['dispatched_units']
        assert 0 <= m['inventory_units'] <= m['reserved_units'] <= 30
        stored = sum(o['units'] for o in t.orders if o.get('received') and not (o['stage'] == 'delivery'))
        assert stored == m['inventory_units']
        assert all(0 <= v <= 1.00001 for v in m['utilization'].values())
        assert all(r['busy'] <= r['capacity'] for r in s['resources'].values())


def test_order_lifecycle_and_fleet_capacity():
    t = Twin(Config(duration=480))
    t.advance(480)
    complete = [o for o in t.orders if 'completed' in o]
    assert complete
    for o in complete:
        transitions = [e for e in t.events if e['order'] == o['id']]
        stages = list(dict.fromkeys(e['stage'] for e in transitions))
        assert stages == STAGES
        assert o['created'] < o['completed']
        assert o['vehicle']
        assert o['wait'] >= 0
    for job in t.jobs:
        assert 0 < job['units'] <= t.config.vehicle_capacity
        assert len(job['orders']) == len(set(job['orders']))
    for vehicle in t.data['vehicles']:
        trips = [j for j in t.jobs if j['vehicle'] == vehicle['id']]
        for prev, nxt in zip(trips, trips[1:]):
            assert prev['returned'] <= nxt['started']


def test_metrics_are_derived_from_orders():
    t = Twin(Config())
    t.advance(480)
    m = t.metrics()
    done = [o for o in t.orders if 'completed' in o]
    assert m['throughput'] == len(done)
    assert m['processing_time'] == pytest.approx(sum(o['completed']-o['created'] for o in done)/len(done))
    assert m['waiting_time'] == pytest.approx(sum(o['wait'] for o in done)/len(done))
    eligible = [o for o in t.orders if 'completed' in o or 480-o['created'] >= 120]
    assert m['sla'] == pytest.approx(sum(o.get('completed',float('inf'))-o['created'] <= 120 for o in eligible)/len(eligible))
    expected = 8*(8*12 + 2*3 + 2*4 + 4*9 + 12) + t.distance*.6
    assert m['cost'] == round(expected,2)


def test_no_data_is_not_zero_cycle_or_perfect_sla():
    m = Twin(Config()).metrics()
    assert m['sla'] is None and m['processing_time'] is None and m['waiting_time'] is None


def test_sla_penalizes_unfinished_orders():
    t = Twin(Config(workers=1, arrival_rate=100, sla_minutes=15, duration=120))
    t.advance(120)
    assert t.metrics()['sla'] == 0
    assert t.metrics()['sla_eligible'] > 100


def test_more_resources_relieve_bottleneck_under_controlled_demand():
    c = Config(arrival_rate=40, picking_stations=1, equipment=1, workers=10, fleet_size=10)
    base, improved = Twin(c), Twin(c.model_copy(update={'picking_stations':4,'equipment':4}))
    base.advance(480); improved.advance(480)
    assert [(o['created'],o['units']) for o in base.orders] == [(o['created'],o['units']) for o in improved.orders]
    assert improved.metrics()['throughput'] > base.metrics()['throughput']
    assert improved.metrics()['queues']['picking'] < base.metrics()['queues']['picking']


def test_vehicle_and_warehouse_constraints_change_outcomes():
    c = Config(arrival_rate=45, workers=15, picking_stations=5, equipment=5, fleet_size=8)
    normal = simulate(c)
    assert simulate(c.model_copy(update={'fleet_size':1}))['throughput'] < normal['throughput']
    assert simulate(c.model_copy(update={'warehouse_capacity':5}))['throughput'] < normal['throughput']


def test_comparison_paired_intervals_and_horizon():
    c = Config(duration=120)
    result = compare(Comparison(baseline=c, scenario=c.model_copy(update={'seed':99,'duration':240}),replications=3))
    assert result['seeds'] == [42,43,44]
    assert result['duration'] == 120
    assert result['scenario_config']['duration'] == 120
    assert all(m['difference']['mean'] == 0 for m in result['metrics'].values())
    assert not result['demand_changed']
    assert result['resource_utilization']['workers']['baseline'] == result['resource_utilization']['workers']['scenario']


def test_demand_changes_are_flagged():
    c = Config(duration=60)
    r = compare(Comparison(baseline=c,scenario=c.model_copy(update={'arrival_rate':90}),replications=2))
    assert r['demand_changed']


def test_interval_missing_and_small_sample():
    assert interval([None,None])['mean'] is None
    i = interval([1,2,3])
    assert i['mean'] == 2 and i['low'] < 1 and i['high'] > 3


def test_optimization_bounded_and_feasible():
    c = Config(duration=120)
    r = optimize(Optimization(config=c,trials=4,replications=2,target_sla=0))
    assert len(r['tested']) == 4
    assert r['tested'][0]['workers'] == c.workers
    for row in r['tested']:
        assert abs(row['workers']-c.workers) <= 2
        assert abs(row['picking_stations']-c.picking_stations) <= 1
        assert abs(row['fleet_size']-c.fleet_size) <= 1
        assert row['feasible'] == (row['sla']['low'] is not None and row['sla']['low'] >= 0)
    if r['recommended']:
        assert r['recommended']['cost']['mean'] == min(row['cost']['mean'] for row in r['tested'] if row['feasible'])


def test_no_feasible_optimization_does_not_invent_recommendation():
    r = optimize(Optimization(config=Config(workers=1,arrival_rate=100,sla_minutes=15,duration=60),trials=3,replications=2,target_sla=1))
    assert r['recommended'] is None
    assert r['estimated_savings'] is None


def test_recommendations_include_evidence_and_no_unsupported_improvement():
    t = Twin(Config(picking_stations=1,equipment=1,workers=10,arrival_rate=50))
    t.advance(240)
    recs = recommendations(t.metrics(),t.config)
    assert any('picking' in r['title'] for r in recs)
    assert all(r['evidence'] and 'paired' in r['method'] for r in recs)


@pytest.mark.parametrize('field,value',[('workers',0),('equipment',0),('vehicle_capacity',4),('arrival_rate',0),('duration',1500),('seed',-1),('travel_variability',2)])
def test_invalid_configurations(field,value):
    with pytest.raises(ValueError):
        Config(**{field:value})


def test_synthetic_agent_assignments_and_inventory_locations():
    t = Twin(Config())
    for _ in range(24):
        state = t.advance(10)
        for kind, agents in state['agents'].items():
            cap = t.config.workers if kind == 'workers' else t.config.equipment
            assert len(agents) <= cap
            assert len({a['id'] for a in agents}) == len(agents)
            assert len(agents) == state['resources'][kind]['busy']
        assert sum(state['inventory_locations'].values()) == state['metrics']['inventory_units']
