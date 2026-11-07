"""
Trip planning coordinator: integrates routing, sampling, weather retrieval, risk scoring, and ranking.
"""
import uuid
import logging
from datetime import datetime
from typing import Any, Dict, List, Set, Tuple
from django.core.cache import cache

from ..clients.tomtom import calculate_tomtom_routes
from ..clients.openmeteo import get_hourly_forecast_for_grid_cells, interpolate_weather_at_eta
from .sampler import sample_checkpoints, simplify_geometry
from .risk import LEVELS, checkpoint_level
from .ranker import compute_route_summary, rank_routes

logger = logging.getLogger(__name__)


async def plan_trip(
    origin: Dict[str, Any],
    destination: Dict[str, Any],
    departure_dt: datetime,
    load_weight_lb: float
) -> Dict[str, Any]:
    """
    Main orchestrator for trip planning.
    Returns complete plan payload and caches results for subsequent heatmap queries.
    """
    # 1. Fetch 3 routes
    raw_routes = await calculate_tomtom_routes(
        origin=origin,
        destination=destination,
        departure_dt=departure_dt,
        load_weight_lb=load_weight_lb
    )

    # 2. Sample checkpoints for each route at 5-mile base increments
    sampled_routes_data = []
    grid_cells: Set[Tuple[float, float]] = set()

    for r in raw_routes:
        cps, total_dist = sample_checkpoints(
            coordinates=r["coordinates"],
            total_duration_s=r["duration_s"],
            departure_dt=departure_dt,
            time_offset_points=r.get("instructions", [])
        )
        for cp in cps:
            grid_cells.add((cp["grid_lat"], cp["grid_lon"]))

        sampled_routes_data.append({
            "raw_route": r,
            "checkpoints": cps,
            "total_dist": total_dist,
        })

    # 3. Batch fetch weather forecasts for all unique grid cells
    weather_map = await get_hourly_forecast_for_grid_cells(sorted(list(grid_cells)))

    # 4. Score risk at each checkpoint
    processed_routes = []
    for item in sampled_routes_data:
        r = item["raw_route"]
        cps = item["checkpoints"]

        for cp in cps:
            cell = (cp["grid_lat"], cp["grid_lon"])
            hourly = weather_map.get(cell, {})
            w_info = interpolate_weather_at_eta(hourly, cp["eta_dt"])

            level_idx, reasons = checkpoint_level(
                wind=w_info["wind_mph"],
                rain=w_info["rain_in_hr"],
                snow=w_info["snow_in_hr"],
                load_lb=load_weight_lb
            )

            cp["weather"] = w_info
            cp["level_index"] = level_idx
            cp["level"] = LEVELS[level_idx]
            cp["reasons"] = reasons

        # Compute summary using base checkpoints
        arr_dt = cps[-1]["eta_dt"] if cps else departure_dt
        summary = compute_route_summary(
            base_checkpoints=cps,
            total_distance_mi=item["total_dist"],
            total_duration_s=r["duration_s"],
            arrival_at_iso=arr_dt.isoformat().replace("+00:00", "Z")
        )

        # Simplify geometry for fast MapLibre rendering
        simplified_coords = simplify_geometry(r["coordinates"])

        # Format checkpoints for API (remove internal dt objects)
        formatted_cps = []
        for cp in cps:
            formatted_cps.append({
                "mile": cp["mile"],
                "lat": cp["lat"],
                "lon": cp["lon"],
                "intervals": cp["intervals"],
                "eta": cp["eta"],
                "weather": cp["weather"],
                "level": cp["level"],
                "reasons": cp["reasons"],
            })

        processed_routes.append({
            "id": r["id"],
            "name": r.get("name", f"Route {r['id'].upper()}"),
            "geometry": {
                "type": "LineString",
                "coordinates": simplified_coords,
            },
            "summary": summary,
            "checkpoints": formatted_cps,
            "_raw_route": r,  # Kept in cache for corridor generation
        })

    # 5. Rank routes
    ranked_routes, reason, no_safe_route = rank_routes(processed_routes)
    recommended_id = ranked_routes[0]["id"] if ranked_routes else None

    trip_id = uuid.uuid4().hex[:16]

    # Save to cache for 1 hour for heatmap query
    cache_payload = {
        "trip_id": trip_id,
        "departure_dt": departure_dt.isoformat(),
        "routes": [
            {
                "id": r["id"],
                "coordinates": r["_raw_route"]["coordinates"],
            }
            for r in ranked_routes
        ],
    }
    cache.set(f"trip_{trip_id}", cache_payload, timeout=3600)

    # Clean internal cache field before returning to client
    for r in ranked_routes:
        r.pop("_raw_route", None)

    return {
        "trip_id": trip_id,
        "recommended_route_id": recommended_id,
        "recommendation_reason": reason,
        "no_safe_route": no_safe_route,
        "routes": ranked_routes,
    }

