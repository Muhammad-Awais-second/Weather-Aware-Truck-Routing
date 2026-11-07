"""
Thin Django REST Framework views for routing, weather, and geocoding endpoints.
"""
import logging
from datetime import datetime
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from asgiref.sync import async_to_sync

from .serializers import TripPlanRequestSerializer
from .services.planner import plan_trip
from .services.corridor import build_corridor_heatmap_geojson
from .clients.tomtom import geocode_query, TomTomConfigurationError, TomTomAPIError

logger = logging.getLogger(__name__)


@api_view(["POST"])
def plan_trip_view(request):
    """
    POST /api/trips/plan
    Plans 3 truck routes with checkpoint weather risk and recommendations.
    """
    serializer = TripPlanRequestSerializer(data=request.data)
    if not serializer.is_valid():
        first_err = next(iter(serializer.errors.values()))
        msg = first_err[0] if isinstance(first_err, list) else str(first_err)
        return Response(
            {"error": {"code": "VALIDATION_ERROR", "message": msg, "details": serializer.errors}},
            status=status.HTTP_400_BAD_REQUEST
        )

    validated_data = serializer.validated_data
    try:
        plan_result = async_to_sync(plan_trip)(
            origin=validated_data["origin"],
            destination=validated_data["destination"],
            departure_dt=validated_data["departure_at"],
            load_weight_lb=validated_data["load_weight_lb"]
        )
        return Response(plan_result, status=status.HTTP_200_OK)
    except TomTomConfigurationError as exc:
        return Response(
            {"error": {"code": "SERVICE_UNAVAILABLE", "message": "TomTom API key not configured"}},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    except TomTomAPIError as exc:
        logger.error(f"TomTom API routing failure: {exc}")
        return Response(
            {"error": {"code": "ROUTING_UNAVAILABLE", "message": str(exc)}},
            status=status.HTTP_502_BAD_GATEWAY
        )
    except Exception as exc:
        logger.exception("Error executing trip planning")
        return Response(
            {"error": {"code": "ROUTING_UNAVAILABLE", "message": f"Planning failed: {str(exc)}"}},
            status=status.HTTP_502_BAD_GATEWAY
        )


@api_view(["GET"])
def trip_heatmap_view(request, trip_id: str):
    """
    GET /api/trips/{trip_id}/heatmap
    Returns GeoJSON FeatureCollection of corridor points with r0..r48 risk attributes.
    """
    cache_key = f"trip_{trip_id}"
    cached_trip = cache.get(cache_key)

    if not cached_trip:
        return Response(
            {"error": {"code": "TRIP_NOT_FOUND", "message": "Trip plan expired or not found. Please plan again."}},
            status=status.HTTP_404_NOT_FOUND
        )

    try:
        dep_dt = datetime.fromisoformat(cached_trip["departure_dt"])
        routes = cached_trip["routes"]

        geojson = async_to_sync(build_corridor_heatmap_geojson)(routes, dep_dt)
        return Response(geojson, status=status.HTTP_200_OK)
    except Exception as exc:
        logger.exception(f"Heatmap generation error for {trip_id}")
        return Response(
            {"error": {"code": "HEATMAP_ERROR", "message": str(exc)}},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(["GET"])
def geocode_view(request):
    """
    GET /api/geocode?q=query
    Returns address suggestions with lat/lon coordinates.
    """
    query = request.query_params.get("q", "").strip()
    if len(query) < 2:
        return Response([], status=status.HTTP_200_OK)

    try:
        results = async_to_sync(geocode_query)(query)
        return Response(results, status=status.HTTP_200_OK)
    except TomTomConfigurationError as exc:
        return Response(
            {"error": {"code": "SERVICE_UNAVAILABLE", "message": "TomTom API key not configured"}},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    except Exception as exc:
        logger.error(f"Geocoding view error: {exc}")
        return Response([], status=status.HTTP_200_OK)


@api_view(["GET"])
def health_check(request):
    """
    GET /api/health
    Basic service health check.
    """
    return Response({"status": "ok", "service": "truck-weather-routing"}, status=status.HTTP_200_OK)
