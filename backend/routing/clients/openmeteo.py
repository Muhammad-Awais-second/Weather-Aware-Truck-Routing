"""
Open-Meteo Forecast client with batched multi-coordinate queries and grid caching.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx
from django.core.cache import cache

logger = logging.getLogger(__name__)

OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast"
BATCH_SIZE = 50
CACHE_TTL_SECONDS = 1800  # 30 minutes


def make_grid_key(lat: float, lon: float) -> str:
    """Format 0.1 degree grid key for caching."""
    return f"om_{lat:.1f}_{lon:.1f}"


async def fetch_weather_batch(client: httpx.AsyncClient, coords: List[Tuple[float, float]]) -> List[Optional[Dict[str, Any]]]:
    """
    Fetches hourly weather for up to 50 coordinates in one request.
    """
    if not coords:
        return []

    lat_str = ",".join(f"{c[0]:.2f}" for c in coords)
    lon_str = ",".join(f"{c[1]:.2f}" for c in coords)

    params = {
        "latitude": lat_str,
        "longitude": lon_str,
        "hourly": "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
    }

    try:
        response = await client.get(OPEN_METEO_BASE_URL, params=params, timeout=7.0)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list):
            return data
        elif isinstance(data, dict):
            return [data]
        return [None] * len(coords)
    except Exception as exc:
        logger.warning(f"Open-Meteo request failed: {exc}")
        return [None] * len(coords)


async def get_hourly_forecast_for_grid_cells(
    grid_cells: List[Tuple[float, float]]
) -> Dict[Tuple[float, float], Dict[str, Any]]:
    """
    Returns a dict mapping (grid_lat, grid_lon) -> parsed hourly forecast dict.
    Checks Django cache first; batches missing cells to Open-Meteo.
    """
    results: Dict[Tuple[float, float], Dict[str, Any]] = {}
    missing: List[Tuple[float, float]] = []

    for lat, lon in grid_cells:
        key = make_grid_key(lat, lon)
        cached_val = cache.get(key)
        if cached_val:
            results[(lat, lon)] = cached_val
        else:
            missing.append((lat, lon))

    if missing:
        async with httpx.AsyncClient() as client:
            # Chunk missing into batches of BATCH_SIZE
            for i in range(0, len(missing), BATCH_SIZE):
                chunk = missing[i: i + BATCH_SIZE]
                batch_responses = await fetch_weather_batch(client, chunk)
                for (lat, lon), resp in zip(chunk, batch_responses):
                    if resp and "hourly" in resp:
                        hourly_data = resp["hourly"]
                        # Pre-parse time map for O(1) or index lookup
                        parsed = {
                            "times": hourly_data.get("time", []),
                            "wind_speed_10m": hourly_data.get("wind_speed_10m", []),
                            "wind_gusts_10m": hourly_data.get("wind_gusts_10m", []),
                            "rain": hourly_data.get("rain", []),
                            "showers": hourly_data.get("showers", []),
                            "snowfall": hourly_data.get("snowfall", []),
                        }
                        cache.set(make_grid_key(lat, lon), parsed, CACHE_TTL_SECONDS)
                        results[(lat, lon)] = parsed
                    else:
                        # Fallback default benign weather so calculation can proceed
                        fallback = {
                            "times": [],
                            "wind_speed_10m": [],
                            "wind_gusts_10m": [],
                            "rain": [],
                            "showers": [],
                            "snowfall": [],
                        }
                        results[(lat, lon)] = fallback

    return results


def interpolate_weather_at_eta(
    hourly: Dict[str, Any],
    eta_dt: datetime
) -> Dict[str, float]:
    """
    Interpolates hourly forecast at checkpoint ETA.
    Linear interpolation between two nearest hours for wind.
    """
    times = hourly.get("times", [])
    if not times:
        # Default mild weather
        return {
            "wind_mph": 12.0,
            "gust_mph": 18.0,
            "rain_in_hr": 0.0,
            "snow_in_hr": 0.0,
        }

    # Open-Meteo returns UTC ISO strings without seconds: "2026-11-08T12:00"
    eta_utc = eta_dt.astimezone(timezone.utc) if eta_dt.tzinfo else eta_dt
    target_str = eta_utc.strftime("%Y-%m-%dT%H:00")

    # Find matching hour index
    try:
        idx = times.index(target_str)
    except ValueError:
        # If outside range or mismatch, find closest
        idx = 0
        min_diff = float("inf")
        target_ts = eta_utc.timestamp()
        for i, t_str in enumerate(times[:168]):  # Up to 7 days
            try:
                t_dt = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
                diff = abs(t_dt.timestamp() - target_ts)
                if diff < min_diff:
                    min_diff = diff
                    idx = i
            except Exception:
                continue

    # Interpolation factor for minutes past the hour
    minute_ratio = eta_utc.minute / 60.0
    next_idx = min(idx + 1, len(times) - 1)

    winds = hourly.get("wind_speed_10m", [])
    gusts = hourly.get("wind_gusts_10m", [])
    rains = hourly.get("rain", [])
    showers = hourly.get("showers", [])
    snows = hourly.get("snowfall", [])

    w0 = winds[idx] if idx < len(winds) and winds[idx] is not None else 10.0
    w1 = winds[next_idx] if next_idx < len(winds) and winds[next_idx] is not None else w0
    wind_mph = round(w0 + minute_ratio * (w1 - w0), 1)

    g0 = gusts[idx] if idx < len(gusts) and gusts[idx] is not None else w0 * 1.3
    g1 = gusts[next_idx] if next_idx < len(gusts) and gusts[next_idx] is not None else g0
    gust_mph = round(max(g0, g1), 1)

    r0 = (rains[idx] or 0.0) + (showers[idx] or 0.0) if idx < len(rains) else 0.0
    r1 = (rains[next_idx] or 0.0) + (showers[next_idx] or 0.0) if next_idx < len(rains) else r0
    rain_in_hr = round(r0 + minute_ratio * (r1 - r0), 2)

    s0 = snows[idx] if idx < len(snows) and snows[idx] is not None else 0.0
    s1 = snows[next_idx] if next_idx < len(snows) and snows[next_idx] is not None else s0
    snow_in_hr = round(s0 + minute_ratio * (s1 - s0), 2)

    return {
        "wind_mph": max(0.0, wind_mph),
        "gust_mph": max(0.0, gust_mph),
        "rain_in_hr": max(0.0, rain_in_hr),
        "snow_in_hr": max(0.0, snow_in_hr),
    }


def get_hourly_risks_for_point(
    hourly: Dict[str, Any],
    start_dt: datetime,
    num_hours: int = 49
) -> Dict[str, int]:
    """
    Returns risk levels r0..r48 for 0..48 hours starting from start_dt.
    Used for the corridor heatmap.
    """
    from ..services.risk import checkpoint_level

    times = hourly.get("times", [])
    winds = hourly.get("wind_speed_10m", [])
    rains = hourly.get("rain", [])
    showers = hourly.get("showers", [])
    snows = hourly.get("snowfall", [])

    time_map = {t: i for i, t in enumerate(times)}
    start_utc = start_dt.astimezone(timezone.utc) if start_dt.tzinfo else start_dt

    risks: Dict[str, int] = {}
    from datetime import timedelta

    for h in range(num_hours):
        h_dt = start_utc + timedelta(hours=h)
        t_key = h_dt.strftime("%Y-%m-%dT%H:00")
        idx = time_map.get(t_key)

        if idx is not None and idx < len(winds):
            w = winds[idx] if winds[idx] is not None else 10.0
            r = (rains[idx] or 0.0) + (showers[idx] or 0.0) if idx < len(rains) else 0.0
            s = snows[idx] if idx < len(snows) and snows[idx] is not None else 0.0
            # Base risk for heatmap corridor
            lvl, _ = checkpoint_level(w, r, s, load_lb=30000)
            risks[f"r{h}"] = lvl
        else:
            risks[f"r{h}"] = 0

    return risks

