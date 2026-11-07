import os
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


def test_missing_tomtom_key_returns_503(api_client, monkeypatch):
    monkeypatch.delenv("TOMTOM_API_KEY", raising=False)
    monkeypatch.setenv("DEMO_MODE", "false")

    dep_time = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    payload = {
        "origin": {"lat": 32.7767, "lon": -96.7970, "label": "Dallas, TX"},
        "destination": {"lat": 39.7392, "lon": -104.9903, "label": "Denver, CO"},
        "departure_at": dep_time,
        "load_weight_lb": 38000,
    }
    response = api_client.post("/api/trips/plan", data=payload, format="json")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"
    assert "TomTom API key not configured" in response.json()["error"]["message"]

    geo_resp = api_client.get("/api/geocode?q=Dallas")
    assert geo_resp.status_code == 503
    assert "TomTom API key not configured" in geo_resp.json()["error"]["message"]


@respx.mock
def test_geocode_with_tomtom_api_key(api_client, monkeypatch):
    monkeypatch.setenv("TOMTOM_API_KEY", "mock_tomtom_key_123")
    monkeypatch.setenv("DEMO_MODE", "false")

    respx.get(url__startswith="https://api.tomtom.com/search/2/geocode").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "position": {"lat": 32.7767, "lon": -96.7970},
                        "address": {"freeformAddress": "Dallas, TX, United States"}
                    }
                ]
            }
        )
    )

    response = api_client.get("/api/geocode?q=Dallas")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["lat"] == 32.7767
    assert data[0]["lon"] == -96.7970
    assert "Dallas" in data[0]["label"]


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
def test_plan_trip_and_heatmap_with_tomtom_key(api_client, monkeypatch):
    monkeypatch.setenv("TOMTOM_API_KEY", "mock_tomtom_key_123")
    monkeypatch.setenv("DEMO_MODE", "false")

    # Mock TomTom Calculate Route
    respx.get(url__startswith="https://api.tomtom.com/routing/1/calculateRoute").mock(
        return_value=httpx.Response(
            200,
            json={
                "routes": [
                    {
                        "summary": {"lengthInMeters": 1000000, "travelTimeInSeconds": 36000},
                        "legs": [
                            {
                                "points": [
                                    {"latitude": 32.7767, "longitude": -96.7970},
                                    {"latitude": 36.0, "longitude": -100.0},
                                    {"latitude": 39.7392, "longitude": -104.9903},
                                ]
                            }
                        ],
                        "guidance": {
                            "instructions": [
                                {"routeOffsetInMeters": 0, "travelTimeInSeconds": 0},
                                {"routeOffsetInMeters": 1000000, "travelTimeInSeconds": 36000},
                            ]
                        }
                    },
                    {
                        "summary": {"lengthInMeters": 1050000, "travelTimeInSeconds": 38000},
                        "legs": [
                            {
                                "points": [
                                    {"latitude": 32.7767, "longitude": -96.7970},
                                    {"latitude": 37.0, "longitude": -99.0},
                                    {"latitude": 39.7392, "longitude": -104.9903},
                                ]
                            }
                        ],
                        "guidance": {
                            "instructions": [
                                {"routeOffsetInMeters": 0, "travelTimeInSeconds": 0},
                                {"routeOffsetInMeters": 1050000, "travelTimeInSeconds": 38000},
                            ]
                        }
                    },
                    {
                        "summary": {"lengthInMeters": 1100000, "travelTimeInSeconds": 40000},
                        "legs": [
                            {
                                "points": [
                                    {"latitude": 32.7767, "longitude": -96.7970},
                                    {"latitude": 35.0, "longitude": -102.0},
                                    {"latitude": 39.7392, "longitude": -104.9903},
                                ]
                            }
                        ],
                        "guidance": {
                            "instructions": [
                                {"routeOffsetInMeters": 0, "travelTimeInSeconds": 0},
                                {"routeOffsetInMeters": 1100000, "travelTimeInSeconds": 40000},
                            ]
                        }
                    },
                ]
            }
        )
    )

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
    assert plan["demo_mode"] is False
    assert "recommended_route_id" in plan
    assert len(plan["routes"]) == 3

    # Test heatmap endpoint using trip_id
    trip_id = plan["trip_id"]
    hm_response = api_client.get(f"/api/trips/{trip_id}/heatmap")
    assert hm_response.status_code == 200
    heatmap_geo = hm_response.json()
    assert heatmap_geo["type"] == "FeatureCollection"
    assert len(heatmap_geo["features"]) > 0


@respx.mock
def test_plan_trip_demo_mode_active(api_client, monkeypatch):
    monkeypatch.delenv("TOMTOM_API_KEY", raising=False)
    monkeypatch.setenv("DEMO_MODE", "true")

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
    assert plan["demo_mode"] is True
    assert len(plan["routes"]) == 3
