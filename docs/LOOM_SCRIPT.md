# Loom Video Walkthrough Script (7–8 Minutes)

> **Spotter Full Stack Developer Assessment · Weather-Aware Truck Routing**  
> Candidate: Muhammad Awais  
> Keep your camera bubble enabled in the corner throughout the recording. Focus on architectural choices, correctness, and trade-offs.

---

## ⏱️ Timeline Overview

| Timestamp | Duration | Section | Primary Focus |
|---|---|---|---|
| **0:00** | 0:30 | **1. Introduction** | Who you are & high-level system summary |
| **0:30** | 2:30 | **2. Live Demo** | Dallas → Denver trip, routes, checkpoints, 60fps slider |
| **3:00** | 1:00 | **3. Load Escalation Demo** | 38k lb vs 20k lb weight impact on Severe/No Travel |
| **4:00** | 2:00 | **4. Code Architecture Tour** | `planner.py`, `risk.py`, `ranker.py`, and paint property scrubbing |
| **6:00** | 0:30 | **5. Automated Test Suite** | Run `pytest --cov=routing` on screen (91% coverage) |
| **6:30** | 1:00 | **6. Trade-offs & Next Steps** | Assumptions, API quotas, and real-world trucking considerations |

---

## 🎬 Section-by-Section Talking Points

### 1. Introduction (0:00 – 0:30)
- **Visual:** Full-screen browser on the web application.
- **Talking Points:**
  - *"Hi Spotter team, my name is Muhammad Awais. Today I'm presenting my submission for the Weather-Aware Truck Routing assessment."*
  - *"The goal of this system is to evaluate 3 viable truck highway corridors between any two locations in the US, correlate each corridor's ETA-specific checkpoints with hourly weather forecasts, apply vehicle gross load safety rules, and recommend the safest route using a 4-step lexicographic ranking order."*
  - *"The stack is built with Django 5 and Django REST Framework on the backend, and React 19, TypeScript, Vite, Tailwind CSS, and MapLibre GL JS on the frontend."*

---

### 2. Live Demo (0:30 – 3:00)
- **Visual:** Fill form using the quick preset button **"Dallas → Denver (38k lb)"**.
- **Talking Points:**
  - *"Let's test a long-distance cross-country trip: Dallas, TX to Denver, CO with a 38,000 lb load departing tomorrow at 6:00 AM."*
  - **Click 'Find Safest Truck Route':**
    - Point out the loading states: route geometry slicing, 5-mile base sampling, batched Open-Meteo queries, and risk ranking.
  - **Inspect Route Cards:**
    - Highlight Route A with the green **"Recommended"** badge and read the plain-language reason (e.g., *"14.2 fewer Severe miles than Route B"*).
    - Note the distance-weighted average risk score and the segmented color bar showing Low, Moderate, High, and Severe mileage exposure.
  - **Interactive Map:**
    - Click an inactive route to show active route highlight while inactive routes fade to 40% opacity.
    - Click a checkpoint dot on the map: show the popup detailing mile marker, arrival ETA, sustained wind, peak gusts, rain/snow rates, and risk classification reasons.
  - **Instant Filtering:**
    - Toggle the checkpoint interval between **10 mi**, **25 mi**, and **50 mi**: demonstrate that switching intervals happens instantly client-side without any network requests.
  - **Corridor Heatmap & 60fps Scrubbing:**
    - Toggle the Heatmap on.
    - Scrub the 0–48 hour slider smoothly: point out that the slider displays the absolute local arrival time (`+12 h · Sat 4:00 PM`) and scrubs at 60 fps using MapLibre GL's native `heatmap-weight` WebGL paint property, requiring zero network roundtrips.

---

### 3. Load Escalation Demo (3:00 – 4:00)
- **Visual:** Switch the load weight input on screen.
- **Talking Points:**
  - *"A critical requirement of the assessment is truck load weight rules. A sustained wind of 45 mph is classified as Severe for lighter trucks, but escalates to 'No Travel' for any load exceeding 30,000 lb."*
  - *"Similarly, winds between 35 and 44 mph escalate to Severe when gross load exceeds 40,000 lb."*
  - *"Notice that when we adjust weight from 38,000 lb down to 20,000 lb and re-plan, the checkpoints de-escalate from No Travel to Severe, potentially shifting the safest recommended route."*
  - Explain that load escalation rules only raise risk levels, never lower them, and that every elevated checkpoint records the specific reason.

---

### 4. Code Architecture Tour (4:00 – 6:00)
- **Visual:** Switch to VS Code / Editor.
- **Key Files to Walk Through:**
  1. [`routing/services/planner.py`](file:///c:/Users/DANISH%20LAPTOP/Downloads/new%20project/backend/routing/services/planner.py):
     - Explain the thin view / rich service architecture.
     - Walk through the 5-step pipeline: route generation → 5-mile base sampling → batched Open-Meteo queries → risk scoring → lexicographic ranking.
  2. [`routing/services/risk.py`](file:///c:/Users/DANISH%20LAPTOP/Downloads/new%20project/backend/routing/services/risk.py):
     - Show the boundary conditions and inclusive lower bounds.
     - Show `checkpoint_level(...)` applying load escalation and logging plain-language reasons.
  3. [`routing/services/ranker.py`](file:///c:/Users/DANISH%20LAPTOP/Downloads/new%20project/backend/routing/services/ranker.py):
     - Show the ranking tuple: `(no_travel_mi, severe_mi, high_mi, round(avg_risk, 2), duration_s)`.
     - Point out the `no_safe_route` flag that triggers the warning banner when all routes encounter extreme weather.
  4. [`frontend/src/components/MapView.tsx`](file:///c:/Users/DANISH%20LAPTOP/Downloads/new%20project/frontend/src/components/MapView.tsx):
     - Show how the slider triggers `map.setPaintProperty("corridor-heatmap", "heatmap-weight", ["get", "r" + hourOffset])` inside `requestAnimationFrame` for 60fps scrubbing with 0 network calls.

---

### 5. Automated Tests & Coverage (6:00 – 6:30)
- **Visual:** Open terminal in `backend/`.
- **Run Command:**
  ```bash
  pytest --cov=routing
  ```
- **Talking Points:**
  - *"Here is the automated test suite. We have 21 comprehensive tests covering every single threshold boundary (24.9 vs 25 mph, 44.9 vs 45 mph, rain, snow), every load escalation rule (30,000 vs 30,001 lb), all 5 tie-breaking steps, piecewise ETA interpolation, and API contract mocks."*
  - *"All 21 tests pass in 12 seconds with 91% total code coverage across the entire routing application."*

---

### 6. Trade-offs & Next Steps (6:30 – 7:30)
- **Visual:** Return to browser or README.
- **Talking Points:**
  - *"A few deliberate engineering decisions were made:"*
    - *Inclusive Lower Bounds:* Resolved overlapping boundary specifications consistently.
    - *Sustained Wind vs Gusts:* Sustained wind drives safety thresholds, while peak gusts are displayed in popups for operator awareness.
    - *5-Mile Base Slicing:* Ensures risk metrics remain identical whether viewing 10, 25, or 50-mile intervals.
  - *"With more time in a production environment, I would add:"*
    - Mandatory DOT Hours-of-Service (HOS) rest break injection (30-minute break after 8 hours; 10-hour sleeper berth), shifting downstream ETAs realistically.
    - Truck dimension restrictions (bridge heights, gross weight limits, and HazMat tunnel bans).
    - Webhook push notifications for sudden severe weather changes during transit.
  - *"Thank you for your time and for reviewing my submission!"*
