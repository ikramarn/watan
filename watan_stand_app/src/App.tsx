import React, { useState, useEffect } from "react";

interface Bay {
  id: string;
  bayNumber: number;
  corridor: string;
  urduCorridor: string;
  vehicleType: string;
  vehiclePlate: string;
  driverName: string;
  totalSeats: number;
  bookedSeats: number[];
  farePerSeat: number;
  status: "loading" | "full" | "waiting";
  scheduledTime: string;
}

interface TicketRecord {
  id: string;
  code: string;
  bay: number;
  corridor: string;
  seats: number[];
  totalFare: number;
  paidMode: string;
  time: string;
}

export default function App() {
  const [timeStr, setTimeStr] = useState<string>("");
  const [cashCollected, setCashCollected] = useState<number>(142500);
  const [departuresCount, setDeparturesCount] = useState<number>(38);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Active bays state
  const [bays, setBays] = useState<Bay[]>([
    {
      id: "bay_1",
      bayNumber: 1,
      corridor: "Rawalpindi to Lahore",
      urduCorridor: "راولپنڈی تا لاہور (کوسٹر)",
      vehicleType: "Coaster",
      vehiclePlate: "RIP-21-9921",
      driverName: "Rafiq Ahmad",
      totalSeats: 28,
      bookedSeats: Array.from({ length: 28 }, (_, i) => i + 1),
      farePerSeat: 850,
      status: "full",
      scheduledTime: "08:15 PM",
    },
    {
      id: "bay_2",
      bayNumber: 2,
      corridor: "Rawalpindi to Peshawar",
      urduCorridor: "پیرودھائی تا پشاور (ہائی ایس)",
      vehicleType: "HiAce Grand Cabin",
      vehiclePlate: "LES-19-4821",
      driverName: "Tariq Mahmood",
      totalSeats: 14,
      bookedSeats: [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13],
      farePerSeat: 450,
      status: "loading",
      scheduledTime: "08:30 PM",
    },
    {
      id: "bay_3",
      bayNumber: 3,
      corridor: "Pirwadhai to Saddar Shuttle",
      urduCorridor: "پیرودھائی تا صدر (چنگچی)",
      vehicleType: "Qingqi 9-Seater",
      vehiclePlate: "RWP-18-3011",
      driverName: "Bilal Khan",
      totalSeats: 9,
      bookedSeats: [1, 2, 3, 4, 5],
      farePerSeat: 40,
      status: "loading",
      scheduledTime: "Immediate",
    },
  ]);

  // Selected bay for counter ticket dispenser
  const [selectedBayNumber, setSelectedBayNumber] = useState<number>(2);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [cashTendered, setCashTendered] = useState<string>("500");
  const [passengerName, setPassengerName] = useState<string>("");

  // QR Validation input
  const [qrInput, setQrInput] = useState<string>("");
  const [validatedBooking, setValidatedBooking] = useState<any>(null);

  // Tickets history
  const [ticketHistory, setTicketHistory] = useState<TicketRecord[]>([
    {
      id: "tkt_1",
      code: "POS-9812",
      bay: 2,
      corridor: "Rawalpindi - Peshawar",
      seats: [10, 11],
      totalFare: 900,
      paidMode: "Cash Tendered",
      time: "14:38 PKT",
    },
    {
      id: "tkt_2",
      code: "WTN-4410",
      bay: 1,
      corridor: "Rawalpindi - Lahore",
      seats: [27, 28],
      totalFare: 1700,
      paidMode: "Watan App QR (Paid at Counter)",
      time: "14:25 PKT",
    },
  ]);

  // Modal receipt state
  const [receiptModal, setReceiptModal] = useState<TicketRecord | null>(null);

  // Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi" }) + " PKT"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const activeBay = bays.find((b) => b.bayNumber === selectedBayNumber) || bays[0];
  const totalDue = selectedSeats.length * activeBay.farePerSeat;
  const changeDue = Math.max(0, (parseFloat(cashTendered) || 0) - totalDue);

  const toggleSeatSelection = (seatNum: number) => {
    if (activeBay.bookedSeats.includes(seatNum)) return;
    if (selectedSeats.includes(seatNum)) {
      setSelectedSeats(selectedSeats.filter((s) => s !== seatNum));
    } else {
      setSelectedSeats([...selectedSeats, seatNum]);
    }
  };

  const handleIssueCounterTicket = () => {
    if (selectedSeats.length === 0) {
      setAlertMessage("Please select at least 1 seat to issue ticket.");
      return;
    }
    const tendered = parseFloat(cashTendered) || 0;
    if (tendered < totalDue) {
      setAlertMessage(`Insufficient cash tendered. Total due is Rs. ${totalDue}`);
      return;
    }

    const newTicket: TicketRecord = {
      id: "tkt_" + Date.now(),
      code: "POS-" + Math.floor(1000 + Math.random() * 9000),
      bay: activeBay.bayNumber,
      corridor: activeBay.corridor,
      seats: [...selectedSeats],
      totalFare: totalDue,
      paidMode: "Cash at Stand",
      time: new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi" }).slice(0, 5) + " PKT",
    };

    // Update bay booked seats
    setBays((prev) =>
      prev.map((b) =>
        b.bayNumber === activeBay.bayNumber
          ? {
              ...b,
              bookedSeats: [...b.bookedSeats, ...selectedSeats],
              status:
                b.bookedSeats.length + selectedSeats.length >= b.totalSeats ? "full" : "loading",
            }
          : b
      )
    );

    setCashCollected((prev) => prev + totalDue);
    setTicketHistory([newTicket, ...ticketHistory]);
    setSelectedSeats([]);
    setReceiptModal(newTicket);
    setAlertMessage(`Ticket ${newTicket.code} issued successfully! Printed to 58mm thermal POS.`);
  };

  const handleValidateQr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput.trim()) return;

    const mockReservation = {
      code: qrInput.toUpperCase(),
      passenger: "Muhammad Usman",
      phone: "+92 300 1234567",
      bay: 2,
      corridor: "Pirwadhai to Peshawar",
      seats: [3, 4],
      totalFare: 900,
      paymentMode: "Pay at Adda Counter",
      status: "Verified & Cleared to Board",
    };

    setValidatedBooking(mockReservation);
    setAlertMessage(`Reservation ${mockReservation.code} verified! Collect Rs. 900 and mark passenger as boarded.`);
    setQrInput("");
  };

  const handleDepartBay = (bayNumber: number) => {
    const bayToDepart = bays.find((b) => b.bayNumber === bayNumber);
    if (!bayToDepart) return;

    setDeparturesCount((prev) => prev + 1);
    setAlertMessage(`Vehicle ${bayToDepart.vehiclePlate} has departed Stand Bay #${bayNumber}. Gate exit parchi printed.`);

    // Reset bay with next vehicle in queue
    setBays((prev) =>
      prev.map((b) =>
        b.bayNumber === bayNumber
          ? {
              ...b,
              vehiclePlate: "ICT-22-" + Math.floor(1000 + Math.random() * 9000),
              driverName: "Next Pari Driver",
              bookedSeats: [],
              status: "loading",
            }
          : b
      )
    );
  };

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col font-body-md select-none">
      {/* Top Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest border-b border-outline-variant">
        <div className="h-16 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded bg-primary-container text-on-primary-container flex items-center justify-center font-headline-sm font-bold border border-primary">
              WM
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-headline-sm text-lg font-bold text-on-surface">
                  Al-Makkah Wagon Stand, Pirwadhai
                </span>
                <span className="font-urdu-sub text-primary font-bold">(المکہ ویگن اڈہ)</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant font-label-numeric-md text-on-surface-variant">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                  Watan Stand #ISB-001
                </span>
                <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-bold border border-outline-variant">
                  POS-01
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="hidden xl:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-low border border-outline-variant">
              <span className="text-xs text-on-surface-variant uppercase font-semibold">Active Bays</span>
              <span className="font-label-numeric-md text-primary font-bold text-base">3</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-low border border-outline-variant">
              <span className="text-xs text-on-surface-variant uppercase font-semibold">Today's Departures</span>
              <span className="font-label-numeric-md text-secondary font-bold text-base">{departuresCount}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-surface-container-low border border-outline-variant">
              <span className="text-xs text-on-surface-variant uppercase font-semibold">Cash Drawer</span>
              <span className="font-label-numeric-md text-surface-tint font-bold text-base">
                Rs. {cashCollected.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Profile & Hardware Status */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              <span className="material-symbols-outlined text-primary text-[18px]">print</span>
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold leading-none text-on-surface">58mm POS</span>
                <span className="text-[9px] text-primary uppercase font-bold">Online</span>
              </div>
            </div>

            <div className="hidden md:flex flex-col px-2.5 py-1 rounded bg-surface-container-low border border-outline-variant text-right">
              <span className="text-[11px] text-secondary font-bold uppercase">Weekly Plan</span>
              <span className="text-[9px] text-primary font-semibold">Active • 0% Driver Cut</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-1 rounded bg-surface-container border border-outline-variant">
              <div className="text-right leading-tight">
                <div className="text-sm font-bold text-on-surface">Aslam Khan</div>
                <div className="text-xs text-secondary font-semibold">منشی نگران</div>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-on-primary text-[18px]">person</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-bar */}
        <div className="h-8 px-4 bg-surface-container border-t border-outline-variant flex items-center justify-between text-xs text-on-surface-variant">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-on-surface font-semibold">
              <span className="material-symbols-outlined text-primary text-sm">schedule</span>
              <span>{timeStr}</span>
            </span>
            <span className="text-outline">|</span>
            <span className="text-secondary flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              Pari Rotation Lane: Rawalpindi - Peshawar Line
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="tel:15"
              className="px-2 py-0.5 rounded bg-error-container text-on-error-container hover:bg-error hover:text-white font-bold flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">local_police</span>15 POLICE
            </a>
            <a
              href="tel:1122"
              className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container hover:bg-secondary font-bold flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-xs">ambulance</span>1122 RESCUE
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="pt-28 pb-12 px-4 max-w-[1600px] w-full mx-auto flex-1 flex flex-col gap-4">
        {/* Toast / Notification Bar */}
        {alertMessage && (
          <div className="bg-primary/10 border border-primary text-primary px-4 py-2.5 rounded-lg flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl">info</span>
              <span className="font-semibold text-sm">{alertMessage}</span>
            </div>
            <button
              onClick={() => setAlertMessage(null)}
              className="text-primary hover:text-white text-xs font-bold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 3-Column Cockpit Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Pari Queue & Bay Management (4 Cols)                          */}
          {/* ========================================================================= */}
          <section className="lg:col-span-4 flex flex-col gap-3">
            <div className="bg-surface-container-low p-3 rounded-lg border border-outline-variant flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">swap_calls</span>
                  <h2 className="font-bold text-base text-on-surface">Pari Turn & Bay Dispatch</h2>
                </div>
                <div className="text-xs text-secondary font-semibold">پاری قطار اور روانگی اڈہ</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-bold text-xs border border-outline-variant">
                FIFO ENFORCED
              </span>
            </div>

            {/* Bays List */}
            <div className="flex flex-col gap-3">
              {bays.map((bay) => {
                const filledCount = bay.bookedSeats.length;
                const percent = Math.round((filledCount / bay.totalSeats) * 100);
                const isSelected = selectedBayNumber === bay.bayNumber;

                return (
                  <article
                    key={bay.id}
                    onClick={() => setSelectedBayNumber(bay.bayNumber)}
                    className={`cursor-pointer rounded-lg p-3.5 border transition-all ${
                      isSelected
                        ? "bg-surface-container border-primary shadow-md shadow-primary/10"
                        : "bg-surface-container-low border-outline-variant hover:border-outline"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded bg-primary text-on-primary flex items-center justify-center font-bold text-xs">
                          {bay.bayNumber}
                        </span>
                        <span className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">
                          PLATFORM BAY {bay.bayNumber}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          bay.status === "full"
                            ? "bg-primary-container text-on-primary-container animate-pulse"
                            : "bg-secondary-container/30 text-secondary"
                        }`}
                      >
                        {bay.status === "full" ? "FULL — READY" : "LOADING (سواری جاری)"}
                      </span>
                    </div>

                    <div className="mb-2">
                      <h3 className="font-bold text-sm text-on-surface">{bay.corridor}</h3>
                      <p className="text-xs text-secondary font-medium">{bay.urduCorridor}</p>
                    </div>

                    {/* Driver & Plate */}
                    <div className="flex items-center justify-between text-xs text-on-surface-variant bg-surface-container-high/60 px-2 py-1.5 rounded mb-2.5">
                      <span>
                        Reg: <strong className="text-on-surface font-semibold">{bay.vehiclePlate}</strong>
                      </span>
                      <span>
                        Driver: <strong className="text-on-surface">{bay.driverName}</strong>
                      </span>
                    </div>

                    {/* Seat Progress Bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs mb-1 font-semibold">
                        <span className="text-primary font-bold">
                          {filledCount} / {bay.totalSeats} Seats Booked
                        </span>
                        <span className="text-on-surface-variant">{percent}%</span>
                      </div>
                      <div className="w-full bg-surface-container-highest rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBayNumber(bay.bayNumber);
                        }}
                        className={`flex-1 py-1.5 rounded text-xs font-bold border transition-colors ${
                          isSelected
                            ? "bg-primary text-on-primary border-primary"
                            : "bg-surface-container border-outline-variant hover:bg-surface-container-high"
                        }`}
                      >
                        {isSelected ? "Active Counter Bay ✓" : "Select for Ticketing"}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDepartBay(bay.bayNumber);
                        }}
                        className="px-3 py-1.5 rounded bg-surface-container-high hover:bg-primary-container hover:text-on-primary-container text-xs font-bold border border-outline-variant transition-colors flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">logout</span>
                        Depart
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {/* ========================================================================= */}
          {/* CENTER COLUMN: Quick Walk-in Ticket Dispenser & QR Scanner (5 Cols)        */}
          {/* ========================================================================= */}
          <section className="lg:col-span-5 flex flex-col gap-3">
            {/* Passenger Watan App QR Scanner Box */}
            <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">qr_code_scanner</span>
                  <span className="font-bold text-sm text-on-surface">Redeem Passenger App QR / Code</span>
                </div>
                <span className="text-xs text-secondary font-semibold">آن لائن بکنگ توثیق</span>
              </div>

              <form onSubmit={handleValidateQr} className="flex gap-2">
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="Scan QR or Enter Booking Code (e.g. WTN-8912)..."
                  className="flex-1 bg-surface-container-highest border border-outline-variant rounded px-3 py-2 text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary font-mono uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-primary-container text-on-primary font-bold text-xs rounded transition-colors"
                >
                  Verify Ticket
                </button>
              </form>

              {validatedBooking && (
                <div className="bg-surface-container-high p-3 rounded border border-primary/40 flex flex-col gap-1 text-xs">
                  <div className="flex justify-between font-bold text-sm">
                    <span className="text-primary">{validatedBooking.code}</span>
                    <span className="text-surface-tint">STATUS: {validatedBooking.status}</span>
                  </div>
                  <div>Passenger: <strong>{validatedBooking.passenger}</strong> ({validatedBooking.phone})</div>
                  <div>Route: <strong>{validatedBooking.corridor}</strong> • Bay #{validatedBooking.bay}</div>
                  <div>Seats: <strong>{validatedBooking.seats.join(", ")}</strong> • Total: <strong className="text-primary">Rs. {validatedBooking.totalFare}</strong></div>
                  <div className="mt-1 pt-1 border-t border-outline-variant text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setValidatedBooking(null);
                        setAlertMessage("Passenger boarded successfully!");
                      }}
                      className="px-3 py-1 bg-primary text-on-primary font-bold rounded text-xs"
                    >
                      Confirm Boarding & Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Walk-in Seat Dispenser */}
            <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-outline-variant pb-2">
                <div>
                  <h3 className="font-bold text-sm text-on-surface">Walk-in Ticket Dispenser</h3>
                  <p className="text-xs text-on-surface-variant">
                    Dispensing for: <strong className="text-primary">Bay #{activeBay.bayNumber} ({activeBay.corridor})</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-outline">Rate per Seat</span>
                  <div className="font-bold text-primary text-base">Rs. {activeBay.farePerSeat}</div>
                </div>
              </div>

              {/* 14-Seat Cabin Grid */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-on-surface-variant font-semibold">Tap seat to select for commuter:</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-surface-container-highest border border-outline-variant"></span>
                      <span>Available</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-primary"></span>
                      <span>Selected</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-outline opacity-40"></span>
                      <span>Booked</span>
                    </span>
                  </div>
                </div>

                {/* Seat Matrix */}
                <div className="bg-surface-container-lowest p-3 rounded border border-outline-variant grid grid-cols-4 gap-2">
                  {Array.from({ length: activeBay.totalSeats }, (_, i) => i + 1).map((seatNum) => {
                    const isBooked = activeBay.bookedSeats.includes(seatNum);
                    const isSelected = selectedSeats.includes(seatNum);
                    const isLadiesZone = seatNum >= 2 && seatNum <= 4;

                    return (
                      <button
                        key={seatNum}
                        type="button"
                        disabled={isBooked}
                        onClick={() => toggleSeatSelection(seatNum)}
                        className={`h-11 rounded font-bold text-xs flex flex-col items-center justify-center transition-all ${
                          isBooked
                            ? "bg-surface-container-high text-outline cursor-not-allowed opacity-50"
                            : isSelected
                            ? "bg-primary text-on-primary shadow-sm scale-95 border-2 border-white"
                            : isLadiesZone
                            ? "bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-secondary/50"
                            : "bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant"
                        }`}
                      >
                        <span>#{seatNum}</span>
                        {isLadiesZone && !isBooked && !isSelected && (
                          <span className="text-[9px] text-secondary leading-none">خواتین</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cash Tendered & Calculations */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs text-on-surface-variant font-semibold block mb-1">
                    Cash Tendered (وصول رقم)
                  </label>
                  <input
                    type="number"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="w-full bg-surface-container-highest border border-outline-variant rounded px-3 py-1.5 text-sm font-bold text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="bg-surface-container-high px-3 py-1.5 rounded border border-outline-variant flex flex-col justify-center">
                  <div className="flex justify-between text-xs">
                    <span className="text-on-surface-variant">Total Due:</span>
                    <strong className="text-primary font-bold">Rs. {totalDue}</strong>
                  </div>
                  <div className="flex justify-between text-xs mt-0.5">
                    <span className="text-on-surface-variant">Change Due:</span>
                    <strong className="text-surface-tint font-bold">Rs. {changeDue}</strong>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleIssueCounterTicket}
                className="w-full py-3 bg-primary hover:bg-primary-container text-on-primary font-bold text-sm rounded shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">print</span>
                Issue Ticket & Collect Rs. {totalDue} (پرچی جاری کریں)
              </button>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: Stand Ledger & Platform Status (3 Cols)                     */}
          {/* ========================================================================= */}
          <section className="lg:col-span-3 flex flex-col gap-3">
            {/* Stand Financial Card */}
            <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-xl">account_balance_wallet</span>
                <h3 className="font-bold text-sm text-on-surface">Stand Financial Summary</h3>
              </div>

              <div className="flex flex-col gap-2 text-xs">
                <div className="bg-surface-container-high p-2 rounded">
                  <span className="text-outline uppercase text-[10px] font-bold">Watan Platform Plan</span>
                  <div className="flex justify-between items-center mt-0.5">
                    <span className="font-bold text-on-surface">Rs. 4,500 / week</span>
                    <span className="text-primary font-bold text-[10px] bg-primary/20 px-1.5 py-0.5 rounded">PAID</span>
                  </div>
                </div>

                <div className="bg-surface-container-high p-2 rounded">
                  <span className="text-outline uppercase text-[10px] font-bold">Driver Commission Rate</span>
                  <div className="font-bold text-primary text-sm mt-0.5">
                    0.0% (Drivers Keep 100%)
                  </div>
                </div>

                <div className="bg-surface-container-high p-2 rounded">
                  <span className="text-outline uppercase text-[10px] font-bold">Counter Cash on Hand</span>
                  <div className="font-bold text-surface-tint text-base mt-0.5">
                    Rs. {cashCollected.toLocaleString()}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAlertMessage("Daily stand manifest and cash audit report printed.")}
                className="w-full py-2 bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-xs font-bold rounded flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">receipt_long</span>
                Print Daily Audit Report
              </button>
            </div>

            {/* Live Ticket Audit Feed */}
            <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant flex-1 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-on-surface">Recent Issued Parchi</span>
                <span className="text-[10px] text-outline font-mono">LIVE SYNC</span>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto max-h-[360px]">
                {ticketHistory.map((tkt) => (
                  <div
                    key={tkt.id}
                    className="bg-surface-container-high p-2 rounded border border-outline-variant/60 flex flex-col gap-0.5 text-xs"
                  >
                    <div className="flex justify-between font-bold">
                      <span className="text-primary font-mono">{tkt.code}</span>
                      <span className="text-surface-tint">Rs. {tkt.totalFare}</span>
                    </div>
                    <div className="text-on-surface-variant text-[11px] truncate">
                      Bay #{tkt.bay} • Seats: {tkt.seats.join(", ")}
                    </div>
                    <div className="flex justify-between text-[10px] text-outline mt-0.5">
                      <span>{tkt.paidMode}</span>
                      <span>{tkt.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* 58mm Thermal Print Simulation Modal */}
      {receiptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white text-black p-6 rounded-lg max-w-sm w-full font-mono text-xs flex flex-col gap-3 shadow-2xl">
            <div className="text-center border-b pb-2">
              <h4 className="font-bold text-base">WATAN (وطن) TRANSPORT</h4>
              <p className="text-[11px]">Al-Makkah Wagon Stand, Pirwadhai</p>
              <p className="text-[10px] text-gray-600">Official Boarding Parchi</p>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>TICKET: <strong>{receiptModal.code}</strong></span>
              <span>{receiptModal.time}</span>
            </div>

            <div className="border-t border-b py-2 flex flex-col gap-1">
              <div>Route: <strong>{receiptModal.corridor}</strong></div>
              <div>Platform Bay: <strong>Bay #{receiptModal.bay}</strong></div>
              <div>Seats: <strong>{receiptModal.seats.join(", ")}</strong></div>
            </div>

            <div className="flex justify-between text-sm font-bold">
              <span>TOTAL FARE:</span>
              <span>Rs. {receiptModal.totalFare}</span>
            </div>

            <div className="text-center text-[10px] text-gray-500 pt-2 border-t">
              <p>Keep ticket for road check-posts.</p>
              <p>Helpline: 051-111-WATAN (92826)</p>
            </div>

            <button
              onClick={() => setReceiptModal(null)}
              className="mt-2 w-full py-2 bg-black text-white font-bold rounded text-xs"
            >
              Close & Ready for Next Passenger
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
