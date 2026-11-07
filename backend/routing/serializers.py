"""
DRF Serializers for trip requests and validation.
"""
from datetime import datetime, timezone, timedelta
from rest_framework import serializers


class LocationSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90.0, max_value=90.0)
    lon = serializers.FloatField(min_value=-180.0, max_value=180.0)
    label = serializers.CharField(max_length=255, required=False, default="")


class TripPlanRequestSerializer(serializers.Serializer):
    origin = LocationSerializer()
    destination = LocationSerializer()
    departure_at = serializers.DateTimeField()
    load_weight_lb = serializers.FloatField(min_value=1.0, max_value=80000.0)

    def validate(self, data):
        orig = data["origin"]
        dest = data["destination"]

        # Origin and destination must differ
        if abs(orig["lat"] - dest["lat"]) < 0.001 and abs(orig["lon"] - dest["lon"]) < 0.001:
            raise serializers.ValidationError("Origin and destination must be different locations.")

        dep = data["departure_at"]
        now = datetime.now(timezone.utc)
        # Departure must be within 7 days (forecast window)
        if dep < now - timedelta(hours=24):
            raise serializers.ValidationError("Departure time cannot be more than 24 hours in the past.")
        if dep > now + timedelta(days=7, hours=1):
            raise serializers.ValidationError("Departure time must be within 7 days for accurate forecasts.")

        return data

