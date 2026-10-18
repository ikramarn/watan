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
          body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e5e3df; overflow: hidden; }
          .leaflet-control-attribution { display: none !important; }
          .custom-pin {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 16px;
            border: 2.5px solid white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            font-size: 14px;
            color: #fff;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          const centerLat = ${center?.lat || 33.6007};
          const centerLng = ${center?.lng || 73.0679};
          const map = L.map('map', { zoomControl: false }).setView([centerLat, centerLng], 14);
          L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            attribution: 'Google Maps'
          }).addTo(map);

          const markersData = ${JSON.stringify(markers)};
          markersData.forEach(m => {
            const color = ${JSON.stringify(COLOR_MAP)}[m.kind] || '#006837';
            let symbol = '🚗';
            if (m.kind === 'pickup') symbol = '📍';
            else if (m.kind === 'destination') symbol = '🏁';
            else if (m.kind === 'self') symbol = '🟢';
            else if (m.label && m.label.toLowerCase().includes('rickshaw')) symbol = '🛺';
            else if (m.label && m.label.toLowerCase().includes('bike')) symbol = '🏍️';
            else if (m.label && m.label.toLowerCase().includes('wagon')) symbol = '🚐';

            const iconHtml = '<div class="custom-pin" style="background-color: ' + color + ';">' + symbol + '</div>';
            const customIcon = L.divIcon({
              className: 'custom-div-icon',
              html: iconHtml,
              iconSize: [32, 32],
              iconAnchor: [16, 16]
            });
            const marker = L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);
            if (m.label) marker.bindPopup('<b>' + m.label + '</b>');
          });

          ${
            showRoute
              ? `
            const latlngs = [
              [${showRoute.from.lat}, ${showRoute.from.lng}],
              [${showRoute.to.lat}, ${showRoute.to.lng}]
            ];
            const polyline = L.polyline(latlngs, { color: '#006837', weight: 5, opacity: 0.85 }).addTo(map);
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
      {/* Web iframe rendering Leaflet with Google Maps tiles */}
      <iframe
        ref={iframeRef}
        srcDoc={mapHtml}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: 16,
        }}
        title="Watan Pakistan Map"
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
