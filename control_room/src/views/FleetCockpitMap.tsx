import { useEffect, useRef, useState } from 'react'
import type { PendingRide } from './PendingRequestsTable'
import './FleetCockpitMap.css'

export interface FleetDriver {
  driver_id: string
  name: string
  rating: number
  vehicle_make: string
  vehicle_plate: string
  vehicle_type: string
  lat: number | null
  lng: number | null
  online: boolean
  has_active_ride: boolean
  active_ride_id?: string | null
}

interface FleetCockpitMapProps {
  drivers: FleetDriver[]
  pendingRides?: PendingRide[]
  onSelectRide?: (ride: PendingRide) => void
  onAssignRide?: (ride: PendingRide) => void
}

const DEFAULT_CENTER: [number, number] = [56.1165, -3.1700] // Fife & Edinburgh Region
const DEFAULT_ZOOM = 11

export function FleetCockpitMap({
  drivers,
  pendingRides = [],
  onSelectRide,
  onAssignRide,
}: FleetCockpitMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersLayerRef = useRef<any>(null)
  const [filter, setFilter] = useState<'all' | 'free' | 'busy'>('all')

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (typeof L === 'undefined') {
      console.warn('Leaflet (L) is not loaded yet')
      return
    }

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView(DEFAULT_CENTER, DEFAULT_ZOOM)

      // Add Zoom control at bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // OpenStreetMap Standard Tile Layer (styled dark via CSS, zero-key, no watermark)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)


      const markersGroup = L.layerGroup().addTo(map)
      markersLayerRef.current = markersGroup
      mapInstanceRef.current = map
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Render Markers on Map whenever drivers, pendingRides, or filter changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || typeof L === 'undefined') return

    const markersGroup = markersLayerRef.current
    markersGroup.clearLayers()

    const bounds: [number, number][] = []

    // 1. Render Driver Markers
    const visibleDrivers = drivers.filter((d) => {
      if (!d.online || d.lat == null || d.lng == null) return false
      if (filter === 'free') return !d.has_active_ride
      if (filter === 'busy') return d.has_active_ride
      return true
    })

    visibleDrivers.forEach((driver) => {
      const isBusy = driver.has_active_ride
      const lat = driver.lat!
      const lng = driver.lng!
      bounds.push([lat, lng])

      const firstName = driver.name.split(' ')[0]
      const statusClass = isBusy ? 'busy' : 'available'
      const iconEmoji = isBusy ? '🚗' : '🚖'
      const statusLabel = isBusy ? 'On Trip' : 'Available'

      const customIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div class="radar-driver-pin ${statusClass}" title="${driver.name}">
            <div class="radar-pulse"></div>
            <div class="driver-icon-badge">${iconEmoji}</div>
            <span class="driver-pin-tag">${firstName}</span>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })

      const popupHtml = `
        <div class="cockpit-popup-card">
          <div class="cockpit-popup-title">
            <span>${driver.name}</span>
            <span style="font-size: 11px; color: ${isBusy ? '#60a5fa' : '#34d399'}; font-weight: 700;">
              ${statusLabel}
            </span>
          </div>
          <div class="cockpit-popup-body">
            <div><strong>Vehicle:</strong> ${driver.vehicle_make} (${driver.vehicle_type})</div>
            <div><strong>Registration:</strong> <code style="color: #f59e0b; background: rgba(245,158,11,0.15); padding: 1px 4px; border-radius: 3px;">${driver.vehicle_plate}</code></div>
            <div><strong>Rating:</strong> ⭐ ${driver.rating.toFixed(1)}</div>
            <div><strong>GPS:</strong> ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
          </div>
        </div>
      `

      const marker = L.marker([lat, lng], { icon: customIcon }).bindPopup(popupHtml)
      markersGroup.addLayer(marker)
    })

    // 2. Render Pending Ride Pickup Markers
    pendingRides.forEach((ride) => {
      if (ride.pickup?.lat == null || ride.pickup?.lng == null) return
      const lat = ride.pickup.lat
      const lng = ride.pickup.lng
      bounds.push([lat, lng])

      const riderName = ride.passenger_name || 'Passenger'

      const pickupIcon = L.divIcon({
        className: 'custom-leaflet-marker',
        html: `
          <div class="radar-pickup-pin" title="Pickup: ${riderName}">
            <div class="pickup-pulse"></div>
            <div class="pickup-icon-badge">📍</div>
            <span class="pickup-pin-tag">${riderName}</span>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      })

      const pickupPopupHtml = `
        <div class="cockpit-popup-card">
          <div class="cockpit-popup-title">
            <span>⏳ Ride Request</span>
            <span style="color: #fbbf24; font-weight: 800;">£${(ride.fare || 0).toFixed(2)}</span>
          </div>
          <div class="cockpit-popup-body">
            <div><strong>Passenger:</strong> ${riderName}</div>
            <div><strong>Pickup:</strong> ${ride.pickup?.address || 'Pickup Point'}</div>
            <div><strong>Dropoff:</strong> ${ride.destination?.address || 'Destination'}</div>
            <div><strong>Wait Time:</strong> ${Math.floor(ride.wait_seconds / 60)}m ${ride.wait_seconds % 60}s</div>
          </div>
          <button id="assign-btn-${ride.id}" class="cockpit-popup-btn">⚡ Assign Driver Now</button>
        </div>
      `

      const marker = L.marker([lat, lng], { icon: pickupIcon }).bindPopup(pickupPopupHtml)
      marker.on('popupopen', () => {
        const btn = document.getElementById(`assign-btn-${ride.id}`)
        if (btn) {
          btn.onclick = () => {
            if (onAssignRide) {
              onAssignRide(ride)
            } else if (onSelectRide) {
              onSelectRide(ride)
            }
          }
        }
      })

      markersGroup.addLayer(marker)
    })
  }, [drivers, pendingRides, filter, onSelectRide, onAssignRide])

  // Fit all markers in view
  const fitFleet = () => {
    if (!mapInstanceRef.current || typeof L === 'undefined') return
    const points: [number, number][] = []

    drivers.forEach((d) => {
      if (d.online && d.lat != null && d.lng != null) {
        points.push([d.lat, d.lng])
      }
    })
    pendingRides.forEach((r) => {
      if (r.pickup?.lat != null && r.pickup?.lng != null) {
        points.push([r.pickup.lat, r.pickup.lng])
      }
    })

    if (points.length === 0) {
      mapInstanceRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }

    if (points.length === 1) {
      mapInstanceRef.current.setView(points[0], 14)
      return
    }

    const bounds = L.latLngBounds(points)
    mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
  }

  const freeCount = drivers.filter((d) => d.online && !d.has_active_ride).length
  const busyCount = drivers.filter((d) => d.online && d.has_active_ride).length
  const totalOnline = drivers.filter((d) => d.online).length

  return (
    <div className="fleet-map-wrapper">
      {/* Floating Toolbar */}
      <div className="fleet-map-toolbar">
        <div className="map-toolbar-left">
          <div className="radar-badge">
            <span className="radar-ping-dot" />
            <span>Fife & Edinburgh Fleet Radar</span>
          </div>

          <button
            type="button"
            className={`map-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Fleet ({totalOnline})
          </button>
          <button
            type="button"
            className={`map-filter-btn ${filter === 'free' ? 'active' : ''}`}
            onClick={() => setFilter('free')}
          >
            Available ({freeCount})
          </button>
          <button
            type="button"
            className={`map-filter-btn ${filter === 'busy' ? 'active' : ''}`}
            onClick={() => setFilter('busy')}
          >
            On Trip ({busyCount})
          </button>
        </div>

        <div className="map-toolbar-right">
          <button type="button" className="map-action-btn" onClick={fitFleet} title="Auto-center all online drivers and pickup requests">
            🎯 Fit Fleet
          </button>
        </div>
      </div>

      {/* Map DOM Target */}
      <div ref={mapContainerRef} className="fleet-map-container" />
    </div>
  )
}
