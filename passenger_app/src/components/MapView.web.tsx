import React, { useRef } from 'react';
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

const COLOR_MAP: Record<MapMarker['kind'], string> = {
  self: '#3B82F6',
  pickup: '#22C55E',
  destination: '#EF4444',
  driver: '#FACC15',
  car: '#FACC15',
};

export default function MapView({ center, markers = [], theme, height = '100%', showRoute }: Props) {
  const iframeRef = useRef<any>(null);

  // Generate dynamic Leaflet HTML embed for reliable zero-dependency Web Map rendering
  const mapHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #111; }
          .custom-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: 2px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            font-size: 14px;
          }
          .leaflet-tile {
            filter: brightness(0.7) invert(1) contrast(3) hue-rotate(200deg) saturate(0.3) brightness(0.7);
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const map = L.map('map', { zoomControl: false }).setView([${center.lat}, ${center.lng}], 13);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          const markersData = ${JSON.stringify(markers)};
          markersData.forEach(m => {
            const color = ${JSON.stringify(COLOR_MAP)}[m.kind] || '#FACC15';
            const iconHtml = \`<div class="custom-pin" style="background-color: \${color};">📍</div>\`;
            const customIcon = L.divIcon({
              className: 'custom-div-icon',
              html: iconHtml,
              iconSize: [28, 28],
              iconAnchor: [14, 14]
            });
            const marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);
            if (m.label) marker.bindPopup(m.label);
          });

          ${
            showRoute
              ? `
            const latlngs = [
              [${showRoute.from.lat}, ${showRoute.from.lng}],
              [${showRoute.to.lat}, ${showRoute.to.lng}]
            ];
            const polyline = L.polyline(latlngs, { color: '#FACC15', weight: 4, opacity: 0.85, dashArray: '8, 8' }).addTo(map);
            map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
          `
              : ''
          }
        </script>
      </body>
    </html>
  `;

  return (
    <View style={[styles.container, { height: height as any }]} testID="map-view-web">
      {/* Web iframe rendering Leaflet for zero-dependency native feel on browser */}
      <iframe
        ref={iframeRef}
        srcDoc={mapHtml}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 16,
        }}
        title="GetChum Web Map"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#121212',
  },
});
