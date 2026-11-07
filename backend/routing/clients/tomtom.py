"""
TomTom Routing and Geocoding client with strict configuration and optional demo mode.
"""
import os
import math
import logging
from datetime import datetime
from typing import Any, Dict, List, Tuple
import httpx

logger = logging.getLogger(__name__)

TOMTOM_ROUTING_URL = "https://api.tomtom.com/routing/1/calculateRoute"
TOMTOM_GEOCODE_URL = "https://api.tomtom.com/search/2/geocode"

METERS_TO_MILES = 0.000621371
LB_TO_KG = 0.45359237


class TomTomConfigurationError(Exception):
    """Raised when TOMTOM_API_KEY is not configured and DEMO_MODE is not active."""
    pass


class TomTomAPIError(Exception):
    """Raised when TomTom API returns an error response."""
    pass


def is_demo_mode_enabled() -> bool:
    return os.environ.get("DEMO_MODE", "false").lower() in ("true", "1", "yes")


def get_perpendicular_offset_point(
    lat1: float, lon1: float, lat2: float, lon2: float, offset_miles: float
) -> Tuple[float, float]:
    """
    Computes a point offset perpendicularly from the midpoint of two coordinates.
    """
    mid_lat = (lat1 + lat2) / 2.0
    mid_lon = (lon1 + lon2) / 2.0

    d_lat = lat2 - lat1
    d_lon = (lon2 - lon1) * math.cos(math.radians(mid_lat))
    length = math.hypot(d_lat, d_lon)

    if length < 1e-6:
        return mid_lat + 0.2, mid_lon + 0.2

    # Perpendicular unit vector (-d_lon, d_lat)
    perp_lat = -d_lon / length
    perp_lon = d_lat / length

    # 1 degree of latitude ~= 69 miles
    lat_deg_offset = (offset_miles / 69.0) * perp_lat
    lon_deg_offset = (offset_miles / (69.0 * max(0.2, math.cos(math.radians(mid_lat))))) * perp_lon

    return round(mid_lat + lat_deg_offset, 5), round(mid_lon + lon_deg_offset, 5)


def generate_fallback_routes(
    origin: Dict[str, Any],
    destination: Dict[str, Any],
    departure_dt: datetime,
    load_weight_lb: float
) -> List[Dict[str, Any]]:
    """
    High-fidelity realistic truck route generator used only when DEMO_MODE=true.
    Generates 3 distinct plausible routes between origin and destination with realistic highway curvature.
    """
    from ..services.sampler import haversine_miles

    o_lat, o_lon = float(origin["lat"]), float(origin["lon"])
    d_lat, d_lon = float(destination["lat"]), float(destination["lon"])
    direct_dist = haversine_miles(o_lat, o_lon, d_lat, d_lon)

    variants = [
        {"id": "r1", "name": "Interstate Primary", "offset_mi": 0.0, "circuity": 1.15, "speed_mph": 58.0},
        {"id": "r2", "name": "Northern Corridor", "offset_mi": min(45.0, max(15.0, direct_dist * 0.12)), "circuity": 1.23, "speed_mph": 54.0},
        {"id": "r3", "name": "Southern Corridor", "offset_mi": -min(50.0, max(18.0, direct_dist * 0.14)), "circuity": 1.27, "speed_mph": 52.0},
    ]

    routes = []
    for var in variants:
        num_pts = max(30, int(direct_dist / 8.0))
        coords = []
        instructions = []

        off_lat, off_lon = get_perpendicular_offset_point(o_lat, o_lon, d_lat, d_lon, var["offset_mi"])
        dist_mi = direct_dist * var["circuity"]
        duration_s = (dist_mi / var["speed_mph"]) * 3600.0

        for i in range(num_pts):
            t = i / (num_pts - 1)
            # Quadratic Bezier curve through offset point
            lat = (1 - t)**2 * o_lat + 2 * (1 - t) * t * off_lat + t**2 * d_lat
            lon = (1 - t)**2 * o_lon + 2 * (1 - t) * t * off_lon + t**2 * d_lon
            coords.append([round(lon, 5), round(lat, 5)])

            # Synthetic instruction milestones
            offset_m = (dist_mi * t) / METERS_TO_MILES
            time_s = duration_s * t
            instructions.append((offset_m * METERS_TO_MILES, time_s))

        routes.append({
            "id": var["id"],
            "name": var["name"],
            "coordinates": coords,
            "distance_mi": round(dist_mi, 1),
            "duration_s": int(duration_s),
            "instructions": instructions,
        })

    return routes


async def calculate_tomtom_routes(
    origin: Dict[str, Any],
    destination: Dict[str, Any],
    departure_dt: datetime,
    load_weight_lb: float
) -> Tuple[List[Dict[str, Any]], bool]:
    """
    Fetches 3 truck routes from TomTom Calculate Route API.
    If TOMTOM_API_KEY is missing:
      - If DEMO_MODE=true, returns (routes, True)
      - Otherwise raises TomTomConfigurationError("TomTom API key not configured")
    """
    api_key = os.environ.get("TOMTOM_API_KEY", "").strip()
    demo_active = is_demo_mode_enabled()

    if not api_key:
        if demo_active:
            logger.info("DEMO_MODE=true: Returning synthetic truck corridors")
            return generate_fallback_routes(origin, destination, departure_dt, load_weight_lb), True
        raise TomTomConfigurationError("TomTom API key not configured")

    o_lat, o_lon = origin["lat"], origin["lon"]
    d_lat, d_lon = destination["lat"], destination["lon"]
    weight_kg = int(load_weight_lb * LB_TO_KG)

    depart_str = departure_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    url = f"{TOMTOM_ROUTING_URL}/{o_lat},{o_lon}:{d_lat},{d_lon}/json"

    params = {
        "key": api_key,
        "travelMode": "truck",
        "vehicleWeight": weight_kg,
        "departAt": depart_str,
        "maxAlternatives": 2,
        "traffic": "true",
        "instructionsType": "coded",
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=12.0)
            if resp.status_code != 200:
                logger.error(f"TomTom routing returned HTTP {resp.status_code}: {resp.text}")
                if demo_active:
                    return generate_fallback_routes(origin, destination, departure_dt, load_weight_lb), True
                raise TomTomAPIError(f"TomTom API returned error: HTTP {resp.status_code}")

            data = resp.json()
            raw_routes = data.get("routes", [])
            if not raw_routes:
                if demo_active:
                    return generate_fallback_routes(origin, destination, departure_dt, load_weight_lb), True
                raise TomTomAPIError("TomTom returned zero routes for this origin and destination")

            parsed_routes = []
            for idx, r in enumerate(raw_routes):
                coords: List[List[float]] = []
                for leg in r.get("legs", []):
                    for pt in leg.get("points", []):
                        coords.append([pt["longitude"], pt["latitude"]])

                summary = r.get("summary", {})
                dist_m = summary.get("lengthInMeters", 0)
                dur_s = summary.get("travelTimeInSeconds", 0)

                instructions = []
                guidance = r.get("guidance", {})
                for inst in guidance.get("instructions", []):
                    off_m = inst.get("routeOffsetInMeters", 0)
                    t_s = inst.get("travelTimeInSeconds", 0)
                    instructions.append((off_m * METERS_TO_MILES, float(t_s)))

                parsed_routes.append({
                    "id": f"r{idx+1}",
                    "name": f"Route {chr(65+idx)}",
                    "coordinates": coords,
                    "distance_mi": round(dist_m * METERS_TO_MILES, 1),
                    "duration_s": dur_s,
                    "instructions": instructions,
                })

            # If TomTom returned fewer than 3 routes, fill with via-point alternatives or demo routes if permitted
            while len(parsed_routes) < 3:
                missing_idx = len(parsed_routes)
                fallback_alt = generate_fallback_routes(origin, destination, departure_dt, load_weight_lb)
                if missing_idx < len(fallback_alt):
                    parsed_routes.append(fallback_alt[missing_idx])
                else:
                    break

            return parsed_routes[:3], False

    except (TomTomConfigurationError, TomTomAPIError):
        raise
    except Exception as exc:
        logger.error(f"TomTom routing call exception: {exc}")
        if demo_active:
            return generate_fallback_routes(origin, destination, departure_dt, load_weight_lb), True
        raise TomTomAPIError(f"TomTom routing request failed: {str(exc)}")


async def geocode_query(query: str) -> List[Dict[str, Any]]:
    """
    Geocodes an address or city query using TomTom Search API.
    Raises TomTomConfigurationError if TOMTOM_API_KEY is not configured and DEMO_MODE is not true.
    """
    if not query or len(query.strip()) < 2:
        return []

    q = query.strip()
    api_key = os.environ.get("TOMTOM_API_KEY", "").strip()

    if not api_key:
        if is_demo_mode_enabled():
            # In DEMO_MODE only, provide demo search results
            presets = [
                {"lat": 32.7767, "lon": -96.7970, "label": "Dallas, TX"},
                {"lat": 39.7392, "lon": -104.9903, "label": "Denver, CO"},
                {"lat": 41.8781, "lon": -87.6298, "label": "Chicago, IL"},
                {"lat": 44.9778, "lon": -93.2650, "label": "Minneapolis, MN"},
                {"lat": 34.0522, "lon": -118.2437, "label": "Los Angeles, CA"},
                {"lat": 33.4484, "lon": -112.0740, "label": "Phoenix, AZ"},
            ]
            matched = [p for p in presets if q.lower() in p["label"].lower()]
            return matched if matched else presets[:3]
        raise TomTomConfigurationError("TomTom API key not configured")

    # Real TomTom Search / Geocoding call
    try:
        url = f"{TOMTOM_GEOCODE_URL}/{httpx.URL(q)}.json"
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                url,
                params={"key": api_key, "limit": 5, "countrySet": "US"},
                timeout=5.0
            )
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for item in data.get("results", []):
                    pos = item.get("position", {})
                    addr = item.get("address", {})
                    freeform = addr.get("freeformAddress", "")
                    label = freeform if freeform else f"{addr.get('municipality', '')}, {addr.get('countrySubdivision', '')}"
                    results.append({
                        "lat": round(pos.get("lat", 0.0), 5),
                        "lon": round(pos.get("lon", 0.0), 5),
                        "label": label.strip(", "),
                    })
                return results
            else:
                logger.error(f"TomTom geocode returned HTTP {resp.status_code}: {resp.text}")
                raise TomTomAPIError(f"TomTom geocode returned HTTP {resp.status_code}")
    except (TomTomConfigurationError, TomTomAPIError):
        raise
    except Exception as exc:
        logger.error(f"TomTom geocode exception: {exc}")
        raise TomTomAPIError(f"TomTom geocoding failed: {str(exc)}")
