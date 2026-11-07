import pytest
from routing.services.risk import (
    wind_level,
    rain_level,
    snow_level,
    checkpoint_level,
    LEVELS,
)


def test_wind_boundaries():
    assert wind_level(24.9) == 0  # Low
    assert wind_level(25.0) == 1  # Moderate
    assert wind_level(34.9) == 1  # Moderate
    assert wind_level(35.0) == 2  # High
    assert wind_level(44.9) == 2  # High
    assert wind_level(45.0) == 3  # Severe
    assert wind_level(54.9) == 3  # Severe
    assert wind_level(55.0) == 4  # No Travel


def test_rain_boundaries():
    assert rain_level(0.09) == 0  # Low
    assert rain_level(0.10) == 1  # Moderate
    assert rain_level(0.24) == 1  # Moderate
    assert rain_level(0.25) == 2  # High
    assert rain_level(0.49) == 2  # High
    assert rain_level(0.50) == 3  # Severe
    assert rain_level(1.00) == 3  # Severe
    assert rain_level(1.01) == 4  # No Travel


def test_snow_boundaries():
    assert snow_level(0.49) == 0  # Low
    assert snow_level(0.50) == 1  # Moderate
    assert snow_level(0.99) == 1  # Moderate
    assert snow_level(1.00) == 2  # High
    assert snow_level(1.99) == 2  # High
    assert snow_level(2.00) == 3  # Severe
    assert snow_level(3.00) == 3  # Severe
    assert snow_level(3.01) == 4  # No Travel


def test_load_rule_45mph():
    # 45 mph wind is Severe (3) by default
    # If load <= 30,000 lb -> remains Severe (3)
    lvl, reasons = checkpoint_level(wind=45.0, rain=0.0, snow=0.0, load_lb=30_000)
    assert lvl == 3
    assert len(reasons) == 0

    # If load > 30,000 lb -> raised to No Travel (4)
    lvl, reasons = checkpoint_level(wind=45.0, rain=0.0, snow=0.0, load_lb=30_001)
    assert lvl == 4
    assert any("raised to No Travel" in r for r in reasons)


def test_load_rule_35mph():
    # 35 mph wind is High (2) by default
    # If load <= 40,000 lb -> remains High (2)
    lvl, reasons = checkpoint_level(wind=35.0, rain=0.0, snow=0.0, load_lb=40_000)
    assert lvl == 2
    assert len(reasons) == 0

    # If load > 40,000 lb -> raised to Severe (3)
    lvl, reasons = checkpoint_level(wind=35.0, rain=0.0, snow=0.0, load_lb=40_001)
    assert lvl == 3
    assert any("raised to Severe" in r for r in reasons)


def test_load_rule_55mph_any_load():
    # 55 mph wind -> No Travel (4) even with 1,000 lb load
    lvl, reasons = checkpoint_level(wind=55.0, rain=0.0, snow=0.0, load_lb=1_000)
    assert lvl == 4


def test_load_rules_never_lower_level():
    # Severe rain with low wind and high load should stay Severe
    lvl, reasons = checkpoint_level(wind=10.0, rain=0.80, snow=0.0, load_lb=45_000)
    assert lvl == 3  # Severe due to rain

