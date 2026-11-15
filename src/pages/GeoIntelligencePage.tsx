import React, { useMemo, useState } from 'react';
import { AgentEmptyState } from '../components/AgentEmptyState';
import { PageHeader } from '../components/PageHeader';
import { ScientificChart } from '../components/charts/ScientificChart';
import { EarthMap, MapMarkerItem } from '../components/maps/EarthMap';
import { FullInvestigationBundle, PageId } from '../types/terra';

interface GeoIntelligencePageProps {
  bundle: FullInvestigationBundle | null;
  onNavigate: (page: PageId) => void;
}

type MapMode = 'interactive' | 'hotspot' | 'comparison' | 'intensity';

export const GeoIntelligencePage: React.FC<GeoIntelligencePageProps> = ({ bundle, onNavigate }) => {
  const geo = bundle?.outputs?.geo_intelligence;
  const inv = bundle?.investigation ?? null;

  const [mapMode, setMapMode] = useState<MapMode>('interactive');
  const [selectedLocId, setSelectedLocId] = useState<string>('loc_0');

  const locations: any[] = geo?.locations ?? [];
  const selectedLoc = useMemo(
    () => locations.find((l) => l.id === selectedLocId) ?? locations[0] ?? null,
    [locations, selectedLocId]
  );

  const gibsLayers: any[] = geo?.gibsLayers ?? [];
  const activeGibsUrl = useMemo(() => {
    if (mapMode === 'hotspot') return gibsLayers.find((l) => l.id === 'modis_lst')?.tileUrl ?? null;
    if (mapMode === 'intensity') return gibsLayers.find((l) => l.id === 'smap_soil')?.tileUrl ?? null;
    return null;
  }, [mapMode, gibsLayers]);

  const markers: MapMarkerItem[] = useMemo(() => {
    return locations.map((loc) => {
      const mag = Math.abs(loc.changeMagnitude ?? 0);
      let color = '#35C99A';
      if (loc.trendDirection === 'decreasing') color = '#B58C5A';
      if (mapMode === 'hotspot') {
        color = mag > 0.5 ? '#EF4444' : mag > 0.1 ? '#F59E0B' : '#35C99A';
      } else if (mapMode === 'comparison' && loc.id === 'loc_comparison') {
        color = '#65B8D5';
      }
      return {
        id: loc.id,
        label: loc.name,
        latitude: loc.latitude,
        longitude: loc.longitude,
        valueText: `${loc.variable}: ${loc.latestValue ?? '—'} ${loc.unit} (Δ ${loc.changeMagnitude})`,
        subText: `Elev: ${loc.elevation_m ?? 'N/A'} m · ${loc.trendDirection}`,
        color,
        radius: mapMode === 'intensity' ? Math.min(18, Math.max(7, 7 + mag * 4)) : 9,
      };
    });
  }, [locations, mapMode]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent 3 — Geo Intelligence"
        description="Spatial mapping of measured environmental changes across district transects and comparison regions. Map markers, elevation profiles, and location-specific time-series graphs remain synchronized."
        contextLine={
          inv
            ? `Study Area: ${inv.region_name} · Primary Variable: ${geo?.primaryVariable ?? '—'}`
            : 'No active investigation'
        }
      />

      {!geo || locations.length === 0 ? (
        <AgentEmptyState agentName="Geo Intelligence" investigation={inv} onNavigate={onNavigate} />
      ) : (
        <>
          {/* 4 Map Mode Selectors */}
          <div className="flex flex-wrap gap-2 bg-[#0B1C17] p-1.5 rounded-xl border border-[#9DB2A7]/15">
            {(
              [
                { id: 'interactive', label: '1. Interactive Geographical Map' },
                { id: 'hotspot', label: '2. Environmental Hotspot Map (LST Overlay)' },
                { id: 'comparison', label: '3. Regional Comparison Map' },
                { id: 'intensity', label: '4. Spatial Intensity Map (SMAP Overlay)' },
              ] as { id: MapMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setMapMode(m.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  mapMode === m.id
                    ? 'bg-[#10251E] text-[#35C99A] border border-[#35C99A]/40'
                    : 'text-[#9DB2A7] hover:text-[#E8F2ED]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Synchronized Map + Selected Location Inspector */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-7 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-2.5">
              <EarthMap
                center={[selectedLoc?.latitude ?? inv!.latitude, selectedLoc?.longitude ?? inv!.longitude]}
                zoom={mapMode === 'comparison' ? 6 : 8}
                markers={markers}
                selectedMarkerId={selectedLoc?.id}
                onSelectMarker={(id) => setSelectedLocId(id)}
                baseLayer={mapMode === 'comparison' ? 'topo' : 'dark'}
                gibsTileUrl={activeGibsUrl}
                gibsOpacity={0.65}
                heightClass="h-[380px]"
              />
              <div className="text-[11px] font-mono text-[#9DB2A7]">
                Click any marker on the map or row in the location table below to synchronize graphs.
              </div>
            </div>

            <div className="xl:col-span-5">
              {selectedLoc && (
                <ScientificChart
                  title={`Location Time-Series: ${selectedLoc.name}`}
                  xLabel="Date"
                  yLabel={selectedLoc.variable}
                  unit={selectedLoc.unit}
                  source="NASA POWER (Synchronized Spatial Node)"
                  dateRange={selectedLoc.observationPeriod}
                  dataNotes={`Coords: ${selectedLoc.latitude.toFixed(4)}°, ${selectedLoc.longitude.toFixed(4)}° · Elev: ${selectedLoc.elevation_m ?? 'N/A'} m`}
                  labels={selectedLoc.dates ?? []}
                  series={[
                    {
                      id: selectedLoc.id,
                      label: `${selectedLoc.name} (${selectedLoc.trendDirection})`,
                      color: '#35C99A',
                      values: selectedLoc.values ?? [],
                    },
                  ]}
                  height={310}
                />
              )}
            </div>
          </div>

          {/* Regional Magnitude Graph & Elevation Comparison Graph */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <ScientificChart
              title={`Regional Change Magnitude Graph (${geo.primaryVariable})`}
              xLabel="Spatial Location"
              yLabel="Net Change Magnitude"
              unit={selectedLoc?.unit ?? ''}
              source="NASA POWER Spatial Transect"
              dateRange={inv ? `${inv.start_date} to ${inv.end_date}` : '—'}
              dataNotes="Difference between final and initial valid observations at each spatial grid node."
              labels={locations.map((l) => l.name)}
              defaultChartType="bar"
              referenceLines={[{ value: 0, label: 'Zero Change', color: '#9DB2A7' }]}
              series={[
                {
                  id: 'mag',
                  label: 'Change Magnitude',
                  color: '#65B8D5',
                  values: locations.map((l) => l.changeMagnitude),
                  type: 'bar',
                },
              ]}
            />

            <ScientificChart
              title="Elevation Comparison Graph (Open-Meteo DEM)"
              xLabel="Spatial Location"
              yLabel="Elevation"
              unit="m above sea level"
              source="Open-Meteo Copernicus DEM Elevation API"
              dateRange="Static terrain elevation"
              dataNotes="Authentic terrain elevations retrieved via API (never invented)."
              labels={locations.map((l) => l.name)}
              defaultChartType="bar"
              series={[
                {
                  id: 'elev',
                  label: 'Elevation (m)',
                  color: '#B58C5A',
                  values: locations.map((l) => l.elevation_m),
                  type: 'bar',
                },
              ]}
            />
          </div>

          {/* Spatial Coordinates & Measured Values Table */}
          <section className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#E8F2ED]">Geospatial Node Measurements</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#9DB2A7]/15 text-[#9DB2A7] text-left">
                    <th className="py-2 pr-3">Location</th>
                    <th className="py-2 pr-3">Country / State / District</th>
                    <th className="py-2 pr-3 text-right">Lat / Lon</th>
                    <th className="py-2 pr-3 text-right">Elev (m)</th>
                    <th className="py-2 pr-3 text-right">Latest Value</th>
                    <th className="py-2 pr-3 text-right">Change</th>
                    <th className="py-2">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#9DB2A7]/10 font-mono">
                  {locations.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => setSelectedLocId(l.id)}
                      className={`cursor-pointer hover:bg-[#0B1C17]/70 ${
                        selectedLocId === l.id ? 'bg-[#0B1C17]' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-3 font-sans font-medium text-[#E8F2ED]">{l.name}</td>
                      <td className="py-2.5 pr-3 font-sans text-[#9DB2A7]">
                        {[l.district, l.state, l.country].filter(Boolean).join(', ')}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {l.latitude.toFixed(3)}°, {l.longitude.toFixed(3)}°
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{l.elevation_m ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-[#35C99A]">
                        {l.latestValue ?? '—'} {l.unit}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">{l.changeMagnitude}</td>
                      <td className="py-2.5">{l.trendDirection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
