import React from 'react';
import { StyleSheet, View } from 'react-native';
import RNMapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
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

const ICON_MAP: Record<MapMarker['kind'], { name: string; color: string }> = {
  self:        { name: 'radio-button-on',  color: '#3B82F6' },
  pickup:      { name: 'location',          color: '#22C55E' },
  destination: { name: 'location',          color: '#EF4444' },
  driver:      { name: 'car-sport',         color: '#FACC15' },
  car:         { name: 'car-sport',         color: '#FACC15' },
};

export default function MapView({ center, markers = [], theme, height = '100%', showRoute }: Props) {
  const routeCoords = showRoute
    ? [
        { latitude: showRoute.from.lat, longitude: showRoute.from.lng },
        { latitude: showRoute.to.lat,   longitude: showRoute.to.lng   },
      ]
    : [];

  return (
    <View style={[styles.container, { height: height as any }]} testID="map-view">
      <RNMapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        region={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        showsMyLocationButton={false}
        userInterfaceStyle={theme.bg === '#000' || theme.bg === '#0a0a0a' ? 'dark' : 'light'}
      >
        {markers.map((m, i) => {
          const icon = ICON_MAP[m.kind] ?? ICON_MAP.self;
          return (
            <Marker
              key={i}
              coordinate={{ latitude: m.lat, longitude: m.lng }}
              title={m.label}
            >
              <View style={[styles.markerWrap, { backgroundColor: icon.color }]}>
                <Ionicons name={icon.name as any} size={16} color="#fff" />
              </View>
            </Marker>
          );
        })}
        {routeCoords.length === 2 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={theme.accent ?? '#FACC15'}
            strokeWidth={3}
          />
        )}
      </RNMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden' },
  markerWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
});
