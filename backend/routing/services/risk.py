"""
Weather risk classification and vehicle load rules.
"""
from typing import List, Tuple

LEVELS = ["Low", "Moderate", "High", "Severe", "No Travel"]


def wind_level(mph: float) -> int:
    """
    Wind thresholds (mph):
    < 25: Low (0)
    25 – < 35: Moderate (1)
    35 – < 45: High (2)
    45 – < 55: Severe (3)
    >= 55: No Travel (4)
    """
    if mph < 25:
        return 0
    if mph < 35:
        return 1
    if mph < 45:
        return 2
    if mph < 55:
        return 3
    return 4


def rain_level(inch_hr: float) -> int:
    """
    Rain thresholds (in/hr):
    < 0.10: Low (0)
    0.10 – < 0.25: Moderate (1)
    0.25 – < 0.50: High (2)
    0.50 – <= 1.00: Severe (3)
    > 1.00: No Travel (4)
    """
    if inch_hr < 0.10:
        return 0
    if inch_hr < 0.25:
        return 1
    if inch_hr < 0.50:
        return 2
    if inch_hr <= 1.00:
        return 3
    return 4


def snow_level(inch_hr: float) -> int:
    """
    Snow thresholds (in/hr):
    < 0.5: Low (0)
    0.5 – < 1.0: Moderate (1)
    1.0 – < 2.0: High (2)
    2.0 – <= 3.0: Severe (3)
    > 3.0: No Travel (4)
    """
    if inch_hr < 0.5:
        return 0
    if inch_hr < 1.0:
        return 1
    if inch_hr < 2.0:
        return 2
    if inch_hr <= 3.0:
        return 3
    return 4


def checkpoint_level(wind: float, rain: float, snow: float, load_lb: float) -> Tuple[int, List[str]]:
    """
    Compute checkpoint risk level based on maximum weather condition,
    raised by truck load weight rules.

    Load rules:
    - Wind >= 55 mph -> No Travel (4) for any load.
    - Wind 45-54 mph and load > 30,000 lb -> No Travel (4).
    - Wind 35-44 mph and load > 40,000 lb -> Severe (3).
    Load rules only raise a level, never lower it.
    """
    w_lvl = wind_level(wind)
    r_lvl = rain_level(rain)
    s_lvl = snow_level(snow)

    base_level = max(w_lvl, r_lvl, s_lvl)
    level = base_level
    reasons = []

    # Check load-induced elevation
    if wind >= 55:
        if level < 4:
            level = 4
            reasons.append(f"Wind {wind:.1f} mph: No Travel for any load")
    elif 45 <= wind < 55 and load_lb > 30_000:
        if level < 4:
            level = 4
            reasons.append(f"Wind {wind:.1f} mph + {load_lb:,.0f} lb load: raised to No Travel")
    elif 35 <= wind < 45 and load_lb > 40_000:
        if level < 3:
            level = 3
            reasons.append(f"Wind {wind:.1f} mph + {load_lb:,.0f} lb load: raised to Severe")

    return level, reasons

