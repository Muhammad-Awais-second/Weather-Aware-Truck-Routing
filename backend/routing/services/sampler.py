"""
Route geometry sampling, haversine calculation, and ETA interpolation.
"""
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Computes great-circle distance between two points in miles.
    """
    r_miles = 3958.756
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r_miles * c


def build_cumulative_distances(coordinates: List[List[float]]) -> Tuple[List[float], float]:
    """
    Given [[lon, lat], ...], computes cumulative distance in miles from the origin.
    Returns (cumulative_distances_array, total_distance_mi).
    """
    if not coordinates:
        return [], 0.0

    cum_dist = [0.0]
    total = 0.0
    for i in range(1, len(coordinates)):
        lon1, lat1 = coordinates[i - 1]
        lon2, lat2 = coordinates[i]
        d = haversine_miles(lat1, lon1, lat2, lon2)
        total += d
        cum_dist.append(total)

    return cum_dist, total


def interpolate_position(
    coordinates: List[List[float]],
    cum_dist: List[float],
    target_mile: float
) -> Tuple[float, float]:
    """
    Finds interpolated [lon, lat] at target_mile.
    """
    if target_mile <= 0.0 or len(coordinates) <= 1:
        return coordinates[0][0], coordinates[0][1]
    if target_mile >= cum_dist[-1]:
        return coordinates[-1][0], coordinates[-1][1]

    # Binary search or scan
    low = 0
    high = len(cum_dist) - 1
    while low <= high:
        mid = (low + high) // 2
        if cum_dist[mid] < target_mile:
            low = mid + 1
        else:
            high = mid - 1

    idx = max(1, low)
    d0 = cum_dist[idx - 1]
    d1 = cum_dist[idx]
    p0 = coordinates[idx - 1]
    p1 = coordinates[idx]

    if d1 - d0 < 1e-7:
        return p0[0], p0[1]

    ratio = (target_mile - d0) / (d1 - d0)
    lon = p0[0] + ratio * (p1[0] - p0[0])
    lat = p0[1] + ratio * (p1[1] - p0[1])
    return lon, lat


def build_eta_interpolator(
    time_offset_points: List[Tuple[float, float]],
    total_dist_mi: float,
    total_duration_s: float
):
    """
    Given list of (distance_mi, elapsed_seconds) from route instructions or legs,
    returns a function (mile) -> elapsed_seconds.
    """
    points = sorted(time_offset_points, key=lambda x: x[0])
    if not points or points[0][0] > 0.001:
        points.insert(0, (0.0, 0.0))
    if points[-1][0] < total_dist_mi:
        points.append((total_dist_mi, total_duration_s))

    def get_elapsed_seconds(mile: float) -> float:
        if mile <= 0:
            return 0.0
        if mile >= total_dist_mi:
            return total_duration_s

        for i in range(1, len(points)):
            m0, s0 = points[i - 1]
            m1, s1 = points[i]
            if m0 <= mile <= m1:
                if m1 - m0 < 1e-7:
                    return s0
                ratio = (mile - m0) / (m1 - m0)
                return s0 + ratio * (s1 - s0)
        return total_duration_s

    return get_elapsed_seconds


def is_multiple_of(val: float, step: int, tolerance: float = 0.05) -> bool:
    """Checks if a float is approximately a multiple of an integer step."""
    rem = abs(val - round(val / step) * step)
    return rem <= tolerance


def sample_checkpoints(
    coordinates: List[List[float]],
    total_duration_s: float,
    departure_dt: datetime,
    time_offset_points: List[Tuple[float, float]] = None
) -> Tuple[List[Dict[str, Any]], float]:
    """
    Samples route at 5-mile base increments, tagging intervals [10, 25, 50].
    Returns (checkpoints, total_distance_mi).
    """
    cum_dist, total_dist = build_cumulative_distances(coordinates)
    if total_dist <= 0:
        return [], 0.0

    if not time_offset_points:
        # Default fallback to uniform speed if no instruction timings
        time_offset_points = [(0.0, 0.0), (total_dist, total_duration_s)]

    get_elapsed_s = build_eta_interpolator(time_offset_points, total_dist, total_duration_s)

    # 5-mile increments
    target_miles = []
    curr = 0.0
    while curr < total_dist:
        target_miles.append(round(curr, 2))
        curr += 5.0
    if not target_miles or abs(target_miles[-1] - total_dist) > 0.5:
        target_miles.append(round(total_dist, 2))

    checkpoints = []
    total_pts = len(target_miles)

    for i, m in enumerate(target_miles):
        lon, lat = interpolate_position(coordinates, cum_dist, m)
        elapsed_s = get_elapsed_s(m)
        eta_dt = departure_dt + timedelta(seconds=elapsed_s)

        intervals = []
        is_terminal = (i == 0 or i == total_pts - 1)
        for interval in [10, 25, 50]:
            if is_terminal or is_multiple_of(m, interval):
                intervals.append(interval)

        checkpoints.append({
            "mile": round(m, 1),
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "grid_lat": round(round(lat, 1), 1),
            "grid_lon": round(round(lon, 1), 1),
            "intervals": intervals,
            "eta": eta_dt.isoformat().replace("+00:00", "Z"),
            "eta_dt": eta_dt,
            "elapsed_s": int(elapsed_s),
        })

    return checkpoints, total_dist


def simplify_geometry(coordinates: List[List[float]], max_points: int = 1500) -> List[List[float]]:
    """
    Subsamples dense coordinates to keep payload size lightweight while maintaining fidelity.
    """
    if len(coordinates) <= max_points:
        return [[round(c[0], 5), round(c[1], 5)] for c in coordinates]

    step = math.ceil(len(coordinates) / max_points)
    simplified = [coordinates[0]]
    for i in range(1, len(coordinates) - 1, step):
        simplified.append(coordinates[i])
    simplified.append(coordinates[-1])
    return [[round(c[0], 5), round(c[1], 5)] for c in simplified]

