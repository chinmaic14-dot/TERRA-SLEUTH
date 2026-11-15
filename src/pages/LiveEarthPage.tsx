import React, { useEffect, useState } from 'react';
import { ExternalLink, MapPin, RefreshCw, Search } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { ScientificChart } from '../components/charts/ScientificChart';
import { EarthMap, MapMarkerItem } from '../components/maps/EarthMap';

export const LiveEarthPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedLoc, setSelectedLoc] = useState({
    name: 'Bengaluru, Karnataka, India',
    lat: 12.9719,
    lon: 77.5937,
  });
  const [days, setDays] = useState(90);
  const [baseLayer, setBaseLayer] = useState<'dark' | 'topo' | 'satellite'>('dark');
  const [selectedGibsId, setSelectedGibsId] = useState<string>('modis_truecolor');
  const [gibsOpacity, setGibsOpacity] = useState(0.75);
  const [selectedPowerVar, setSelectedPowerVar] = useState<string>('PRECTOTCORR');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLiveEarth = async (lat: number, lon: number, windowDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-earth?lat=${lat}&lon=${lon}&days=${windowDays}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLiveEarth(selectedLoc.lat, selectedLoc.lon, days);
  }, [selectedLoc.lat, selectedLoc.lon, days]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const res = await fetch(`/api/geo/search?q=${encodeURIComponent(searchQuery)}`);
      const json = await res.json();
      setSearchResults(json.results ?? []);
    } catch {
      setSearchResults([]);
    }
  };

  const gibsLayers: any[] = data?.gibsLayers ?? [];
  const activeGibs = gibsLayers.find((l) => l.id === selectedGibsId) ?? null;

  const markers: MapMarkerItem[] = [
    {
      id: 'target',
      label: selectedLoc.name,
      latitude: selectedLoc.lat,
      longitude: selectedLoc.lon,
      valueText: data?.weather?.available ? `${data.weather.current.temperatureC}°C · ${data.weather.current.weatherCondition}` : 'Selected Target',
      subText: `Elevation: ${data?.coordinates?.elevationM ?? 'N/A'} m`,
      color: '#35C99A',
      radius: 10,
    },
    ...(data?.hazards?.nearbyEvents ?? []).map((ev: any) => ({
      id: ev.id,
      label: ev.title,
      latitude: ev.latitude,
      longitude: ev.longitude,
      valueText: `${ev.category} (${ev.date ?? ''})`,
      subText: `~${ev.distanceKmApprox} km from target`,
      color: '#B58C5A',
      radius: 7,
    })),
    ...(data?.hazards?.firms?.available ? data.hazards.firms.hotspots ?? [] : [])
      .slice(0, 25)
      .map((hs: any, idx: number) => ({
        id: `firms_${idx}`,
        label: `VIIRS Fire Hotspot (${hs.acqDate ?? ''} ${hs.acqTime ?? ''})`,
        latitude: hs.latitude,
        longitude: hs.longitude,
        valueText: `FRP: ${hs.frp ?? 0} MW · Bright Ti4: ${hs.brightTi4 ?? '—'} K`,
        subText: `NASA FIRMS NRT · Confidence: ${hs.confidence ?? 'nominal'}`,
        color: '#EF4444',
        radius: 6,
      })),
  ];

  const weather = data?.weather;
  const power = data?.power;
  const soilGrids = data?.soilGrids;
  const modis = data?.modisNdvi;
  const activePowerSeries = power?.series?.[selectedPowerVar];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Earth Monitor"
        description="Real-time meteorological observations, 7-day weather forecasts, gridded soil wetness, static SoilGrids baseline properties, MODIS vegetation, and NASA GIBS satellite layers with transparent data freshness."
        contextLine={`Active Target: ${selectedLoc.name} · ${selectedLoc.lat.toFixed(4)}°, ${selectedLoc.lon.toFixed(4)}° · Elev ${data?.coordinates?.elevationM ?? '—'} m`}
        actions={
          <button
            onClick={() => void loadLiveEarth(selectedLoc.lat, selectedLoc.lon, days)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10251E] border border-[#9DB2A7]/25 text-xs font-medium text-[#E8F2ED] hover:border-[#35C99A]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
        }
      />

      {/* Location Search & Time Controls */}
      <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <form onSubmit={handleSearch} className="flex flex-1 gap-2 max-w-xl">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#9DB2A7] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search any district, city, or basin (e.g., Raichur, Bengaluru, Amazon, California)..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 text-xs text-[#E8F2ED] focus:outline-none focus:border-[#35C99A]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#35C99A] text-[#07120F] text-xs font-semibold hover:bg-[#2eb58a] whitespace-nowrap"
            >
              Search Location
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#9DB2A7]">Satellite Window:</span>
            {[30, 90, 180, 365].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-md font-mono transition-colors ${
                  days === d ? 'bg-[#35C99A]/20 text-[#35C99A] border border-[#35C99A]/40' : 'bg-[#0B1C17] text-[#9DB2A7] border border-[#9DB2A7]/15'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {searchResults.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-[#9DB2A7]/10">
            {searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => {
                  setSelectedLoc({
                    name: [r.name, r.state, r.country].filter(Boolean).join(', '),
                    lat: r.latitude,
                    lon: r.longitude,
                  });
                  setSearchResults([]);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/20 text-xs text-[#E8F2ED] hover:border-[#35C99A]"
              >
                <MapPin className="w-3 h-3 text-[#35C99A]" />
                {r.name}, {r.state} ({r.country}) · {r.latitude.toFixed(2)}°, {r.longitude.toFixed(2)}°
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#10251E] border border-rose-500/40 text-xs text-rose-300">
          Failed to retrieve Live Earth observations: {error}
        </div>
      )}

      {/* Interactive Satellite Map + Layer Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[#E8F2ED]">Interactive Satellite &amp; Hazard Map</h2>
            <div className="flex items-center gap-1.5 text-xs">
              {(['dark', 'topo', 'satellite'] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBaseLayer(b)}
                  className={`px-2.5 py-1 rounded capitalize ${
                    baseLayer === b ? 'bg-[#65B8D5]/20 text-[#65B8D5]' : 'bg-[#0B1C17] text-[#9DB2A7]'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <EarthMap
            center={[selectedLoc.lat, selectedLoc.lon]}
            zoom={6}
            markers={markers}
            selectedMarkerId="target"
            baseLayer={baseLayer}
            gibsTileUrl={selectedGibsId === 'none' ? null : activeGibs?.tileUrl ?? null}
            gibsOpacity={gibsOpacity}
            heightClass="h-[380px]"
          />

          <div className="text-[11px] font-mono text-[#9DB2A7] flex flex-wrap items-center justify-between gap-2">
            <span>
              Overlay: {selectedGibsId === 'none' ? 'Base Map Only' : `${activeGibs?.name} (${activeGibs?.date} · ${activeGibs?.freshness})`}
            </span>
            {activeGibs?.worldviewUrl && (
              <a
                href={activeGibs.worldviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[#65B8D5] hover:underline"
              >
                Open in NASA Worldview <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Layer Controls & Current Weather Card */}
        <div className="xl:col-span-4 space-y-4">
          <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[#E8F2ED]">NASA GIBS Satellite Layers</h3>
            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedGibsId('none')}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs border ${
                  selectedGibsId === 'none' ? 'bg-[#0B1C17] border-[#35C99A] text-[#35C99A]' : 'bg-[#0B1C17] border-[#9DB2A7]/10 text-[#9DB2A7]'
                }`}
              >
                None (Basemap Only)
              </button>
              {gibsLayers.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelectedGibsId(l.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-colors ${
                    selectedGibsId === l.id ? 'bg-[#0B1C17] border-[#35C99A] text-[#E8F2ED]' : 'bg-[#0B1C17] border-[#9DB2A7]/10 text-[#9DB2A7] hover:text-[#E8F2ED]'
                  }`}
                >
                  <div className="font-medium">{l.name}</div>
                  <div className="text-[10px] font-mono text-[#65B8D5]">{l.freshness} · {l.date}</div>
                </button>
              ))}
            </div>
            <div className="pt-2">
              <label className="text-[11px] font-mono text-[#9DB2A7] flex justify-between">
                <span>Layer Opacity</span>
                <span>{Math.round(gibsOpacity * 100)}%</span>
              </label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={gibsOpacity}
                onChange={(e) => setGibsOpacity(Number(e.target.value))}
                className="w-full accent-[#35C99A]"
              />
            </div>
          </div>

          {/* Current Weather Observation */}
          <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#E8F2ED]">Current Weather Observation</h3>
              <span className="text-[11px] font-mono text-[#35C99A]">{weather?.freshnessStatus ?? 'Loading'}</span>
            </div>
            {weather?.available ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded bg-[#0B1C17]">
                  <div className="text-[#9DB2A7]">Air Temp</div>
                  <div className="font-mono text-base text-[#E8F2ED]">{weather.current.temperatureC} °C</div>
                </div>
                <div className="p-2.5 rounded bg-[#0B1C17]">
                  <div className="text-[#9DB2A7]">Humidity</div>
                  <div className="font-mono text-base text-[#E8F2ED]">{weather.current.humidityPct} %</div>
                </div>
                <div className="p-2.5 rounded bg-[#0B1C17]">
                  <div className="text-[#9DB2A7]">Wind</div>
                  <div className="font-mono text-sm text-[#E8F2ED]">
                    {weather.current.windSpeedKmh} km/h ({weather.current.windDirectionDeg}°)
                  </div>
                </div>
                <div className="p-2.5 rounded bg-[#0B1C17]">
                  <div className="text-[#9DB2A7]">Pressure</div>
                  <div className="font-mono text-sm text-[#E8F2ED]">{weather.current.pressureHpa} hPa</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#9DB2A7]">{weather?.error ?? 'Loading weather...'}</div>
            )}
          </div>
        </div>
      </div>

      {/* 7-Day Forecast vs Soil Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 7-Day Forecast (Explicitly labeled Forecast, NOT observation) */}
        <div className="lg:col-span-6 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#E8F2ED]">7-Day Weather Forecast</h3>
              <p className="text-xs text-[#9DB2A7]">Model forecast from Open-Meteo (distinct from observed records)</p>
            </div>
            <span className="text-[11px] font-mono text-[#65B8D5]">Forecast</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-[#9DB2A7]/15 text-[#9DB2A7] text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Condition</th>
                  <th className="py-2 text-right">Min / Max °C</th>
                  <th className="py-2 text-right">Rain (mm)</th>
                  <th className="py-2 text-right">Prob %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9DB2A7]/10">
                {(weather?.forecast ?? []).map((f: any) => (
                  <tr key={f.date}>
                    <td className="py-2 text-[#E8F2ED]">{f.date}</td>
                    <td className="py-2 font-sans text-[#9DB2A7]">{f.condition}</td>
                    <td className="py-2 text-right tabular-nums text-[#E8F2ED]">
                      {f.tempMinC?.toFixed(1)} / {f.tempMaxC?.toFixed(1)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-[#65B8D5]">{f.precipitationMm?.toFixed(1)}</td>
                    <td className="py-2 text-right tabular-nums text-[#9DB2A7]">{f.precipProbPct ?? '—'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Soil Intelligence (Satellite Wetness + SoilGrids Static Baseline) */}
        <div className="lg:col-span-6 bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#E8F2ED]">Soil Intelligence &amp; Baseline Properties</h3>
              <p className="text-xs text-[#9DB2A7]">
                Gridded satellite/model wetness is NOT a direct measurement of individual farm plots
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/10 space-y-1">
              <div className="text-[#9DB2A7]">Model Surface Soil Moisture (0–1 cm)</div>
              <div className="text-lg font-mono text-[#E8F2ED]">
                {weather?.current?.soilMoisture0to1cmM3M3 != null
                  ? `${weather.current.soilMoisture0to1cmM3M3} m³/m³`
                  : 'Unavailable'}
              </div>
              <div className="text-[11px] font-mono text-[#65B8D5]">
                Soil Temp (0 cm): {weather?.current?.soilTemp0cmC ?? '—'} °C
              </div>
              <div className="text-[10px] text-[#9DB2A7]">Open-Meteo NWP grid (~9–25 km) · Recently updated</div>
            </div>

            <div className="p-3 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/10 space-y-1">
              <div className="text-[#9DB2A7]">NASA SMAP / GEOS-5 Root-Zone Wetness</div>
              <div className="text-lg font-mono text-[#E8F2ED]">
                {(() => {
                  const vals = power?.series?.GWETROOT?.values ?? [];
                  const valid = vals.filter((v: any) => v !== null);
                  return valid.length > 0 ? `${valid[valid.length - 1].toFixed(3)} index` : 'Unavailable';
                })()}
              </div>
              <div className="text-[11px] font-mono text-[#B58C5A]">
                {power?.spatialResolution ?? '0.5° × 0.625°'}
              </div>
              <div className="text-[10px] text-[#9DB2A7]">{power?.freshnessStatus ?? 'Delayed satellite observation'}</div>
            </div>
          </div>

          {/* SoilGrids Baseline */}
          <div className="p-3 rounded-lg bg-[#0B1C17] border border-[#9DB2A7]/10 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#E8F2ED]">ISRIC SoilGrids v2.0 (Static Soil Property Map — NOT Live)</span>
              <span className="font-mono text-[11px] text-[#B58C5A]">{soilGrids?.freshnessStatus ?? 'Loading'}</span>
            </div>
            {soilGrids?.available ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                {Object.entries(soilGrids.properties).map(([k, p]: [string, any]) => (
                  <div key={k} className="p-2 rounded bg-[#10251E]">
                    <div className="text-[#9DB2A7]">{p.label} ({p.unit})</div>
                    <div className="text-[#E8F2ED]">0–5cm: {p.top0to5cm ?? '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[#9DB2A7]">
                {soilGrids?.error ?? 'Querying SoilGrids static baseline...'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Satellite Time-Series Graphs */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-[#E8F2ED]">NASA Satellite &amp; Reanalysis Time Series</h3>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(power?.series ?? {}).map((v) => (
              <button
                key={v}
                onClick={() => setSelectedPowerVar(v)}
                className={`px-3 py-1 rounded-md text-xs font-mono ${
                  selectedPowerVar === v
                    ? 'bg-[#35C99A]/20 text-[#35C99A] border border-[#35C99A]/40'
                    : 'bg-[#10251E] text-[#9DB2A7] border border-[#9DB2A7]/15'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ScientificChart
            title={activePowerSeries ? `${activePowerSeries.label} (${selectedPowerVar})` : 'NASA POWER Time Series'}
            xLabel="Observation Date"
            yLabel={selectedPowerVar}
            unit={activePowerSeries?.unit ?? ''}
            source={`${power?.source ?? 'NASA POWER'} (${power?.freshnessStatus ?? ''})`}
            dateRange={power?.dates?.length ? `${power.dates[0]} to ${power.dates[power.dates.length - 1]}` : '—'}
            dataNotes={`Spatial: ${power?.spatialResolution ?? ''} · Temporal: ${power?.temporalResolution ?? ''}`}
            labels={power?.dates ?? []}
            series={
              activePowerSeries
                ? [
                    {
                      id: selectedPowerVar,
                      label: activePowerSeries.label,
                      color: '#35C99A',
                      values: activePowerSeries.values,
                    },
                  ]
                : []
            }
          />

          <ScientificChart
            title="NASA Terra MODIS 250m Vegetation Index (MOD13Q1 NDVI)"
            xLabel="Composite Date"
            yLabel="NDVI"
            unit="NDVI (-0.2 to 1.0)"
            source={`${modis?.source ?? 'ORNL DAAC MODIS'} (${modis?.freshnessStatus ?? ''})`}
            dateRange={modis?.dates?.length ? `${modis.dates[0]} to ${modis.dates[modis.dates.length - 1]}` : '—'}
            dataNotes="16-day composite at 250 m resolution; delayed satellite observation."
            labels={modis?.dates ?? []}
            series={
              modis?.available
                ? [
                    {
                      id: 'ndvi',
                      label: 'MODIS NDVI (250m)',
                      color: '#65B8D5',
                      values: modis.values,
                    },
                  ]
                : []
            }
            emptyMessage={modis?.error ?? 'No MODIS MOD13Q1 granules available for this point.'}
          />
        </div>
      </div>

      {/* Data Freshness & Provenance Table */}
      <section className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-semibold text-[#E8F2ED]">Dataset Freshness &amp; Provenance Ledger</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#9DB2A7]/15 text-[#9DB2A7] text-left">
                <th className="py-2 pr-4">Dataset / Service</th>
                <th className="py-2 pr-4">Latest Observation</th>
                <th className="py-2 pr-4">Retrieved UTC</th>
                <th className="py-2 pr-4">Temporal Resolution</th>
                <th className="py-2">Availability Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#9DB2A7]/10 font-mono">
              <tr>
                <td className="py-2.5 pr-4 font-sans text-[#E8F2ED]">Open-Meteo Current Weather</td>
                <td className="py-2.5 pr-4">{weather?.observationTime ?? '—'}</td>
                <td className="py-2.5 pr-4">{weather?.retrievedAt?.slice(0, 19) ?? '—'}</td>
                <td className="py-2.5 pr-4 font-sans">Hourly / 15-min model</td>
                <td className="py-2.5 text-[#35C99A]">{weather?.freshnessStatus ?? 'Unavailable'}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-sans text-[#E8F2ED]">NASA POWER (GPM / MERRA-2 / SMAP)</td>
                <td className="py-2.5 pr-4">{power?.latestObservationDate ?? '—'}</td>
                <td className="py-2.5 pr-4">{power?.retrievedAt?.slice(0, 19) ?? '—'}</td>
                <td className="py-2.5 pr-4 font-sans">{power?.temporalResolution ?? 'Daily'}</td>
                <td className="py-2.5 text-[#65B8D5]">{power?.freshnessStatus ?? 'Unavailable'}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-sans text-[#E8F2ED]">NASA MODIS MOD13Q1 (ORNL DAAC)</td>
                <td className="py-2.5 pr-4">{modis?.latestObservationDate ?? '—'}</td>
                <td className="py-2.5 pr-4">{modis?.retrievedAt?.slice(0, 19) ?? '—'}</td>
                <td className="py-2.5 pr-4 font-sans">16-day composite (250 m)</td>
                <td className="py-2.5 text-[#65B8D5]">{modis?.freshnessStatus ?? 'Unavailable'}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-sans text-[#E8F2ED]">ISRIC SoilGrids v2.0</td>
                <td className="py-2.5 pr-4">Static Baseline</td>
                <td className="py-2.5 pr-4">{soilGrids?.retrievedAt?.slice(0, 19) ?? '—'}</td>
                <td className="py-2.5 pr-4 font-sans">Static property map (NOT live)</td>
                <td className="py-2.5 text-[#B58C5A]">{soilGrids?.freshnessStatus ?? 'Unavailable'}</td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-sans text-[#E8F2ED]">NASA EONET &amp; FIRMS</td>
                <td className="py-2.5 pr-4">
                  {data?.hazards?.firms?.available
                    ? `${data.hazards.firms.hotspots?.length ?? 0} FIRMS (48h)`
                    : data?.hazards?.nearbyEvents?.[0]?.date ?? 'Ongoing'}
                </td>
                <td className="py-2.5 pr-4">{data?.hazards?.retrievedAt?.slice(0, 19) ?? '—'}</td>
                <td className="py-2.5 pr-4 font-sans">
                  {data?.hazards?.firms?.available ? 'VIIRS 375m NRT + EONET' : 'Near-real-time event stream'}
                </td>
                <td className="py-2.5 text-[#35C99A]">
                  {data?.hazards?.firms?.available
                    ? 'FIRMS + EONET Active'
                    : data?.hazards?.eonetAvailable
                    ? 'EONET Active'
                    : 'Unavailable'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
