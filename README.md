# Weather-Aware Truck Routing

> Multi-route weather risk evaluation and dispatch recommendation system for commercial freight. Evaluates 3 distinct highway corridors, computes arrival-time weather at 5-mile checkpoints adjusted for vehicle load weight, and recommends the safest route.

---

## 🌐 Live Demo

- **Frontend (Vercel):** [https://weather-aware-truck-routing-liard.vercel.app](https://weather-aware-truck-routing-liard.vercel.app)
- **Backend API (Render):** [https://weather-aware-truck-routing-r9x5.onrender.com](https://weather-aware-truck-routing-r9x5.onrender.com)
- **Loom Walkthrough:** LOOM_LINK_HERE *(placeholder)*

> [!NOTE]
> The backend runs on Render's free tier. If the service has been inactive, the first request may take approximately 50–60 seconds to spin up. Subsequent requests respond in under 1 second.

---

## 📸 Screenshots

Reference captures showcasing core user workflows:

- **01. Multi-Route Overview & Interactive Map:**  
  `docs/screenshots/01-routes-and-map.png`  
  *Three alternative truck routes rendered in MapLibre GL with selectable routes and primary safety indicators.*

- **02. Checkpoint Weather Detail Popup:**  
  `docs/screenshots/02-checkpoint-popup.png`  
  *Clicking any checkpoint displays ETA, sustained wind, peak gust, rain rate, snowfall, risk category, and specific load escalation reasons.*

- **03. 48-Hour Corridor Heatmap & Scrubbing Slider:**  
  `docs/screenshots/03-heatmap-slider.png`  
  *Corridor grid points and heatmap density showing spatial weather risk progression from departure up to +48 hours.*

- **04. Ranked Route Comparison Cards:**  
  `docs/screenshots/04-route-cards.png`  
  *Side-by-side comparison cards breaking down miles by risk level, average risk index, travel duration, and lexicographic rank.*

---

## ✨ Features

- **3 Alternative Highway Corridors:** Generates 3 realistic commercial truck routes between origin and destination via TomTom Routing API (or synthetic multi-corridor fallback under `DEMO_MODE=true`).
- **ETA-Specific Checkpoint Weather Sampling:** Samples points at 5-mile base increments and computes piecewise arrival times (`departure_time + travel_time`). Fetches synchronized hourly forecast weather (wind speed, wind gusts, rain, convective showers, snowfall) from Open-Meteo.
- **Dynamic Checkpoint Intervals:** Instantly toggle between 10-mile, 25-mile, or 50-mile checkpoint views directly on the map without re-fetching data.
- **Load-Aware Risk Escalation:** Implements specialized commercial truck physics rules—high winds elevate risk more aggressively for heavier loads.
- **4-Step Lexicographic Route Ranking:** Deterministic safety tie-breaker prioritizes minimizing severe conditions before considering travel duration.
- **0–48 Hour Corridor Risk Slider:** Scrub through 49 hours of corridor risk at 60 FPS using client-side GPU paint properties with zero network calls.
- **Dual Corridor Visualization:** Circle point layer guarantees visibility even during all-Low weather conditions, combined with a smooth density heatmap.

---

## 🏗️ Architecture

The system is built as a decoupled full-stack application:

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, MapLibre GL JS, TanStack Query.
- **Backend:** Django 5, Django REST Framework, WhiteNoise, Gunicorn, httpx (async HTTP client).
- **External Services:**
  - **TomTom API:** Route calculation with commercial truck profiles, geocoding & address autocomplete.
  - **Open-Meteo API:** High-resolution hourly weather forecasts sampled over a 0.1° coordinate grid with 30-minute backend caching.

### Request Flow Diagram

```text
[ Browser / Client ]
       │
       │ 1. POST /api/trips/plan {origin, destination, departure_at, load_weight_lb}
       ▼
[ Django Backend (Render) ]
       │
       ├─► 2. TomTom Routing API
       │      └─► Computes 3 truck routes (polyline geometry, segment durations, distances)
       │
       ├─► 3. Checkpoint Sampler & ETA Engine
       │      └─► Samples polyline at 5-mile steps, computes piecewise ETA per point
       │      └─► Snaps checkpoint coordinates to 0.1° grid cells (~7 mi resolution)
       │
       ├─► 4. Open-Meteo Forecast API (Async Batched + Cached)
       │      └─► Queries hourly wind, gusts, rain, showers, snow for grid cells
       │
       ├─► 5. Risk Assessment Engine
       │      └─► Compares ETA against hourly forecasts
       │      └─► Applies weather thresholds + truck load escalation rules
       │
       ├─► 6. Lexicographic Ranker
       │      └─► Evaluates No Travel mi → Severe mi → High mi → Avg risk → Duration
       │
       ├─► 7. Corridor Heatmap Generator (Background Task / Cache)
       │      └─► Pre-computes r0...r48 hourly risk vectors across corridor grid
       │
       ▼
[ Browser / Client ]
       │ 8. Renders routes, checkpoints, and route cards
       │ 9. GET /api/trips/{trip_id}/heatmap
       └─► 10. MapLibre GL paints corridor layers; slider scrubs @ 60fps client-side
```

---

## ⚖️ Risk Rules & Lexicographic Ranking

### 1. Base Weather Thresholds

Lower bounds are inclusive:

| Level | Risk Name | Sustained Wind (`wind_mph`) | Total Rain (`rain_in_hr`) | Snowfall (`snow_in_hr`) |
| :---: | :--- | :---: | :---: | :---: |
| **0** | **Low** (Green) | < 25 mph | < 0.10 in/h | < 0.50 in/h |
| **1** | **Moderate** (Yellow) | [25, 35) mph | [0.10, 0.25) in/h | [0.50, 1.00) in/h |
| **2** | **High** (Orange) | [35, 45) mph | [0.25, 0.50) in/h | [1.00, 2.00) in/h |
| **3** | **Severe** (Red) | [45, 55) mph | [0.50, 1.00] in/h | [2.00, 3.00] in/h |
| **4** | **No Travel** (Dark Purple) | ≥ 55 mph | > 1.00 in/h | > 3.00 in/h |

### 2. Commercial Truck Load Escalation Rules

Load rules can only elevate risk level, never lower it:

1. **Extreme Wind Rule:**  
   `wind >= 55 mph` $\rightarrow$ **No Travel (4)** for any vehicle weight.
2. **Heavy Vehicle High Wind Rule:**  
   `45 <= wind < 55 mph` AND `load_weight_lb > 30,000 lb` $\rightarrow$ raised to **No Travel (4)**.
3. **Loaded Vehicle Moderate Wind Rule:**  
   `35 <= wind < 45 mph` AND `load_weight_lb > 40,000 lb` $\rightarrow$ raised to **Severe (3)**.

### 3. Lexicographic Ranking Order

Routes are compared deterministically using a 5-tuple tie-breaker:

$$\text{Rank Key} = (\text{No Travel Miles},\ \text{Severe Miles},\ \text{High Miles},\ \text{Average Risk},\ \text{Duration Seconds})$$

- If all routes contain No Travel miles, the frontend displays an explicit safety warning banner advising dispatch delay.

---

## 📌 Assumptions

1. **Inclusive Lower Bounds:** For all boundary thresholds, intervals are defined with inclusive lower limits and exclusive upper limits (e.g., wind speed of 35.0 mph falls into High risk).
2. **Sustained Wind Governs Rules:** Risk level and truck load escalation rules are driven by sustained 10-meter wind (`wind_speed_10m`). Peak wind gusts (`wind_gusts_10m`) are reported in checkpoint popups for operator situational awareness.
3. **Rain Rate Aggregation:** Total liquid precipitation is calculated as the sum of large-scale rain and convective showers (`rain + showers` in inches/hour).
4. **No Travel Ranked First:** Avoiding impassable / rollover-critical miles (`no_travel_mi`) is strictly prioritized before evaluating severe miles.
5. **Slider Elapsed Hours:** Slider hours (0 to 48) represent elapsed hours from the scheduled trip departure timestamp ($T_{\text{depart}} + h$).

---

## 💻 Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+ (tested on Node v24)
- Git

### 1. Backend Setup

```bash
# Clone the repository
git clone https://github.com/Muhammad-Awais-second/Weather-Aware-Truck-Routing.git
cd Weather-Aware-Truck-Routing

# Create and activate virtual environment
cd backend
python -m venv venv
# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables (copy example)
cp .env.example .env

# Run database migrations
python manage.py migrate

# Start backend server
python manage.py runserver 127.0.0.1:8000
```
Backend will be running at `http://127.0.0.1:8000/`.

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd ../frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env

# Start Vite development server
npm run dev
```
Frontend will be running at `http://localhost:5173/`.

---

## 🔐 Environment Variables

### Backend (`backend/.env`)

| Variable Name | Required | Default / Fallback | Description |
| :--- | :---: | :---: | :--- |
| `DJANGO_SECRET_KEY` | Production | Insecure default | Secret key for Django cryptographic signing |
| `DEBUG` | No | `False` | Enables/disables Django debug mode |
| `ALLOWED_HOSTS` | Production | `*` | Comma-separated list of allowed host header values |
| `CORS_ALLOWED_ORIGINS` | Production | Allow all | Comma-separated list of allowed frontend origins |
| `TOMTOM_API_KEY` | Yes (or demo) | Empty | TomTom API key for routing and geocoding |
| `REDIS_URL` | No | `LocMemCache` | Optional Redis URL for caching; falls back to local memory |
| `DEMO_MODE` | No | `false` | When `true`, allows synthetic routing when TomTom key is omitted |

### Frontend (`frontend/.env`)

| Variable Name | Required | Default / Fallback | Description |
| :--- | :---: | :---: | :--- |
| `VITE_API_BASE_URL` | Production | `""` (Vite proxy in dev) | Base URL for backend API (e.g. Render hosted URL) |
| `VITE_MAP_STYLE_URL` | No | OpenFreeMap Liberty | MapLibre vector style URL (no API key required) |

---

## 🧪 Testing & Code Coverage

Tests are executed with `pytest` and `pytest-cov`, verifying risk boundaries, truck load escalation logic, the 5-step lexicographic ranker, piecewise ETA interpolation, and API contract status codes.

```bash
cd backend
pytest --cov=routing
```

### Verified Test Run Output

```text
============================= test session starts =============================
platform win32 -- Python 3.14.0, pytest-9.2.0, pluggy-1.7.0
rootdir: C:\Users\DANISH LAPTOP\Downloads\new project\backend
configfile: pytest.ini
plugins: anyio-4.16.0, cov-7.1.0, django-4.14.0, respx-0.23.1
collected 21 items

routing/tests/test_api.py::test_health_check_endpoint PASSED             [  4%]
routing/tests/test_api.py::test_missing_tomtom_key_returns_503 PASSED    [  9%]
routing/tests/test_api.py::test_geocode_with_tomtom_api_key PASSED       [ 14%]
routing/tests/test_api.py::test_plan_trip_validation_same_origin_dest PASSED [ 19%]
routing/tests/test_api.py::test_plan_trip_and_heatmap_with_tomtom_key PASSED [ 23%]
routing/tests/test_api.py::test_plan_trip_demo_mode_active PASSED        [ 28%]
routing/tests/test_ranker.py::test_step1_no_travel_miles_decides PASSED  [ 33%]
routing/tests/test_ranker.py::test_step2_severe_miles_decides PASSED     [ 38%]
routing/tests/test_ranker.py::test_step3_high_miles_decides PASSED       [ 42%]
routing/tests/test_ranker.py::test_step4_avg_risk_decides PASSED         [ 47%]
routing/tests/test_ranker.py::test_step5_duration_decides PASSED         [ 52%]
routing/tests/test_ranker.py::test_all_routes_have_no_travel PASSED      [ 57%]
routing/tests/test_risk.py::test_wind_boundaries PASSED                  [ 61%]
routing/tests/test_risk.py::test_rain_boundaries PASSED                  [ 66%]
routing/tests/test_risk.py::test_snow_boundaries PASSED                  [ 71%]
routing/tests/test_risk.py::test_load_rule_45mph PASSED                  [ 76%]
routing/tests/test_risk.py::test_load_rule_35mph PASSED                  [ 80%]
routing/tests/test_risk.py::test_load_rule_55mph_any_load PASSED         [ 85%]
routing/tests/test_risk.py::test_load_rules_never_lower_level PASSED     [ 90%]
routing/tests/test_sampler.py::test_straight_line_sampling PASSED        [ 95%]
routing/tests/test_sampler.py::test_piecewise_eta_interpolation_slow_first_segment PASSED [100%]

=============================== tests coverage ================================
Name                             Stmts   Miss  Cover
----------------------------------------------------
routing\__init__.py                  0      0   100%
routing\admin.py                     1      1     0%
routing\apps.py                      3      0   100%
routing\clients\__init__.py          0      0   100%
routing\clients\openmeteo.py       116     12    90%
routing\clients\tomtom.py          144     31    78%
routing\migrations\__init__.py       0      0   100%
routing\models.py                    1      0   100%
routing\serializers.py              23      2    91%
routing\services\__init__.py         0      0   100%
routing\services\corridor.py        44      3    93%
routing\services\planner.py         49      0   100%
routing\services\ranker.py          54      1    98%
routing\services\risk.py            52      2    96%
routing\services\sampler.py        106     12    89%
routing\tests\__init__.py            0      0   100%
routing\tests\test_api.py           91      1    99%
routing\tests\test_ranker.py        41      0   100%
routing\tests\test_risk.py          49      0   100%
routing\tests\test_sampler.py       32      0   100%
routing\urls.py                      3      0   100%
routing\views.py                    61     14    77%
----------------------------------------------------
TOTAL                              870     79    91%
============================= 21 passed in 6.70s ==============================
```

---

## 📡 API Endpoints

### 1. `POST /api/trips/plan`
Calculates 3 alternative truck routes, samples checkpoints at 5-mile increments, matches arrival times against hourly weather, applies load escalation rules, and returns ranked routes.

**Request:**
```http
POST /api/trips/plan
Content-Type: application/json

{
  "origin": { "lat": 32.7767, "lon": -96.7970, "label": "Dallas, TX" },
  "destination": { "lat": 39.7392, "lon": -104.9903, "label": "Denver, CO" },
  "departure_at": "2026-11-08T06:00:00Z",
  "load_weight_lb": 38000
}
```

**Response (200 OK):**
```json
{
  "trip_id": "01ea41e2caf845e1",
  "demo_mode": false,
  "recommended_route_id": "r1",
  "recommendation_reason": "Lowest weather risk profile (14.2 fewer Severe miles than Route B)",
  "no_safe_route": false,
  "routes": [
    {
      "id": "r1",
      "name": "Interstate Primary",
      "rank": 1,
      "geometry": {
        "type": "LineString",
        "coordinates": [[-96.7970, 32.7767], [-97.0215, 33.1042], [-104.9903, 39.7392]]
      },
      "summary": {
        "distance_mi": 794.2,
        "duration_s": 45120,
        "arrival_at": "2026-11-08T18:32:00Z",
        "miles_by_level": {
          "Low": 610.0,
          "Moderate": 140.0,
          "High": 44.2,
          "Severe": 0.0,
          "No Travel": 0.0
        },
        "avg_risk": 0.31,
        "max_level": "High"
      },
      "checkpoints": [
        {
          "mile": 25.0,
          "lat": 33.1042,
          "lon": -97.0215,
          "intervals": [25, 50],
          "eta": "2026-11-08T06:26:00Z",
          "weather": {
            "wind_mph": 18.2,
            "gust_mph": 27.5,
            "rain_in_hr": 0.02,
            "snow_in_hr": 0.0
          },
          "level": "Low",
          "reasons": []
        }
      ]
    }
  ]
}
```

### 2. `GET /api/trips/{trip_id}/heatmap`
Returns pre-computed corridor grid points with multi-hour risk indices (`r0` to `r48`) for client-side slider scrubbing.

**Response (200 OK):**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-97.1000, 33.2000]
      },
      "properties": {
        "r0": 0,
        "r1": 0,
        "r6": 1,
        "r12": 2,
        "r24": 3,
        "r48": 0
      }
    }
  ]
}
```

### 3. `GET /api/geocode?q=Dallas`
Queries TomTom Search API and returns structured coordinate suggestions.

**Response (200 OK):**
```json
[
  {
    "label": "Dallas, TX, United States",
    "lat": 32.7767,
    "lon": -96.7970
  }
]
```

### 4. `GET /api/health`
Health check endpoint returning system status.

**Response (200 OK):**
```json
{
  "status": "ok",
  "service": "truck-weather-routing"
}
```

---

## 🚀 Deployment Guide

### Backend: Render Configuration
- **Environment:** Python 3
- **Root Directory:** `backend`
- **Build Command:** `pip install -r requirements.txt && python manage.py migrate`
- **Start Command:** `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 3`
- **Required Environment Variables on Render:**
  - `DJANGO_SECRET_KEY`: Long random string
  - `DEBUG`: `False`
  - `ALLOWED_HOSTS`: `weather-aware-truck-routing-r9x5.onrender.com,localhost`
  - `CORS_ALLOWED_ORIGINS`: `https://weather-aware-truck-routing-liard.vercel.app`
  - `TOMTOM_API_KEY`: Your TomTom API key (or `DEMO_MODE=true` for synthetic mode)

### Frontend: Vercel Configuration
- **Framework Preset:** Vite
- **Root Directory:** `frontend`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Required Environment Variables on Vercel:**
  - `VITE_API_BASE_URL`: `https://weather-aware-truck-routing-r9x5.onrender.com`
  - `VITE_MAP_STYLE_URL`: `https://tiles.openfreemap.org/styles/liberty`

---

## 🔍 Known Limitations & Future Work

1. **7-Day Weather Horizon:** Open-Meteo hourly weather forecasts extend up to 7 days into the future. Departures scheduled beyond 168 hours cannot be evaluated.
2. **Static Route Pre-Calculation:** Routes and checkpoints are evaluated against weather predicted for arrival times determined at departure. Mid-journey delays or live traffic speed disruptions currently require recalculating the plan.
3. **Truck Restriction Constraints:** Commercial vehicle routing profiles (bridge height, axle load limits, hazmat restrictions) depend on TomTom's commercial road network database coverage.
4. **Gross Vehicle Weight Simplification:** Load weight rules use Gross Vehicle Weight Rating (GVWR up to 80,000 lb). Axle-specific weight distribution (steer, drive, tandem) and empty trailer wind-sail surface areas can be incorporated in future iterations.
5. **Real-Time Highway Weather Cameras & Warnings:** Integration with state DOT 511 traveler feeds and NOAA severe weather alerts (Tornado / Severe Thunderstorm warnings) represents a valuable next step for operational dispatchers.
