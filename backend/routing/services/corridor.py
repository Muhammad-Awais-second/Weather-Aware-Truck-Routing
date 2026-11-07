"""
Corridor heatmap grid generation and multi-hour risk scoring.
"""
import math
from datetime import datetime
from typing import Any, Dict, List, Set, Tuple
from ..clients.openmeteo import get_hourly_forecast_for_grid_cells, get_hourly_risks_for_point
from .sampler import build_cumulative_distances, interpolate_position


def generate_corridor_grid_cells(
    routes: List[Dict[str, Any]],
    step_miles: float = 30.0
) -> List[Tuple[float, float]]:
    """
    Samples points along each route and at 10 & 20 miles to each side (5 points per row).
    Dedupes into unique 0.1-degree grid cells (lat, lon).
    """
    unique_cells: Set[Tuple[float, float]] = set()

    for r in routes:
        coords = r.get("coordinates", [])
        if len(coords) < 2:
            continue

        cum_dist, total_dist = build_cumulative_distances(coords)
        if total_dist <= 0:
            continue

        m = 0.0
        while m <= total_dist:
            lon_c, lat_c = interpolate_position(coords, cum_dist, m)

            # Sample ahead by 1 mile to get tangent
            ahead_m = min(total_dist, m + 1.0)
            lon_a, lat_a = interpolate_position(coords, cum_dist, ahead_m)

            d_lat = lat_a - lat_c
            d_lon = (lon_a - lon_c) * math.cos(math.radians(lat_c))
            hyp = math.hypot(d_lat, d_lon)

            if hyp > 1e-6:
                perp_lat = -d_lon / hyp
                perp_lon = d_lat / hyp
            else:
                perp_lat, perp_lon = 0.0, 1.0

            # 5 offsets: -20, -10, 0, 10, 20 miles
            for offset_mi in [-20.0, -10.0, 0.0, 10.0, 20.0]:
                lat_deg = (offset_mi / 69.0) * perp_lat
                cos_lat = max(0.2, math.cos(math.radians(lat_c)))
                lon_deg = (offset_mi / (69.0 * cos_lat)) * perp_lon

                pt_lat = round(lat_c + lat_deg, 1)
                pt_lon = round(lon_c + lon_deg, 1)
                unique_cells.add((pt_lat, pt_lon))

            m += step_miles

    return sorted(list(unique_cells))


async def build_corridor_heatmap_geojson(
    routes: List[Dict[str, Any]],
    departure_dt: datetime
) -> Dict[str, Any]:
    """
    Generates GeoJSON FeatureCollection where each point has r0..r48 risk attributes.
    """
    grid_cells = generate_corridor_grid_cells(routes, step_miles=30.0)

    # Fetch weather for unique cells
    forecast_map = await get_hourly_forecast_for_grid_cells(grid_cells)

    features = []
    for lat, lon in grid_cells:
        hourly_data = forecast_map.get((lat, lon), {})
        risks = get_hourly_risks_for_point(hourly_data, departure_dt, num_hours=49)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [round(lon, 4), round(lat, 4)]
            },
            "properties": risks
        })

    return {
        "type": "FeatureCollection",
        "features": features
    }

