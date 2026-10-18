import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Theme } from '../lib/theme';

export interface MapMarker {
  lat: number;
  lng: number;
  kind: 'pickup' | 'destination' | 'driver' | 'self' | 'car';
  label?: string;
}

interface Props {
  center: { lat: number; lng: number };
  markers?: MapMarker[];
  theme: Theme;
  height?: number | string;
  showRoute?: { from: { lat: number; lng: number }; to: { lat: number; lng: number } };
}

const ICON_MAP: Record<MapMarker['kind'], { name: string; color: string; label: string }> = {
  self: { name: 'radio-button-on', color: '#3B82F6', label: 'You' },
  pickup: { name: 'location', color: '#22C55E', label: 'Pickup' },
  destination: { name: 'flag', color: '#EF4444', label: 'Destination' },
  driver: { name: 'car-sport', color: '#FACC15', label: 'Driver' },
  car: { name: 'car-sport', color: '#FACC15', label: 'Vehicle' },
};

export default function MapView({ center, markers = [], theme, height = '100%', showRoute }: Props) {
  const isDark = theme.bg === '#000' || theme.bg === '#0a0a0a' || theme.bg === '#18181B';
  const tileLayerUrl = isDark
    ? 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  const markersJson = JSON.stringify(
    markers.map((m) => ({
      lat: m.lat,
      lng: m.lng,
      label: m.label || ICON_MAP[m.kind]?.label || '',
      color: ICON_MAP[m.kind]?.color || '#3B82F6',
      icon: m.kind,
    }))
  );

  const routeJson = showRoute ? JSON.stringify(showRoute) : 'null';

  const htmlDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: ${isDark ? '#121212' : '#f0f0f0'}; overflow: hidden; }
          .leaflet-control-attribution { display: none !important; }
          .custom-pin {
            display: flex; align-items: center; justify-content: center;
            width: 28px; height: 28px; border-radius: 14px;
            color: #fff; font-family: sans-serif; font-weight: bold; font-size: 11px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4); border: 2px solid #fff;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const centerLat = ${center.lat || 37.7749};
          const centerLng = ${center.lng || -122.4194};
          const map = L.map('map', { zoomControl: false }).setView([centerLat, centerLng], 14);

          L.tileLayer('${tileLayerUrl}', { maxZoom: 19 }).addTo(map);

          const markersData = ${markersJson};
          const routeData = ${routeJson};

          markersData.forEach(m => {
            const icon = L.divIcon({
              className: 'custom-icon',
              html: '<div class="custom-pin" style="background-color:' + m.color + '">' + (m.icon === 'car' ? '🚗' : m.icon === 'pickup' ? '📍' : '🏁') + '</div>',
              iconSize: [28, 28],
              iconAnchor: [14, 14]
            });
            L.marker([m.lat, m.lng], { icon }).addTo(map).bindPopup(m.label);
          });

          if (routeData && routeData.from && routeData.to) {
            const latlngs = [
              [routeData.from.lat, routeData.from.lng],
              [routeData.to.lat, routeData.to.lng]
            ];
            const polyline = L.polyline(latlngs, { color: '${theme.accent || '#FACC15'}', weight: 4, dashArray: '6, 6' }).addTo(map);
            map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
          }
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { height: height as any }]} testID="map-view">
      <iframe
        srcDoc={htmlDoc}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          backgroundColor: isDark ? '#18181B' : '#F4F4F5',
        }}
        title="Map"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden' },
});
