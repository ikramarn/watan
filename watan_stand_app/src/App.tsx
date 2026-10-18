import React, { useState, useEffect, useRef } from "react";

declare global {
  interface Window {
    L: any;
  }
}

export interface FleetVehicleTelemetry {
  id: string;
  plate: string;
  driverName: string;
  urduDriverName: string;
  phone: string;
  vehicleType: string;
  corridor: string;
  lat: number;
  lng: number;
  locationName: string;
  speedKmH: number;
  status: "in_bay" | "en_route" | "roaming";
  statusLabel: string;
  seatsBooked: number;
  totalSeats: number;
  heading: string;
  fareCollected: number;
  departureTime?: string;
}

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

export interface EnrolledDriver {
  id: string;
  name: string;
  phone: string;
  cnic: string;
  vehicleType: string;
  vehiclePlate: string;
  corridor: string;
  operatingMode: "in_adda_pari" | "roaming";
  registeredDate: string;
  totalTrips: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"operations" | "fleet" | "map">("operations");
  const [timeStr, setTimeStr] = useState<string>("");
  const [cashCollected, setCashCollected] = useState<number>(142500);
  const [departuresCount, setDeparturesCount] = useState<number>(38);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Live Fleet GPS & Map State
  const mapRef = useRef<any>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>("v_1");
  const [mapViewMode, setMapViewMode] = useState<"roadmap" | "satellite">("roadmap");
  const [mapFilter, setMapFilter] = useState<"all" | "peshawar" | "lahore" | "saddar" | "roaming">("all");

  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicleTelemetry[]>([
    {
      id: "v_1",
      plate: "LES-19-4821",
      driverName: "Tariq Mahmood",
      urduDriverName: "طارق محمود",
      phone: "0300-5554921",
      vehicleType: "Toyota HiAce Grand Cabin (14-S)",
      corridor: "Pirwadhai to Peshawar Line",
      lat: 33.6263,
      lng: 73.0481,
      locationName: "Al-Makkah Stand Bay #2 (Loading)",
      speedKmH: 0,
      status: "in_bay",
      statusLabel: "In Bay #2 • Departs 08:30 PM",
      seatsBooked: 11,
      totalSeats: 14,
      heading: "NW 315°",
      fareCollected: 4950,
      departureTime: "08:30 PM",
    },
    {
      id: "v_2",
      plate: "RIP-21-9921",
      driverName: "Rafiq Ahmad",
      urduDriverName: "رفیق احمد",
      phone: "0321-4455667",
      vehicleType: "Toyota Coaster Executive (28-S)",
      corridor: "Rawalpindi to Lahore Motorway Line",
      lat: 33.3212,
      lng: 72.8450,
      locationName: "M-2 Motorway (Near Chakri Rest Area)",
      speedKmH: 94,
      status: "en_route",
      statusLabel: "En Route to Lahore • Speed: 94 km/h",
      seatsBooked: 28,
      totalSeats: 28,
      heading: "SE 135°",
      fareCollected: 23800,
      departureTime: "08:15 PM",
    },
    {
      id: "v_3",
      plate: "RWP-18-3011",
      driverName: "Bilal Khan",
      urduDriverName: "بلال خان",
      phone: "0345-9988112",
      vehicleType: "Sazgar 9-Seater Qingqi Shuttle",
      corridor: "Pirwadhai to Saddar Shuttle",
      lat: 33.6145,
      lng: 73.0610,
      locationName: "Liaquat Bagh Chowk, Rawalpindi",
      speedKmH: 32,
      status: "en_route",
      statusLabel: "In Transit • Speed: 32 km/h",
      seatsBooked: 5,
      totalSeats: 9,
      heading: "S 180°",
      fareCollected: 200,
    },
    {
      id: "v_4",
      plate: "RWP-14-5541",
      driverName: "Arshad Mehmood",
      urduDriverName: "ارشد محمود",
      phone: "0333-8877665",
      vehicleType: "Suzuki Bolan (7-Seater)",
      corridor: "Rawalpindi - Murree Express",
      lat: 33.6420,
      lng: 73.0710,
      locationName: "Commercial Market, Satellite Town",
      speedKmH: 38,
      status: "roaming",
      statusLabel: "Independent Roaming • Ready for Hail",
      seatsBooked: 2,
      totalSeats: 7,
      heading: "NE 45°",
      fareCollected: 700,
    },
    {
      id: "v_5",
      plate: "ICT-22-4012",
      driverName: "Sajid Gul",
      urduDriverName: "ساجد گل",
      phone: "0313-9876543",
      vehicleType: "Toyota HiAce Grand Cabin (14-S)",
      corridor: "Pirwadhai to Peshawar Line",
      lat: 33.7420,
      lng: 72.8050,
      locationName: "N-5 Grand Trunk Road (Taxila Bypass)",
      speedKmH: 82,
      status: "en_route",
      statusLabel: "En Route to Peshawar • Speed: 82 km/h",
      seatsBooked: 14,
      totalSeats: 14,
      heading: "W 270°",
      fareCollected: 6300,
      departureTime: "07:45 PM",
    },
  ]);

  // Stand fleet enrolled drivers
  const [enrolledDrivers, setEnrolledDrivers] = useState<EnrolledDriver[]>([
    {
      id: "drv_1",
      name: "Tariq Mahmood (طارق محمود)",
      phone: "0300-5554921",
      cnic: "37405-1829101-1",
      vehicleType: "Toyota HiAce Grand Cabin (14-Seater)",
      vehiclePlate: "LES-19-4821",
      corridor: "Pirwadhai to Peshawar Line",
      operatingMode: "in_adda_pari",
      registeredDate: "12 Oct 2026",
      totalTrips: 48,
    },
    {
      id: "drv_2",
      name: "Rafiq Ahmad (رفیق احمد)",
      phone: "0321-4455667",
      cnic: "37405-2918234-3",
      vehicleType: "Toyota Coaster (28-Seater)",
      vehiclePlate: "RIP-21-9921",
      corridor: "Rawalpindi to Lahore Motorway Line",
      operatingMode: "in_adda_pari",
      registeredDate: "05 Oct 2026",
      totalTrips: 62,
    },
    {
      id: "drv_3",
      name: "Bilal Khan (بلال خان)",
      phone: "0345-9988112",
      cnic: "37405-4411990-7",
      vehicleType: "Sazgar 9-Seater Qingqi",
      vehiclePlate: "RWP-18-3011",
      corridor: "Pirwadhai to Saddar Shuttle",
      operatingMode: "in_adda_pari",
      registeredDate: "15 Oct 2026",
      totalTrips: 114,
    },
    {
      id: "drv_4",
      name: "Arshad Mehmood (ارشد محمود)",
      phone: "0333-8877665",
      cnic: "37405-3928172-5",
      vehicleType: "Suzuki Bolan (7-Seater)",
      vehiclePlate: "RWP-14-5541",
      corridor: "Rawalpindi - Murree Express",
      operatingMode: "roaming",
      registeredDate: "01 Oct 2026",
      totalTrips: 31,
    },
  ]);

  // Driver Enrollment Modal State
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false);
  const [newDriverName, setNewDriverName] = useState<string>("");
  const [newDriverPhone, setNewDriverPhone] = useState<string>("");
  const [newDriverCnic, setNewDriverCnic] = useState<string>("");
  const [newDriverVehicle, setNewDriverVehicle] = useState<string>("Toyota HiAce Grand Cabin");
  const [newDriverPlate, setNewDriverPlate] = useState<string>("");
  const [newDriverCorridor, setNewDriverCorridor] = useState<string>("Pirwadhai to Peshawar Line");

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

  const handleEnrollDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName.trim() || !newDriverPlate.trim()) {
      setAlertMessage("Please provide driver name and vehicle registration plate.");
      return;
    }

    const newDriver: EnrolledDriver = {
      id: "drv_" + Date.now(),
      name: newDriverName.trim(),
      phone: newDriverPhone.trim() || "0300-555" + Math.floor(1000 + Math.random() * 9000),
      cnic: newDriverCnic.trim() || "37405-*******-1",
      vehicleType: newDriverVehicle,
      vehiclePlate: newDriverPlate.trim().toUpperCase(),
      corridor: newDriverCorridor,
      operatingMode: "in_adda_pari",
      registeredDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      totalTrips: 0,
    };

    setEnrolledDrivers([newDriver, ...enrolledDrivers]);
    setShowEnrollModal(false);
    setNewDriverName("");
    setNewDriverPhone("");
    setNewDriverCnic("");
    setNewDriverPlate("");
    setAlertMessage(
      `Driver ${newDriver.name} enrolled into Stand Fleet! Dual-Mode (0% Adda Pari + Roaming) is now unlocked in their Watan Driver App.`
    );
  };

  const handleToggleDriverMode = (driverId: string) => {
    setEnrolledDrivers((prev) =>
      prev.map((d) => {
        if (d.id !== driverId) return d;
        const newMode = d.operatingMode === "in_adda_pari" ? "roaming" : "in_adda_pari";
        setAlertMessage(
          `Switched ${d.name} (${d.vehiclePlate}) to ${
            newMode === "in_adda_pari"
              ? "Adda Pari Stand Queue (0% Platform Fee)"
              : "Independent Roaming (Doorstep Customer Hails)"
          }.`
        );
        return { ...d, operatingMode: newMode };
      })
    );
  };

  const handleCenterMapOnVehicle = (vehicle: FleetVehicleTelemetry) => {
    setSelectedVehicleId(vehicle.id);
    if (mapRef.current) {
      mapRef.current.flyTo([vehicle.lat, vehicle.lng], 14, { duration: 1.2 });
    }
  };

  // Live Fleet Leaflet Map Initialization
  useEffect(() => {
    if (activeTab !== "map") {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && window.L && !mapRef.current) {
        const container = document.getElementById("fleet-leaflet-map");
        if (!container) return;

        const map = window.L.map("fleet-leaflet-map", {
          center: [33.6261, 73.0479],
          zoom: 11,
          zoomControl: true,
        });

        const tileUrl =
          mapViewMode === "satellite"
            ? "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            : "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";

        window.L.tileLayer(tileUrl, {
          maxZoom: 19,
          attribution: "© Google Maps • Watan Transit",
        }).addTo(map);

        // Stand Hub Marker (Pirwadhai Al-Makkah Stand)
        const standIcon = window.L.divIcon({
          className: "custom-stand-icon",
          html: `<div style="background:#006837; color:#fff; padding:6px 10px; border-radius:12px; font-weight:800; font-size:11px; border:2px solid #59df89; box-shadow:0 4px 12px rgba(0,0,0,0.5); display:flex; align-items:center; gap:4px; white-space:nowrap;">
            <span>🏢</span> Al-Makkah Stand (Stand Hub)
          </div>`,
          iconSize: [160, 32],
          iconAnchor: [80, 16],
        });
        window.L.marker([33.6261, 73.0479], { icon: standIcon }).addTo(map)
          .bindPopup("<b>Al-Makkah Wagon Stand, Pirwadhai</b><br>Stand Hub #ISB-001 • 3 Active Bays");

        // Geofence Circle around Stand (1.5 km radius)
        window.L.circle([33.6261, 73.0479], {
          color: "#59df89",
          fillColor: "#006837",
          fillOpacity: 0.15,
          radius: 1200,
        }).addTo(map);

        // Vehicle Markers
        fleetVehicles.forEach((veh) => {
          const isSelected = selectedVehicleId === veh.id;
          const markerHtml = `
            <div style="background:${veh.status === 'in_bay' ? '#006837' : veh.status === 'en_route' ? '#0284c7' : '#eab308'}; color:#fff; padding:4px 8px; border-radius:10px; font-weight:bold; font-size:10px; border:2px solid ${isSelected ? '#fff' : '#000'}; box-shadow:0 3px 8px rgba(0,0,0,0.4); display:flex; align-items:center; gap:4px; cursor:pointer;">
              <span>${veh.vehicleType.includes('Coaster') ? '🚌' : veh.vehicleType.includes('Qingqi') ? '🛺' : '🚐'}</span>
              <span>${veh.plate}</span>
              ${veh.speedKmH > 0 ? `<span style="background:rgba(0,0,0,0.3); padding:1px 4px; border-radius:4px; font-size:9px;">${veh.speedKmH}km/h</span>` : ''}
            </div>
          `;
          const icon = window.L.divIcon({
            className: "custom-veh-icon",
            html: markerHtml,
            iconSize: [120, 28],
            iconAnchor: [60, 14],
          });
          const m = window.L.marker([veh.lat, veh.lng], { icon }).addTo(map);
          m.on("click", () => {
            setSelectedVehicleId(veh.id);
            map.flyTo([veh.lat, veh.lng], 14, { duration: 1 });
          });
        });

        mapRef.current = map;
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [activeTab, mapViewMode, selectedVehicleId]);

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

        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("operations")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                activeTab === "operations"
                  ? "bg-primary text-on-primary shadow-md"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-base">dashboard</span>
              <span>Live Stand Operations (پاری اور پرچی کاؤنٹر)</span>
            </button>
            <button
              onClick={() => setActiveTab("fleet")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                activeTab === "fleet"
                  ? "bg-primary text-on-primary shadow-md"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-base">local_taxi</span>
              <span>Fleet & Driver Enrollment (ڈرائیور اور گاڑیوں کی رجسٹریشن)</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-secondary text-on-secondary text-[10px] font-mono">
                {enrolledDrivers.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab("map")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                activeTab === "map"
                  ? "bg-primary text-on-primary shadow-md"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-base">radar</span>
              <span>Live Fleet Radar & GPS Map (لائیو فلیٹ نقشہ)</span>
              <span className="flex h-2 w-2 relative ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </button>
          </div>

          <button
            onClick={() => {
              setActiveTab("fleet");
              setShowEnrollModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-tint hover:bg-primary text-on-primary font-bold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-sm">person_add</span>
            <span>+ Enroll Driver to Fleet (ڈرائیور رجسٹریشن)</span>
          </button>
        </div>

        {activeTab === "operations" && (
          /* 3-Column Cockpit Layout */
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
        )}

        {/* ========================================================================= */}
        {/* FLEET & DRIVER ENROLLMENT DIRECTORY (اڈہ گاڑی اور ڈرائیور رجسٹریشن)         */}
        {/* ========================================================================= */}
        {activeTab === "fleet" && (
          <div className="flex flex-col gap-4 flex-1">
            {/* Top Concept Banner */}
            <div className="bg-primary/10 border border-primary/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary text-2xl mt-0.5">verified_user</span>
                <div>
                  <h3 className="font-bold text-base text-on-surface">Adda Fleet Enrolled Driver Directory (اڈہ گاڑی اور ڈرائیور رجسٹریشن)</h3>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed max-w-4xl">
                    <strong>Watan Dual-Mode Model:</strong> Independent drivers who do not want to be in an Adda operate directly as normal independent roaming drivers (like Uber / InDrive / Bykea) at 10% platform commission. Once your Adda enrolls a driver here, their driver app unlocks the <strong>Dual-Mode Switcher</strong> allowing them to choose between <strong>Adda Pari (0% Commission, Stand Turn Queue)</strong> and <strong>Independent Roaming</strong>.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEnrollModal(true)}
                className="px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-bold text-xs uppercase tracking-wider flex items-center gap-2 shrink-0 shadow-lg"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                <span>Enroll New Driver</span>
              </button>
            </div>

            {/* Quick Fleet Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant">
                <span className="text-xs text-on-surface-variant font-semibold">Total Stand Fleet</span>
                <div className="text-xl font-bold text-primary mt-1">{enrolledDrivers.length} Vehicles</div>
              </div>
              <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant">
                <span className="text-xs text-on-surface-variant font-semibold">Active in Stand Queue</span>
                <div className="text-xl font-bold text-secondary mt-1">
                  {enrolledDrivers.filter((d) => d.operatingMode === "in_adda_pari").length} Vehicles
                </div>
              </div>
              <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant">
                <span className="text-xs text-on-surface-variant font-semibold">Switched to Roaming</span>
                <div className="text-xl font-bold text-surface-tint mt-1">
                  {enrolledDrivers.filter((d) => d.operatingMode === "roaming").length} Drivers
                </div>
              </div>
              <div className="bg-surface-container-low p-3.5 rounded-lg border border-outline-variant">
                <span className="text-xs text-on-surface-variant font-semibold">Stand Rate Agreement</span>
                <div className="text-xl font-bold text-primary mt-1">0% Platform Fee</div>
              </div>
            </div>

            {/* Enrolled Drivers Table / Card List */}
            <div className="bg-surface-container-low rounded-xl border border-outline-variant overflow-hidden">
              <div className="p-4 border-b border-outline-variant flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-on-surface">Registered Stand Drivers & Live Queue Status</h4>
                  <p className="text-xs text-on-surface-variant">Toggle driver mode between Adda Queue and Independent Roaming</p>
                </div>
                <span className="px-2.5 py-1 rounded bg-surface-container-high text-xs text-primary font-bold border border-outline-variant">
                  {enrolledDrivers.length} Active Records
                </span>
              </div>

              <div className="divide-y divide-outline-variant/60">
                {enrolledDrivers.map((driver) => (
                  <div key={driver.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-surface-container/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary text-primary flex items-center justify-center font-bold text-base">
                        {driver.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-on-surface">{driver.name}</span>
                          <span className="text-xs text-secondary font-mono">{driver.phone}</span>
                        </div>
                        <div className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5">
                          <span>{driver.vehicleType}</span>
                          <span>•</span>
                          <span className="font-mono font-bold text-on-surface">{driver.vehiclePlate}</span>
                          <span>•</span>
                          <span className="text-primary font-semibold">{driver.corridor}</span>
                        </div>
                        <div className="text-[11px] text-outline mt-0.5">
                          CNIC: {driver.cnic} • Enrolled: {driver.registeredDate} • Trips: {driver.totalTrips}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end md:self-center">
                      <div className="text-right">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                            driver.operatingMode === "in_adda_pari"
                              ? "bg-primary/20 text-primary border border-primary/50"
                              : "bg-surface-tint/20 text-surface-tint border border-surface-tint/50"
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              driver.operatingMode === "in_adda_pari" ? "bg-primary" : "bg-surface-tint"
                            }`}
                          ></span>
                          {driver.operatingMode === "in_adda_pari" ? "In Adda Pari (0% Fee)" : "Roaming Doorstep Mode"}
                        </span>
                        <div className="text-[10px] text-outline mt-0.5">
                          {driver.operatingMode === "in_adda_pari" ? "Loading in Stand Bay" : "Accepting street hails"}
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleDriverMode(driver.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          driver.operatingMode === "in_adda_pari"
                            ? "bg-surface-container-high hover:bg-surface-tint/20 text-surface-tint border-surface-tint/40"
                            : "bg-surface-container-high hover:bg-primary/20 text-primary border-primary/40"
                        }`}
                      >
                        {driver.operatingMode === "in_adda_pari" ? "Switch to Roaming" : "Return to Adda Queue"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* LIVE FLEET RADAR & GPS MAP (لائیو فلیٹ نقشہ اور جی پی ایس ٹیلی میٹری)     */}
        {/* ========================================================================= */}
        {activeTab === "map" && (
          <div className="flex flex-col gap-5 flex-1">
            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 bg-surface-container-low rounded-xl border border-outline-variant">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-headline-sm text-lg font-bold text-on-surface">
                    Pakistan Live Fleet Radar & GPS Map
                  </h3>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/50 text-emerald-400 text-[10px] font-bold font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    LIVE GPS TELEMETRY
                  </span>
                </div>
                <p className="font-urdu-sub text-xs text-on-surface-variant mt-0.5">
                  راولپنڈی، اسلام آباد، موٹروے M-2 اور جی ٹی روڈ پر رواں دواں گاڑیوں کی لائیو لوکیشن اور رفتار
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-outline-variant bg-surface-container overflow-hidden p-0.5 text-xs font-bold">
                  <button
                    onClick={() => setMapViewMode("roadmap")}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      mapViewMode === "roadmap"
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Roadmap (سڑک کا نقشہ)
                  </button>
                  <button
                    onClick={() => setMapViewMode("satellite")}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      mapViewMode === "satellite"
                        ? "bg-primary text-on-primary shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    Satellite (سیٹلائٹ)
                  </button>
                </div>

                <button
                  onClick={() => {
                    setSelectedVehicleId(null);
                    if (mapRef.current) {
                      mapRef.current.flyTo([33.6261, 73.0479], 13, { duration: 1 });
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant text-xs font-bold transition-all"
                >
                  <span className="material-symbols-outlined text-sm">my_location</span>
                  <span>Center Stand Hub (اڈہ مرکز)</span>
                </button>
              </div>
            </div>

            {/* Quick Telemetry KPI Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    Active on Radar
                  </span>
                  <span className="font-headline-sm text-xl font-bold text-on-surface">
                    {fleetVehicles.length} Vehicles
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-primary-container text-on-primary-container flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">local_shipping</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    In Stand Loading Bay
                  </span>
                  <span className="font-headline-sm text-xl font-bold text-emerald-400">
                    {fleetVehicles.filter((v) => v.status === "in_bay").length} Vehicle
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-emerald-950/70 border border-emerald-600/40 text-emerald-400 flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">domain</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block">
                    En Route on Corridors
                  </span>
                  <span className="font-headline-sm text-xl font-bold text-sky-400">
                    {fleetVehicles.filter((v) => v.status === "en_route").length} High-Speed
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-sky-950/70 border border-sky-600/40 text-sky-400 flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">speed</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                    City Roaming
                  </span>
                  <span className="font-headline-sm text-xl font-bold text-amber-400">
                    {fleetVehicles.filter((v) => v.status === "roaming").length} Shuttles
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-amber-950/70 border border-amber-600/40 text-amber-400 flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">share_location</span>
                </div>
              </div>
            </div>

            {/* Split Screen: Map (Left 65%) + Telemetry Vehicle Roster (Right 35%) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Map Container */}
              <div className="lg:col-span-8 flex flex-col gap-3">
                <div className="relative rounded-2xl overflow-hidden border border-outline-variant shadow-2xl bg-surface-container-lowest">
                  {/* Map DOM Canvas */}
                  <div id="fleet-leaflet-map" className="w-full h-[620px] z-0"></div>

                  {/* Geofence HUD Badge */}
                  <div className="absolute top-4 left-4 z-10 bg-surface-container-lowest/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-outline-variant text-[11px] font-mono flex items-center gap-2 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>STAND GEOFENCE: <strong>1.2 KM ACTIVE</strong></span>
                  </div>

                  {/* Map Legend */}
                  <div className="absolute bottom-4 left-4 right-4 z-10 bg-surface-container-lowest/95 backdrop-blur-md p-2.5 rounded-xl border border-outline-variant flex flex-wrap items-center justify-between gap-3 text-[11px] shadow-lg">
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="w-3 h-3 rounded-full bg-[#006837] border border-emerald-400"></span>
                        <span className="text-on-surface">Stand Loading Bay (0% Pari)</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="w-3 h-3 rounded-full bg-[#0284c7] border border-sky-400"></span>
                        <span className="text-on-surface">En Route Corridors (M-2 / GT Road)</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="w-3 h-3 rounded-full bg-[#eab308] border border-amber-400"></span>
                        <span className="text-on-surface">Independent Roaming</span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-on-surface-variant">
                      Google Maps Road Network
                    </span>
                  </div>
                </div>
              </div>

              {/* Vehicle Telemetry Cards */}
              <div className="lg:col-span-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-on-surface">
                    Fleet Vehicles on Radar ({fleetVehicles.length})
                  </h4>
                  <span className="text-[10px] text-primary font-mono font-bold">GPS ACTIVE</span>
                </div>

                <div className="flex flex-col gap-3 max-h-[620px] overflow-y-auto pr-1">
                  {fleetVehicles.map((veh) => {
                    const isSelected = selectedVehicleId === veh.id;
                    return (
                      <div
                        key={veh.id}
                        onClick={() => handleCenterMapOnVehicle(veh)}
                        className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? "bg-surface-container-high border-primary shadow-md ring-1 ring-primary"
                            : "bg-surface-container-low border-outline-variant hover:border-outline hover:bg-surface-container"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                                veh.status === "in_bay"
                                  ? "bg-emerald-950/80 text-emerald-400 border border-emerald-600/40"
                                  : veh.status === "en_route"
                                  ? "bg-sky-950/80 text-sky-400 border border-sky-600/40"
                                  : "bg-amber-950/80 text-amber-300 border border-amber-600/40"
                              }`}
                            >
                              <span className="material-symbols-outlined text-base">
                                {veh.vehicleType.includes("Coaster")
                                  ? "directions_bus"
                                  : veh.vehicleType.includes("Qingqi")
                                  ? "electric_rickshaw"
                                  : "airport_shuttle"}
                              </span>
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h5 className="font-bold text-sm text-on-surface">
                                  {veh.plate}
                                </h5>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">
                                  {veh.vehicleType}
                                </span>
                              </div>
                              <p className="text-xs text-on-surface-variant font-medium">
                                {veh.driverName}
                              </p>
                            </div>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              veh.status === "in_bay"
                                ? "bg-emerald-950/70 text-emerald-400"
                                : veh.status === "en_route"
                                ? "bg-sky-950/70 text-sky-400"
                                : "bg-amber-950/70 text-amber-300"
                            }`}
                          >
                            {veh.status === "in_bay"
                              ? "In Bay #2"
                              : veh.status === "en_route"
                              ? "En Route"
                              : "Roaming"}
                          </span>
                        </div>

                        {/* Location and Telemetry */}
                        <div className="mt-3 p-2.5 rounded-lg bg-surface-container text-xs flex flex-col gap-1 border border-outline-variant/60 font-mono">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-on-surface-variant">Location:</span>
                            <strong className="text-on-surface truncate max-w-[180px] text-right">
                              {veh.locationName}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-on-surface-variant">Corridor:</span>
                            <span className="text-secondary font-bold truncate max-w-[180px] text-right">
                              {veh.corridor}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-outline-variant/40">
                            <span className="text-on-surface-variant">Speed / Load:</span>
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-bold ${
                                  veh.speedKmH > 70
                                    ? "text-sky-400"
                                    : veh.speedKmH > 0
                                    ? "text-emerald-400"
                                    : "text-on-surface-variant"
                                }`}
                              >
                                {veh.speedKmH} km/h
                              </span>
                              <span className="text-on-surface font-bold">
                                • {veh.seatsBooked}/{veh.totalSeats} Seats
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Focus Button */}
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="text-[10px] text-on-surface-variant font-mono">
                            {veh.status === "in_bay" ? "0% Platform Fee" : "GPS Live Ping (2s)"}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCenterMapOnVehicle(veh);
                            }}
                            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-surface-tint"
                          >
                            <span className="material-symbols-outlined text-sm">filter_center_focus</span>
                            <span>Fly to Location (نقشہ پر دیکھیں)</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
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

      {/* Enroll New Driver Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-surface-container rounded-xl max-w-lg w-full p-6 border border-outline-variant shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <div>
                <h3 className="font-bold text-base text-on-surface">Enroll New Driver to Stand Fleet</h3>
                <p className="text-xs text-secondary font-semibold">اڈہ گاڑی اور ڈرائیور رجسٹریشن</p>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-on-surface-variant hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleEnrollDriver} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">
                  Driver Full Name (ڈرائیور کا پورا نام) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arshad Mehmood"
                  value={newDriverName}
                  onChange={(e) => setNewDriverName(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-on-surface-variant block mb-1">
                    Mobile / Raast ID *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0300-1234567"
                    value={newDriverPhone}
                    onChange={(e) => setNewDriverPhone(e.target.value)}
                    className="w-full bg-surface-container-highest border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-on-surface-variant block mb-1">
                    CNIC (شناختی کارڈ)
                  </label>
                  <input
                    type="text"
                    placeholder="37405-1234567-1"
                    value={newDriverCnic}
                    onChange={(e) => setNewDriverCnic(e.target.value)}
                    className="w-full bg-surface-container-highest border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-on-surface-variant block mb-1">
                    Vehicle Type (گاڑی کی قسم)
                  </label>
                  <select
                    value={newDriverVehicle}
                    onChange={(e) => setNewDriverVehicle(e.target.value)}
                    className="w-full bg-surface-container-highest border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="Toyota HiAce Grand Cabin">Toyota HiAce Grand Cabin (14-Seater)</option>
                    <option value="Toyota Coaster">Toyota Coaster (28-Seater)</option>
                    <option value="Suzuki Bolan">Suzuki Bolan (7-Seater)</option>
                    <option value="Sazgar Qingqi 9-Seater">Sazgar Qingqi 9-Seater</option>
                    <option value="Suzuki Alto VXR">Suzuki Alto VXR (Mini Cab)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-on-surface-variant block mb-1">
                    Registration Plate (نمبر پلیٹ) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. LES-20-4412"
                    value={newDriverPlate}
                    onChange={(e) => setNewDriverPlate(e.target.value)}
                    className="w-full bg-surface-container-highest border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-on-surface-variant block mb-1">
                  Default Route Corridor (مقررہ روٹ)
                </label>
                <select
                  value={newDriverCorridor}
                  onChange={(e) => setNewDriverCorridor(e.target.value)}
                  className="w-full bg-surface-container-highest border border-outline-variant rounded px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="Pirwadhai to Peshawar Line">Pirwadhai to Peshawar Line</option>
                  <option value="Rawalpindi to Lahore Motorway Line">Rawalpindi to Lahore Motorway Line</option>
                  <option value="Rawalpindi to Murree Express">Rawalpindi to Murree Express</option>
                  <option value="Pirwadhai to Saddar Shuttle">Pirwadhai to Saddar Shuttle</option>
                  <option value="Pirwadhai to Abbottabad / Hazara">Pirwadhai to Abbottabad / Hazara</option>
                </select>
              </div>

              <div className="bg-surface-container-highest p-3 rounded border border-outline-variant text-xs text-on-surface-variant">
                <span className="text-primary font-bold">Watan Stand License Terms:</span> 0% commission deducted from driver fares on Adda Pari trips. Stand subscription fee is paid weekly by the Adda.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 rounded text-xs font-bold text-on-surface-variant hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded bg-primary hover:bg-primary-container text-on-primary font-bold text-xs uppercase tracking-wider flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">how_to_reg</span>
                  <span>Register & Sync to Driver App</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
