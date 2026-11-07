"""
Routing app URL configuration.
"""
from django.urls import path
from .views import plan_trip_view, trip_heatmap_view, geocode_view, health_check

urlpatterns = [
    path("trips/plan", plan_trip_view, name="plan_trip"),
    path("trips/<str:trip_id>/heatmap", trip_heatmap_view, name="trip_heatmap"),
    path("geocode", geocode_view, name="geocode"),
    path("health", health_check, name="health_check"),
]

