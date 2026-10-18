# GetChum Commercial Strategy & Business Model Blueprint
**Operational Geography:** Fife & Edinburgh, Scotland  
**Target Market:** UK Private Hire & Taxi Digital Dispatch Ecosystem  
**Comparative Source Benchmarks:** RevenueBase.ai & Slashdot UK Taxi Dispatch Software Directories  

---

## 1. Executive Summary & Market Intelligence

The UK taxi and ride-hailing ecosystem has undergone massive structural changes over the last 5 years. Technology providers and transport operators in the UK fall into four distinct operational categories:

```
                            UK TAXI & PRIVATE HIRE SPECTRUM
                                           │
         ┌─────────────────────┬───────────┴───────────┬─────────────────────┐
         ▼                     ▼                       ▼                     ▼
     Category 1            Category 2              Category 3            Category 4
    B2B Dispatch SaaS     High-Take B2C App       B2B Aggregator/Broker Traditional Circuit
  (Autocab, iCabbi, Cab9, (Uber, Bolt, FreeNow)   (Minicabit, Karhoo,   (Veezu, Local Bases:
   TaxiCaller, Cordic)                             Jyrney, Splyt)        Capital, City Cabs)
```

### Analysis of Benchmark Directories:

#### A. Slashdot UK Taxi Dispatch Leaders
1. **Autocab Ghost (Owned by Uber):** Dominates larger fleets (100–1,000+ vehicles). Charges enterprise SaaS fees equivalent to **~£2.85 to £4.00+ per driver/week** plus upfront software licensing, hardware, and VoIP PBX integration. Leverages the *iGo network* to channel overflow trips between operators and Uber.
2. **iCabbi:** Cloud-native enterprise dispatch operating hundreds of UK fleets. Pricing is structured around **~£3.00/driver/week** plus booking fees (15p–25p per automated passenger app trip) and branded passenger app maintenance fees.
3. **Cab9:** Modern cloud private hire platform favored by executive, corporate, and regional fleets. Monetizes via tiered monthly SaaS packages based on active vehicle counts.
4. **TaxiCaller:** Transparent pay-as-you-go model (**~£0.79/driver/week** or **£16–£23/vehicle/month**), with no long-term contracts. Targeted at smaller, independent operators.

#### B. RevenueBase.ai UK Ride-Hailing Software Index
* Covers 86 UK software entities spanning consumer platforms (*Bolt, Uber UK, Ola UK, FreeNow*), regional consolidators (*Veezu*), and corporate/airport booking aggregators (*Minicabit, Karhoo, Splyt, Jyrney*).
* **Consolidation Trend:** Fleet consolidators like *Veezu* are acquiring local radio circuits across the UK, imposing corporate rules and raising weekly radio rent for drivers to £120–£160/week.
* **Driver Dissatisfaction:** Drivers in Scotland are increasingly alienated by 20%–25% take-rates from Uber/Bolt and the rigid £140/week radio rent charged by traditional base operators.

---

## 2. Regulatory & Tax Reality in Scotland

Any commercial model deployed in Fife and Edinburgh must comply with Scottish transport law and current UK tax requirements:

### 2.1 Civic Government (Scotland) Act 1982
* **Booking Office Licence (2009 Order):** In Scotland, taking bookings for 4 or more private hire cars or taxis requires a **Booking Office Licence** issued by the relevant local authority (**Fife Council** and **City of Edinburgh Council**).
* **Record Keeping:** The platform must log the date, time, passenger pickup/dropoff points, fare charged, vehicle registration, and driver badge number for every booking (all natively tracked in GetChum's MongoDB dispatch records).

### 2.2 Post-Aslam & Supreme Court VAT Landscape
* Following *Uber BV v Aslam* [2021] UKSC 5 and High Court rulings (*Sefton MBC v TfL*), platforms operating as the contractual **principal** provider of transport must account for **20% VAT on the entire passenger fare**, significantly compressing operator margins.
* **The Agent / Technology Marketplace Route (Route B):** GetChum operates as a technology facilitator and booking agent connecting passengers directly with self-employed licensed private hire drivers. VAT applies solely to the **platform technology fee / booking fee**, preserving maximum take-home earnings for the driver.

---

## 3. The Recommended Business Model for GetChum

### 🏆 "The Driver-First Hybrid Marketplace" (Freemium Pay-Per-Ride + Unlimited Pro Cap)

Instead of a high 25% Uber commission (which repels drivers) or a rigid £130/week radio rent (which scares off new recruits), GetChum adopts a **Two-Sided Hybrid Model**:

```
                                      GETCHUM COMMERCIAL ENGINE
                                                  │
                ┌─────────────────────────────────┴─────────────────────────────────┐
                ▼                                                                   ▼
       DRIVER SUPPLY REVENUE                                              PASSENGER DEMAND REVENUE
  ┌──────────────────────────────────────────┐                       ┌────────────────────────────────┐
  │ Tier 1: Pay-As-You-Earn                  │                       │ Passenger Platform Booking Fee │
  │ 8% platform fee per completed trip       │                       │ £0.75 – £1.00 fixed card fee   │
  │ (Zero upfront cost, 92% payout)          │                       │ charged at checkout            │
  │                                          │                       └────────────────────────────────┘
  │ Tier 2: Weekly Pro Cap (£30 - £35/week)  │                                       ▲
  │ Once fees hit £35 in a Mon–Sun cycle,    │                                       │
  │ platform commission drops to 0%!         │                                       │
  └──────────────────────────────────────────┘                                       │
                         │                                                           │
                         └─────────────────────────┬─────────────────────────────────┘
                                                   ▼
                                     TOTAL SUSTAINABLE GROSS PROFIT
```

---

### 3.1 Monetization Streams

#### Stream 1: Driver Platform Technology Fee (Pay-As-You-Earn)
* **Rate:** **8.0%** deducted from the gross fare (Configured in `backend/app/config.py`: `DRIVER_COMMISSION_PERCENTAGE = 8.0`).
* **Driver Take-Home:** **92.0%** of metered/quoted fares.
* **Competitor Comparison:**
  * Uber: 25.0% commission
  * Bolt: 20.0% commission
  * **GetChum: 8.0% commission** $\rightarrow$ *Immediate competitive advantage for driver acquisition.*

#### Stream 2: The "GetChum Pro" Weekly Fee Cap
* **Cap Level:** **£30.00 to £35.00 / week** (Monday 00:00 to Sunday 23:59).
* **How it Works:** Once an active full-time driver has generated £35 in platform fees during a single week, all subsequent trips that week incur **0% platform fee**.
* **Driver Psychology:** Full-time drivers clearing £800–£1,200/week pay only £35 in platform rent (versus £120–£160/week to a local radio base). Drivers become active ambassadors, encouraging riders to book through GetChum.

#### Stream 3: Passenger Technology & Booking Fee
* **Rate:** **£0.75 to £1.00 flat fee** added to the passenger fare on card checkout.
* **Function:** Directly offsets Stripe credit card processing fees (~1.5% + 20p) and covers cloud server/database hosting, ensuring zero operational drag on gross margins.
* **Example £15.00 Journey:**
  * Passenger pays: **£15.75** (£15.00 fare + £0.75 booking fee)
  * Driver receives: **£13.80** (92% of £15.00)
  * Platform Gross Revenue: **£1.95** (£1.20 driver cut + £0.75 rider fee = **12.4% effective take** with zero driver friction).

#### Stream 4: Airport & Long-Distance Corridor Transfers (High Ticket)
* Dedicated fixed-fare pricing for high-traffic Fife & Edinburgh corridors:
  * Dunfermline / Kirkcaldy $\longleftrightarrow$ Edinburgh Airport (EDI): £45 – £55
  * St Andrews $\longleftrightarrow$ Edinburgh Airport / City Centre: £75 – £95
* **Platform Airport Transfer Fee:** Flat **£4.00 to £5.00** per pre-booked transfer. Drivers net £40–£70+ in a single trip, while GetChum secures high gross margins.

---

## 4. Financial Projections & Unit Economics

Based on local market penetration across Fife (Dunfermline, Kirkcaldy, Glenrothes, St Andrews) and North Edinburgh:

| Metric | Phase 1: Launch (Months 1–3) | Phase 2: Growth (Months 4–8) | Phase 3: Scale (Months 9–12+) |
| :--- | :---: | :---: | :---: |
| **Active Drivers** | 15 drivers | 45 drivers | 100 drivers |
| **Average Daily Trips / Driver** | 6 trips | 10 trips | 12 trips |
| **Total Monthly Completed Trips** | **2,700 trips** | **13,500 trips** | **36,000 trips** |
| **Average Gross Trip Fare** | £14.50 | £15.00 | £15.50 |
| **Platform Take / Trip (Blended)** | £1.85 *(8% + 75p)* | £1.65 *(accounts for Pro caps)* | £1.45 *(blended)* |
| **Estimated Monthly Gross Profit** | **£4,995 / month** | **£22,275 / month** | **£52,200 / month** |
| **Monthly Tech / Hosting Costs** | ~£85 *(Docker, VPS, MongoDB)* | ~£250 *(scaled server/Redis)* | ~£650 *(managed clusters)* |
| **Estimated Net Monthly Operating Margin**| **~98%** | **~98%** | **~98%** |

---

## 5. Driver Acquisition & Go-To-Market Playbook

```
                         GO-TO-MARKET FUNNEL (FIFE & EDINBURGH)
                                           │
         ┌─────────────────────────────────┴─────────────────────────────────┐
         ▼                                                                   ▼
   SUPPLY (DRIVERS FIRST)                                             DEMAND (RIDERS)
   • Airport waiting lots (EDI Ingliston)                             • University of St Andrews student union
   • Local PH driver Facebook/WhatsApp groups                         • Late-night weekend bar & pub queues
   • Flyer pitch: "Keep 92% — Stop paying £140/wk"                    • Railway station pickup points (Inverkeithing)
   • Zero risk: run GetChum alongside Uber/base                       • Pre-booked airport fixed-price transfers
```

### 5.1 Supply Recruitment Tactics (The "Keep 92%" Campaign)
1. **Airport Waiting Staging Areas (EDI / Ingliston):** Private hire drivers waiting between flights frequently discuss fuel prices and commission cuts. Hand out concise one-pagers: *"Keep 92% of your fare with GetChum. Zero weekly radio rent. Switch on when you want."*
2. **Dual-App Friendly:** Allow drivers to run GetChum concurrently with their existing circuit or Uber. Because there is zero upfront subscription fee, joining carries zero downside for the driver.

### 5.2 Demand-Side Anchors (High-Conversion Corridors)
1. **University of St Andrews:** High student density with significant demand for trips to Leuchars train station (£12–£15) and Edinburgh Airport (£75–£90).
2. **Train Station Commuters:** Commuter hubs such as **Inverkeithing**, **Dunfermline City**, and **Kirkcaldy** where local base response times are notoriously slow during peak hours.
3. **Fife $\longleftrightarrow$ Edinburgh Weekend Night Economy:** Bridge runs between Edinburgh nightlife and Fife towns where Uber fares surge excessively, leaving riders seeking reliable alternatives.

---

## 6. Implementation Checklist & Codebase Alignment

* [x] **Driver Commission Parameter:** Confirmed at `8.0%` in `backend/app/config.py` (`DRIVER_COMMISSION_PERCENTAGE = 8.0`).
* [x] **Stripe Connect Payout Architecture:** Implemented in `backend/app/routers/payments.py` to route driver payouts directly without holding platform funds as a transport principal.
* [x] **Control Room Live Dispatch Cockpit:** Deployed and operational at `https://admin.getchum.co.uk` with queue tracking and auto/manual assignment.
* [ ] **Add Passenger Booking Fee (£0.75):** Include standard `booking_fee: 0.75` in the quote computation endpoint (`backend/app/routers/rides.py`).
* [ ] **Weekly Fee Cap Logic:** Add a weekly driver fee accumulator that automatically sets commission to 0% once £35 is reached in a single billing week.
