import pytest
from routing.services.ranker import rank_routes


def make_route(id_name: str, name: str, no_travel: float, severe: float, high: float, avg_risk: float, duration_s: int):
    return {
        "id": id_name,
        "name": name,
        "summary": {
            "distance_mi": 100.0,
            "duration_s": duration_s,
            "arrival_at": "2026-11-08T12:00:00Z",
            "miles_by_level": {
                "Low": max(0.0, 100.0 - no_travel - severe - high),
                "Moderate": 0.0,
                "High": high,
                "Severe": severe,
                "No Travel": no_travel,
            },
            "avg_risk": avg_risk,
            "max_level": "No Travel" if no_travel > 0 else ("Severe" if severe > 0 else "High"),
        },
        "checkpoints": [],
    }


def test_step1_no_travel_miles_decides():
    r_a = make_route("r1", "Route A", no_travel=0.0, severe=10.0, high=10.0, avg_risk=1.5, duration_s=5000)
    r_b = make_route("r2", "Route B", no_travel=5.0, severe=0.0, high=0.0, avg_risk=0.5, duration_s=4000)

    ranked, reason, no_safe = rank_routes([r_b, r_a])
    assert ranked[0]["id"] == "r1"
    assert "fewer No Travel miles" in reason
    assert no_safe is False


def test_step2_severe_miles_decides():
    r_a = make_route("r1", "Route A", no_travel=0.0, severe=10.0, high=20.0, avg_risk=1.2, duration_s=5000)
    r_b = make_route("r2", "Route B", no_travel=0.0, severe=25.0, high=0.0, avg_risk=0.8, duration_s=4000)

    ranked, reason, _ = rank_routes([r_b, r_a])
    assert ranked[0]["id"] == "r1"
    assert "15.0 fewer Severe miles than Route B" in reason


def test_step3_high_miles_decides():
    r_a = make_route("r1", "Route A", no_travel=0.0, severe=0.0, high=12.0, avg_risk=0.9, duration_s=5000)
    r_b = make_route("r2", "Route B", no_travel=0.0, severe=0.0, high=30.0, avg_risk=0.7, duration_s=4000)

    ranked, reason, _ = rank_routes([r_b, r_a])
    assert ranked[0]["id"] == "r1"
    assert "18.0 fewer High miles than Route B" in reason


def test_step4_avg_risk_decides():
    r_a = make_route("r1", "Route A", no_travel=0.0, severe=0.0, high=10.0, avg_risk=0.35, duration_s=5000)
    r_b = make_route("r2", "Route B", no_travel=0.0, severe=0.0, high=10.0, avg_risk=0.65, duration_s=4000)

    ranked, reason, _ = rank_routes([r_b, r_a])
    assert ranked[0]["id"] == "r1"
    assert "Lower average risk" in reason


def test_step5_duration_decides():
    r_a = make_route("r1", "Route A", no_travel=0.0, severe=0.0, high=10.0, avg_risk=0.50, duration_s=3600)
    r_b = make_route("r2", "Route B", no_travel=0.0, severe=0.0, high=10.0, avg_risk=0.50, duration_s=4800)

    ranked, reason, _ = rank_routes([r_b, r_a])
    assert ranked[0]["id"] == "r1"
    assert "shorter travel time" in reason


def test_all_routes_have_no_travel():
    r_a = make_route("r1", "Route A", no_travel=4.0, severe=0.0, high=0.0, avg_risk=1.0, duration_s=4000)
    r_b = make_route("r2", "Route B", no_travel=8.0, severe=0.0, high=0.0, avg_risk=1.5, duration_s=4200)

    ranked, reason, no_safe = rank_routes([r_a, r_b])
    assert ranked[0]["id"] == "r1"
    assert no_safe is True

