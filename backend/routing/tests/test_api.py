import pytest
import respx
import httpx
from datetime import datetime, timezone, timedelta
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()


def generate_mock_weather_response(num_coords=1):
    hours = [
        (datetime(2026, 11, 8, 0, 0, tzinfo=timezone.utc) + timedelta(hours=i)).strftime("%Y-%m-%dT%H:00")
        for i in range(168)
    ]
    item = {
        "latitude": 33.0,
        "longitude": -97.0,
        "hourly": {
            "time": hours,
            "wind_speed_10m": [20.0] * 168,
            "wind_gusts_10m": [28.0] * 168,
            "rain": [0.05] * 168,
            "showers": [0.0] * 168,
            "snowfall": [0.0] * 168,
        }
    }
    if num_coords > 1:
        return [item] * num_coords
    return [item]


def test_health_check_endpoint(api_client):
    response = api_client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@respx.mock
def test_geocode_endpoint(api_client):
    respx.get("https://photon.komoot.io/api/").mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "geometry": {"coordinates": [-96.7970, 32.7767]},
                        "properties": {"name": "Dallas", "state": "Texas", "country": "United States"}
                    }
                ]
            }
        )
    )
    response = api_client.get("/api/geocode?q=Dallas")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "lat" in data[0]
    assert "lon" in data[0]


def test_plan_trip_validation_same_origin_dest(api_client):
    dep_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    payload = {
        "origin": {"lat": 32.7767, "lon": -96.7970, "label": "Dallas, TX"},
        "destination": {"lat": 32.7767, "lon": -96.7970, "label": "Dallas, TX"},
        "departure_at": dep_time,
        "load_weight_lb": 35000,
    }
    response = api_client.post("/api/trips/plan", data=payload, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


@respx.mock
def test_plan_trip_and_heatmap_flow(api_client):
    # Mock Open-Meteo forecast API calls with respx
    def mock_weather_handler(request):
        coords_str = request.url.params.get("latitude", "")
        count = len(coords_str.split(",")) if coords_str else 1
        return httpx.Response(200, json=generate_mock_weather_response(count))

    respx.get(url__startswith="https://api.open-meteo.com/v1/forecast").mock(
        side_effect=mock_weather_handler
    )

    dep_time = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    payload = {
        "origin": {"lat": 32.7767, "lon": -96.7970, "label": "Dallas, TX"},
        "destination": {"lat": 39.7392, "lon": -104.9903, "label": "Denver, CO"},
        "departure_at": dep_time,
        "load_weight_lb": 38000,
    }
    response = api_client.post("/api/trips/plan", data=payload, format="json")
    assert response.status_code == 200
    plan = response.json()

    assert "trip_id" in plan
    assert "recommended_route_id" in plan
    assert "recommendation_reason" in plan
    assert len(plan["routes"]) == 3

    r1 = plan["routes"][0]
    assert "geometry" in r1
    assert "summary" in r1
    assert "checkpoints" in r1
    assert len(r1["checkpoints"]) > 0

    # Test heatmap endpoint using trip_id
    trip_id = plan["trip_id"]
    hm_response = api_client.get(f"/api/trips/{trip_id}/heatmap")
    assert hm_response.status_code == 200
    heatmap_geo = hm_response.json()
    assert heatmap_geo["type"] == "FeatureCollection"
    assert len(heatmap_geo["features"]) > 0
    props = heatmap_geo["features"][0]["properties"]
    assert "r0" in props
    assert "r48" in props
