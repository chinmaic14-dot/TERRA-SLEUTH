/// <reference types="google.maps" />
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { GoogleMapsActiveContext } from '../../App';

export interface MapMarkerItem {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  valueText?: string;
  subText?: string;
  color?: string;
  radius?: number;
}

interface EarthMapProps {
  center: [number, number];
  zoom?: number;
  markers?: MapMarkerItem[];
  selectedMarkerId?: string | null;
  onSelectMarker?: (id: string) => void;
  baseLayer?: 'dark' | 'topo' | 'satellite';
  gibsTileUrl?: string | null;
  gibsOpacity?: number;
  heightClass?: string;
}

const GibsOverlayLayer: React.FC<{ tileUrl: string | null; opacity: number }> = ({ tileUrl, opacity }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !tileUrl || typeof google === 'undefined' || !google.maps?.ImageMapType) return;

    const imageMapType = new google.maps.ImageMapType({
      getTileUrl: (coord: google.maps.Point | null, zoom: number) => {
        if (!coord || zoom < 0) return '';
        const maxTile = 1 << zoom;
        if (coord.y < 0 || coord.y >= maxTile) return '';
        const wrappedX = ((coord.x % maxTile) + maxTile) % maxTile;
        return tileUrl
          .replace('{z}', String(zoom))
          .replace('{y}', String(coord.y))
          .replace('{x}', String(wrappedX));
      },
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 9,
      minZoom: 1,
      opacity,
      name: 'NASA GIBS Overlay',
    });

    map.overlayMapTypes.insertAt(0, imageMapType);
    return () => {
      const idx = map.overlayMapTypes.getArray().indexOf(imageMapType);
      if (idx !== -1) {
        map.overlayMapTypes.removeAt(idx);
      }
    };
  }, [map, tileUrl, opacity]);

  return null;
};

const GoogleMarkerWithInfo: React.FC<{
  item: MapMarkerItem;
  isSelected: boolean;
  infoOpen: boolean;
  onSelect: (id: string) => void;
  onCloseInfo: () => void;
}> = ({ item, isSelected, infoOpen, onSelect, onCloseInfo }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const color = item.color ?? '#35C99A';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: item.latitude, lng: item.longitude }}
        zIndex={isSelected ? 1000 : 10}
        onClick={() => onSelect(item.id)}
      >
        <Pin
          background={color}
          borderColor={isSelected ? '#E8F2ED' : '#07120F'}
          glyphColor="#07120F"
          scale={isSelected ? 1.2 : 0.95}
        />
      </AdvancedMarker>
      {infoOpen && marker && (
        <InfoWindow anchor={marker} pixelOffset={[0, -4]} onCloseClick={onCloseInfo}>
          <div className="text-xs text-[#0B1C17] min-w-[165px] space-y-1 p-0.5">
            <div className="font-semibold text-sm">{item.label}</div>
            {item.valueText && <div className="font-mono text-emerald-700">{item.valueText}</div>}
            {item.subText && <div className="text-slate-600 text-[11px]">{item.subText}</div>}
            <div className="font-mono text-[10px] text-sky-700">
              {item.latitude.toFixed(4)}°, {item.longitude.toFixed(4)}°
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const MapViewportSync: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  const prevRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const prev = prevRef.current;
    if (!prev || prev.lat !== center[0] || prev.lng !== center[1]) {
      map.panTo({ lat: center[0], lng: center[1] });
    }
    if (!prev || prev.zoom !== zoom) {
      map.setZoom(zoom);
    }
    prevRef.current = { lat: center[0], lng: center[1], zoom };
  }, [map, center[0], center[1], zoom]);

  return null;
};

const GoogleEarthMapInner: React.FC<EarthMapProps> = ({
  center,
  zoom = 7,
  markers = [],
  selectedMarkerId,
  onSelectMarker,
  baseLayer = 'dark',
  gibsTileUrl = null,
  gibsOpacity = 0.72,
  heightClass = 'h-[400px]',
}) => {
  const [openInfoId, setOpenInfoId] = useState<string | null>(selectedMarkerId ?? null);

  useEffect(() => {
    if (selectedMarkerId) setOpenInfoId(selectedMarkerId);
  }, [selectedMarkerId]);

  const handleMarkerSelect = useCallback(
    (id: string) => {
      setOpenInfoId(id);
      if (onSelectMarker) onSelectMarker(id);
    },
    [onSelectMarker]
  );

  const mapTypeId =
    baseLayer === 'satellite' ? 'hybrid' : baseLayer === 'topo' ? 'terrain' : 'roadmap';

  return (
    <div className={`w-full ${heightClass} rounded-xl overflow-hidden border border-[#9DB2A7]/20 relative`}>
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={{ lat: center[0], lng: center[1] }}
        defaultZoom={zoom}
        mapTypeId={mapTypeId}
        colorScheme={baseLayer === 'dark' ? 'DARK' : 'LIGHT'}
        gestureHandling="greedy"
        streetViewControl={false}
        fullscreenControl={true}
        mapTypeControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      >
        <MapViewportSync center={center} zoom={zoom} />
        <GibsOverlayLayer tileUrl={gibsTileUrl} opacity={gibsOpacity} />
        {markers.map((m) => (
          <GoogleMarkerWithInfo
            key={m.id}
            item={m}
            isSelected={m.id === selectedMarkerId}
            infoOpen={openInfoId === m.id}
            onSelect={handleMarkerSelect}
            onCloseInfo={() => setOpenInfoId(null)}
          />
        ))}
      </GoogleMap>
    </div>
  );
};

const LeafletFallbackMap: React.FC<EarthMapProps> = ({
  center,
  zoom = 7,
  markers = [],
  selectedMarkerId,
  onSelectMarker,
  baseLayer = 'dark',
  gibsTileUrl = null,
  gibsOpacity = 0.72,
  heightClass = 'h-[400px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const gibsLayerRef = useRef<L.TileLayer | null>(null);
  const markerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
    });
    mapRef.current = map;
    markerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(center, zoom, { animate: true });
  }, [center[0], center[1], zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
    }

    let url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    let attribution = '&copy; OpenStreetMap &copy; CARTO';
    if (baseLayer === 'topo') {
      url = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
      attribution = '&copy; OpenStreetMap &copy; OpenTopoMap';
    } else if (baseLayer === 'satellite') {
      url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution = '&copy; Esri World Imagery';
    }

    baseLayerRef.current = L.tileLayer(url, { attribution, maxZoom: 17 }).addTo(map);
    baseLayerRef.current.bringToBack();
  }, [baseLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (gibsLayerRef.current) {
      map.removeLayer(gibsLayerRef.current);
      gibsLayerRef.current = null;
    }
    if (gibsTileUrl) {
      gibsLayerRef.current = L.tileLayer(gibsTileUrl, {
        opacity: gibsOpacity,
        maxNativeZoom: 8,
        maxZoom: 16,
        attribution: 'NASA GIBS / EOSDIS',
      }).addTo(map);
    }
  }, [gibsTileUrl, gibsOpacity]);

  useEffect(() => {
    const group = markerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    markers.forEach((m) => {
      const isSelected = m.id === selectedMarkerId;
      const color = m.color ?? '#35C99A';
      const circle = L.circleMarker([m.latitude, m.longitude], {
        radius: isSelected ? (m.radius ?? 9) + 3 : (m.radius ?? 8),
        color: isSelected ? '#E8F2ED' : color,
        weight: isSelected ? 2.5 : 1.5,
        fillColor: color,
        fillOpacity: isSelected ? 0.92 : 0.72,
      });

      const popupHtml = `
        <div style="font-size:12px;line-height:1.45;min-width:160px;">
          <div style="font-weight:600;color:#E8F2ED;">${m.label}</div>
          ${m.valueText ? `<div style="font-family:monospace;color:#35C99A;margin-top:3px;">${m.valueText}</div>` : ''}
          ${m.subText ? `<div style="color:#9DB2A7;font-size:11px;margin-top:2px;">${m.subText}</div>` : ''}
          <div style="color:#65B8D5;font-family:monospace;font-size:10px;margin-top:4px;">${m.latitude.toFixed(4)}°, ${m.longitude.toFixed(4)}°</div>
        </div>
      `;
      circle.bindPopup(popupHtml);
      circle.on('click', () => {
        if (onSelectMarker) onSelectMarker(m.id);
      });
      circle.addTo(group);
    });
  }, [markers, selectedMarkerId, onSelectMarker]);

  return (
    <div
      ref={containerRef}
      className={`w-full ${heightClass} rounded-xl overflow-hidden border border-[#9DB2A7]/20 z-0`}
    />
  );
};

export const EarthMap: React.FC<EarthMapProps> = (props) => {
  const googleMapsActive = useContext(GoogleMapsActiveContext);
  const apiStatus = useApiLoadingStatus();

  const googleFailed =
    apiStatus === APILoadingStatus.FAILED ||
    apiStatus === APILoadingStatus.AUTH_FAILURE;

  if (googleMapsActive && !googleFailed) {
    return <GoogleEarthMapInner {...props} />;
  }

  return <LeafletFallbackMap {...props} />;
};
