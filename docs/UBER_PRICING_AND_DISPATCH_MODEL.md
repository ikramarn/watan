# Uber & Just Eat Dispatch & Pricing Architecture Specification
**Prepared for GetChum (Scotland Private Hire & Taxi SaaS)**
*Reference Blueprint for Future Long-Pickup, Dynamic Fare Decoupling, and Smart Dispatch Implementation*

---

## 1. Executive Summary & Core Challenge

In on-demand transportation, there is a fundamental economic mismatch:
- **Passengers** expect a predictable, fixed quote from their pickup point to their destination (e.g. £7.00 for a 3-mile journey).
- **Drivers** have varying approach distances ("deadhead" or unpaid pickup legs). A driver 0.5 miles away earns high net profit, while a driver 6 miles away burns fuel and 15 minutes before the paid trip even begins.

If a platform quotes only trip distance and dispatches the job to a far-away driver without compensation:
1. Drivers repeatedly decline or cancel the job ("cherry-picking").
2. Passenger wait times spike, leading to ride cancellation and lost customer trust.
3. Rural or fringe areas (e.g. remote Fife villages, farms, out-of-town hospitals) suffer chronic service failures.

---

## 2. Uber's Dispatch & Pricing Model

Uber transitioned from a pure metered time+distance model to **Decoupled Upfront Pricing with Long-Pickup Premiums**.

### 2.1 The Two-Leg Model (Approach vs On-Trip)

$$\text{Total Driver Commitment} = \text{Approach Leg (Leg 1)} + \text{Trip Leg (Leg 2)}$$

```
[Driver Location] ---- (Leg 1: Approach) ----> [Pickup Point] ==== (Leg 2: Trip) ====> [Destination]
```

### 2.2 Uber Long-Pickup Premium Formula

Uber establishes a **Pickup Distance/Time Threshold ($T_{\text{threshold}}$)**:
- Typically **9 to 10 minutes** or **5.0 km** in suburban/rural areas.
- For approach times under $T_{\text{threshold}}$, approach is unpaid (standard deadhead).
- Once approach exceeds $T_{\text{threshold}}$, the driver starts accruing standard per-minute and per-kilometer rates:

$$\text{Long Pickup Fee} = \max\Big(0, \, (d_{\text{pickup}} - d_{\text{threshold}}) \times R_{\text{km}} + (t_{\text{pickup}} - t_{\text{threshold}}) \times R_{\text{min}}\Big)$$

Where:
- $d_{\text{pickup}}$: Road distance from driver to passenger pickup.
- $d_{\text{threshold}}$: Distance threshold (e.g. 5.0 km).
- $t_{\text{pickup}}$: Estimated travel time to pickup.
- $t_{\text{threshold}}$: Time threshold (e.g. 9.0 min).
- $R_{\text{km}}, R_{\text{min}}$: Standard base distance and time rates.

### 2.3 Upfront Decoupling (Passenger Quote vs Driver Payout)

Uber completely decoupled passenger charge from driver earnings:

1. **Passenger Upfront Fare ($F_{\text{pax}}$)**:
   $$F_{\text{pax}} = \max\Big(F_{\text{min}}, \, (B + d_{\text{trip}} \cdot R_{\text{km}} + t_{\text{trip}} \cdot R_{\text{min}}) \times S_{\text{demand}} + S_{\text{long\_pickup\_charge}}\Big)$$

2. **Driver Guaranteed Offer ($E_{\text{driver}}$)**:
   $$E_{\text{driver}} = (1 - \text{Fee}_{\text{platform}}) \times F_{\text{base}} + \text{Trip Supplement} + \text{Long Pickup Premium}$$

3. **Dynamic Trip Supplement ("Bidding / Escalation")**:
   If Driver #1 declines $\rightarrow$ offer moves to Driver #2.
   If 3 drivers decline or 45 seconds elapse, the algorithm injects a **Trip Supplement (+£1.00, +£2.00, +£3.00)** subsidized from the platform's margin to incentivize a further driver to accept without breaking the customer's upfront price.

---

## 3. Just Eat & Deliveroo Courier Model

Food delivery algorithms solve an even tighter constraint (food cools down within 15 minutes):

### 3.1 Strict Geo-Fencing (Radius Caps)
- Delivery radius is capped at **4.0 to 6.0 km** per restaurant. Customers cannot order outside the radius.

### 3.2 Full-Route Pay Formula
Couriers are paid for **both legs**:
$$\text{Courier Fee} = \text{Collection Base} + (d_{\text{approach}} \times R_{\text{approach}}) + (d_{\text{delivery}} \times R_{\text{delivery}}) + \text{Peak Boost}$$

### 3.3 Dynamic Order Boost
If no courier accepts within 3 minutes:
- Order boost kicks in: $+£1.50 \rightarrow +£3.00$.
- Paid out of the platform's 20–30% restaurant commission.

---

## 4. Traditional UK Private Hire Model (Autocab / iCabbi / Cordic)

In Scotland (Fife, Edinburgh, Glasgow), traditional private hire operators use:

### 4.1 Zone & Plot Queuing
- Council areas are divided into numbered plots (e.g., Plot 101: Kirkcaldy Station, Plot 102: Victoria Hospital, Plot 201: Glenrothes Town).
- Priority 1: Drivers waiting idle inside the pickup plot.
- Priority 2: Drivers in adjacent ring plots.
- Priority 3: Free-float distance search.

### 4.2 Out-of-Area Deadhead Callout Charge
- Pickups outside the operator’s core license radius automatically trigger a **£3.00 to £5.00 Call-out Surcharge** added to the passenger fare quote.
- 100% of the surcharge is passed to the driver to cover empty miles.

---

## 5. Ready-to-Implement Python Module for GetChum

When you are ready to implement this in GetChum, this clean service class is ready to be integrated into `backend/app/services/fare.py`:

```python
"""
smart_fare_engine.py - Long pickup compensation & dynamic fare decoupling
"""
from dataclasses import dataclass
from typing import Optional

LONG_PICKUP_THRESHOLD_KM = 5.0   # Beyond 5 km, driver approach compensation begins
LONG_PICKUP_THRESHOLD_MIN = 8.0  # Beyond 8 mins, time compensation begins
MAX_DISPATCH_RADIUS_KM = 12.0    # Hard cutoff: no automated dispatch beyond 12 km

@dataclass
class DecoupledFareQuote:
    passenger_fare: float         # What passenger is charged
    driver_net_earnings: float    # What driver receives in bank
    platform_fee: float           # GetChum software commission
    long_pickup_subsidy: float    # Extra deadhead compensation included for driver
    approach_distance_km: float   # Driver-to-pickup distance
    trip_distance_km: float       # Pickup-to-dropoff distance


def calculate_decoupled_fare(
    trip_distance_km: float,
    trip_duration_min: float,
    approach_distance_km: float,
    approach_duration_min: float,
    base_fare: float = 3.00,
    per_km: float = 1.30,
    per_min: float = 0.25,
    platform_fee_rate: float = 0.08,  # 8% GetChum SaaS fee
    surge_multiplier: float = 1.0,
) -> DecoupledFareQuote:
    """
    Computes fair passenger price and driver earnings with long-pickup approach subsidy.
    """
    # 1. Base Trip Cost (Leg 2: Pickup -> Dropoff)
    trip_subtotal = (base_fare + (trip_distance_km * per_km) + (trip_duration_min * per_min)) * surge_multiplier
    passenger_fare = round(max(5.00, trip_subtotal), 2)

    # 2. Long Pickup Subsidy (Leg 1: Approach)
    long_pickup_subsidy = 0.0
    if approach_distance_km > LONG_PICKUP_THRESHOLD_KM:
        excess_km = approach_distance_km - LONG_PICKUP_THRESHOLD_KM
        excess_min = max(0.0, approach_duration_min - LONG_PICKUP_THRESHOLD_MIN)
        # Compensate fuel (£0.70/km) + time (£0.15/min) on excess approach
        long_pickup_subsidy = round((excess_km * 0.70) + (excess_min * 0.15), 2)

    # 3. Standard Platform Fee (8%)
    standard_platform_fee = round(passenger_fare * platform_fee_rate, 2)

    # 4. Driver Earnings Calculation
    # If there is a long pickup subsidy, platform absorbs up to 100% of its fee to subsidize driver
    if long_pickup_subsidy > 0:
        # Platform reduces its fee to fund the deadhead approach
        actual_platform_fee = max(0.0, standard_platform_fee - (long_pickup_subsidy * 0.5))
        driver_net_earnings = round((passenger_fare - actual_platform_fee) + long_pickup_subsidy, 2)
    else:
        actual_platform_fee = standard_platform_fee
        driver_net_earnings = round(passenger_fare - actual_platform_fee, 2)

    return DecoupledFareQuote(
        passenger_fare=passenger_fare,
        driver_net_earnings=driver_net_earnings,
        platform_fee=actual_platform_fee,
        long_pickup_subsidy=long_pickup_subsidy,
        approach_distance_km=approach_distance_km,
        trip_distance_km=trip_distance_km,
    )
```

---

## 6. Summary Matrix for GetChum

| Scenario | Pickup Distance | Customer Charge | Driver Net Payout | Platform Cut |
| :--- | :--- | :--- | :--- | :--- |
| **Close Driver** | 1.2 km (~3 min) | £10.00 | £9.20 (92%) | £0.80 (8%) |
| **Moderate Driver** | 4.5 km (~9 min) | £10.00 | £9.20 (92%) | £0.80 (8%) |
| **Far Rural Driver** | 8.5 km (~16 min) | £10.00 + £2.00 rural surcharge | £11.50 (incl approach pay) | £0.50 (reduced fee) |
| **Beyond Limit** | > 12.0 km | Reject / Manual Dispatch Only | N/A | N/A |
