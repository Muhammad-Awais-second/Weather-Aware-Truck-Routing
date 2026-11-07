import math
from datetime import datetime, timezone
import pytest
from routing.services.sampler import (
    sample_checkpoints,
    build_eta_interpolator,
    haversine_miles,
)


def test_straight_line_sampling():
    # 1 degree of latitude ~= 69.05 miles
    # Let's create a straight north-south line of ~100 miles
    lat_start = 30.0
    lon = -90.0
    # 100 miles / 69.05 = ~1.4482 degrees
    target_dist_mi = 100.0
    deg_delta = target_dist_mi / 69.054
    lat_end = lat_start + deg_delta

    coords = [[lon, lat_start], [lon, lat_end]]
    dep_dt = datetime(2026, 11, 8, 8, 0, tzinfo=timezone.utc)
    duration_s = 7200  # 2 hours

    cps, total_dist = sample_checkpoints(coords, duration_s, dep_dt)

    assert abs(total_dist - 100.0) < 1.0

    # Test intervals tagging
    # For interval 10: check if checkpoints at 0, 10, 20... have 10 in intervals
    cps_10 = [c for c in cps if 10 in c["intervals"]]
    miles_10 = [c["mile"] for c in cps_10]
    for expected_m in [0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0]:
        assert any(abs(m - expected_m) < 0.5 for m in miles_10)

    # For interval 50: check checkpoints at 0, 50, 100
    cps_50 = [c for c in cps if 50 in c["intervals"]]
    miles_50 = [c["mile"] for c in cps_50]
    assert any(abs(m - 0.0) < 0.5 for m in miles_50)
    assert any(abs(m - 50.0) < 0.5 for m in miles_50)
    assert any(abs(m - 100.0) < 1.0 for m in miles_50)


def test_piecewise_eta_interpolation_slow_first_segment():
    # Total distance: 100 miles, total time: 100 minutes (6000 s)
    # Slow city traffic for first 20 miles takes 60 minutes (3600 s)
    # Remaining 80 miles highway takes 40 minutes (2400 s)
    instructions = [
        (0.0, 0.0),
        (20.0, 3600.0),   # Mile 20 reached at 3600 s
        (100.0, 6000.0),  # Mile 100 reached at 6000 s
    ]

    get_elapsed = build_eta_interpolator(instructions, 100.0, 6000.0)

    # At mile 10:
    # Uniform speed would give: 10/100 * 6000 = 600 s (10 min)
    # Actual piecewise interpolator should give: 1800 s (30 min)
    actual_s = get_elapsed(10.0)
    uniform_s = (10.0 / 100.0) * 6000.0

    assert actual_s > uniform_s
    assert actual_s == 1800.0

    # At mile 60:
    # 20 miles done in 3600s, 40/80 of highway segment done = 3600 + 0.5 * 2400 = 4800 s
    assert get_elapsed(60.0) == 4800.0

