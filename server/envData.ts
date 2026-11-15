import { getCached, setCached } from './db.ts';
import { ENVIRONMENTAL_VARIABLES, type FreshnessStatus } from './types.ts';

const USER_AGENT = 'TerraSleuth/1.0 (Autonomous Earth Intelligence)';

async function fetchJsonWithRetry(url: string, timeoutMs = 12000, retries = 1): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function describeWeatherCode(code: number | null | undefined): string {
  if (code == null) return 'Unknown';
  const map: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with hail',
    99: 'Heavy thunderstorm with hail',
  };
  return map[code] ?? `WMO Code ${code}`;
}

export async function geocodeLocation(query: string) {
  const key = `geo:${query.toLowerCase().trim()}`;
  const cached = getCached<any>(key);
  if (cached) return cached.payload;

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const data = await fetchJsonWithRetry(url, 8000, 1);
  const results = (data.results ?? []).map((r: any) => ({
    name: r.name,
    country: r.country ?? '',
    state: r.admin1 ?? '',
    district: r.admin2 ?? r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    elevation_m: r.elevation ?? null,
    timezone: r.timezone ?? 'UTC',
  }));
  setCached(key, results, 86400);
  return results;
}

export async function fetchElevation(lat: number, lon: number): Promise<number | null> {
  const key = `elev:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = getCached<number | null>(key);
  if (cached) return cached.payload;

  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const data = await fetchJsonWithRetry(url, 7000, 1);
    const val = Array.isArray(data.elevation) ? Number(data.elevation[0]) : null;
    const elev = val !== null && Number.isFinite(val) ? Math.round(val * 10) / 10 : null;
    setCached(key, elev, 86400 * 7);
    return elev;
  } catch {
    return null;
  }
}

export async function fetchLiveWeatherAndForecast(lat: number, lon: number) {
  const key = `weather:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = getCached<any>(key);
  if (cached) return cached.payload;

  const retrievedAt = new Date().toISOString();
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,soil_temperature_0cm,soil_moisture_0_to_1cm` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration` +
      `&timezone=auto&forecast_days=7`;
    const data = await fetchJsonWithRetry(url, 10000, 1);
    const cur = data.current ?? {};
    const daily = data.daily ?? {};

    const forecast = (daily.time ?? []).map((date: string, idx: number) => ({
      date,
      condition: describeWeatherCode(daily.weather_code?.[idx]),
      tempMaxC: daily.temperature_2m_max?.[idx] ?? null,
      tempMinC: daily.temperature_2m_min?.[idx] ?? null,
      precipitationMm: daily.precipitation_sum?.[idx] ?? null,
      precipProbPct: daily.precipitation_probability_max?.[idx] ?? null,
      et0Mm: daily.et0_fao_evapotranspiration?.[idx] ?? null,
      freshnessStatus: 'Forecast' as FreshnessStatus,
    }));

    const out = {
      available: true,
      source: 'Open-Meteo Weather & Forecast API',
      sourceUrl: 'https://open-meteo.com/',
      retrievedAt,
      observationTime: cur.time ?? retrievedAt,
      timezone: data.timezone ?? 'UTC',
      elevationM: data.elevation ?? null,
      freshnessStatus: 'Recently updated' as FreshnessStatus,
      updateFrequency: 'Hourly assimilation / 15-min model cycle',
      current: {
        temperatureC: cur.temperature_2m ?? null,
        humidityPct: cur.relative_humidity_2m ?? null,
        precipitationMm: cur.precipitation ?? null,
        rainMm: cur.rain ?? null,
        weatherCondition: describeWeatherCode(cur.weather_code),
        pressureHpa: cur.surface_pressure ?? null,
        windSpeedKmh: cur.wind_speed_10m ?? null,
        windDirectionDeg: cur.wind_direction_10m ?? null,
        soilTemp0cmC: cur.soil_temperature_0cm ?? null,
        soilMoisture0to1cmM3M3: cur.soil_moisture_0_to_1cm ?? null,
        soilModelNote:
          'Open-Meteo surface soil moisture & temperature represent gridded numerical weather model estimates (~9–25 km), not direct on-farm probe readings.',
      },
      forecast,
    };
    setCached(key, out, 900);
    return out;
  } catch (err) {
    return {
      available: false,
      source: 'Open-Meteo Weather & Forecast API',
      sourceUrl: 'https://open-meteo.com/',
      retrievedAt,
      freshnessStatus: 'Unavailable' as FreshnessStatus,
      error: err instanceof Error ? err.message : String(err),
      current: null,
      forecast: [],
    };
  }
}

export interface PowerSeriesResult {
  available: boolean;
  source: string;
  sourceUrl: string;
  temporalResolution: string;
  spatialResolution: string;
  freshnessStatus: FreshnessStatus;
  latestObservationDate: string | null;
  retrievedAt: string;
  dates: string[];
  series: Record<string, { unit: string; label: string; mission: string; values: (number | null)[] }>;
  error?: string;
}

export async function fetchNasaPowerSeries(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  variables: string[]
): Promise<PowerSeriesResult> {
  const powerVars = variables.filter((v) => v !== 'NDVI');
  const varsToFetch = powerVars.length > 0 ? powerVars : ['PRECTOTCORR', 'T2M', 'TS', 'GWETTOP', 'GWETROOT'];

  // Clamp end date to yesterday so NASA POWER doesn't fail on future dates
  const todayStr = new Date().toISOString().slice(0, 10);
  const clampedEnd = endDate > todayStr ? todayStr : endDate;
  const startFmt = startDate.replace(/-/g, '');
  const endFmt = clampedEnd.replace(/-/g, '');

  const cacheKey = `power:${lat.toFixed(2)},${lon.toFixed(2)}:${startFmt}:${endFmt}:${varsToFetch.sort().join(',')}`;
  const cached = getCached<PowerSeriesResult>(cacheKey);
  if (cached) return cached.payload;

  const retrievedAt = new Date().toISOString();
  try {
    // NASA POWER Daily API supports up to ~30 years per request cleanly
    const url =
      `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${encodeURIComponent(varsToFetch.join(','))}` +
      `&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${startFmt}&end=${endFmt}&format=JSON`;
    const data = await fetchJsonWithRetry(url, 18000, 1);
    const paramMap = data?.properties?.parameter ?? {};
    const firstVar = varsToFetch.find((v) => paramMap[v]) ?? Object.keys(paramMap)[0];
    if (!firstVar || !paramMap[firstVar]) {
      throw new Error('NASA POWER returned no parameter records for the requested window.');
    }

    const rawDates = Object.keys(paramMap[firstVar]).sort();
    // Format YYYYMMDD -> YYYY-MM-DD, filter out trailing all-fill days where NASA satellite product has latency
    let lastValidIdx = -1;
    for (let i = rawDates.length - 1; i >= 0; i--) {
      const dk = rawDates[i];
      const hasAny = varsToFetch.some((v) => {
        const val = paramMap[v]?.[dk];
        return val !== undefined && val !== null && val > -900;
      });
      if (hasAny) {
        lastValidIdx = i;
        break;
      }
    }

    const trimmedRawDates = lastValidIdx >= 0 ? rawDates.slice(0, lastValidIdx + 1) : rawDates;
    const dates = trimmedRawDates.map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);

    // If range > 180 days, aggregate cleanly to monthly means/sums in addition or return monthly for crisp trend analysis
    const useMonthly = dates.length > 180;
    let outDates = dates;
    const series: PowerSeriesResult['series'] = {};

    if (!useMonthly) {
      for (const v of varsToFetch) {
        const meta = ENVIRONMENTAL_VARIABLES.find((m) => m.code === v);
        series[v] = {
          label: meta?.label ?? v,
          unit: meta?.unit ?? data?.parameters?.[v]?.units ?? '',
          mission: meta?.mission ?? 'NASA POWER',
          values: trimmedRawDates.map((dk) => {
            const val = paramMap[v]?.[dk];
            return val !== undefined && val !== null && val > -900 ? Math.round(val * 1000) / 1000 : null;
          }),
        };
      }
    } else {
      // Monthly aggregation preserving missingness honestly
      const monthBuckets: Record<string, Record<string, number[]>> = {};
      const monthOrder: string[] = [];
      for (const dk of trimmedRawDates) {
        const ym = `${dk.slice(0, 4)}-${dk.slice(4, 6)}-01`;
        if (!monthBuckets[ym]) {
          monthBuckets[ym] = {};
          monthOrder.push(ym);
        }
        for (const v of varsToFetch) {
          if (!monthBuckets[ym][v]) monthBuckets[ym][v] = [];
          const val = paramMap[v]?.[dk];
          if (val !== undefined && val !== null && val > -900) {
            monthBuckets[ym][v].push(val);
          }
        }
      }
      outDates = monthOrder;
      for (const v of varsToFetch) {
        const meta = ENVIRONMENTAL_VARIABLES.find((m) => m.code === v);
        series[v] = {
          label: meta?.label ?? v,
          unit: meta?.unit ?? '',
          mission: meta?.mission ?? 'NASA POWER',
          values: monthOrder.map((ym) => {
            const arr = monthBuckets[ym][v] ?? [];
            if (arr.length === 0) return null;
            const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
            return Math.round(avg * 1000) / 1000;
          }),
        };
      }
    }

    const latestObs = dates.length > 0 ? dates[dates.length - 1] : null;
    const ageDays = latestObs ? (Date.now() - Date.parse(latestObs)) / 86400000 : 999;
    const freshnessStatus: FreshnessStatus =
      ageDays <= 10 ? 'Delayed satellite observation' : 'Historical dataset';

    const result: PowerSeriesResult = {
      available: true,
      source: 'NASA POWER (GPM IMERG / MERRA-2 / GEOS-5 / CERES)',
      sourceUrl: 'https://power.larc.nasa.gov/',
      temporalResolution: useMonthly ? 'Monthly aggregate from Daily observations' : 'Daily',
      spatialResolution: '0.5° latitude × 0.625° longitude (~55 km grid)',
      freshnessStatus,
      latestObservationDate: latestObs,
      retrievedAt,
      dates: outDates,
      series,
    };
    setCached(cacheKey, result, 3600);
    return result;
  } catch (err) {
    return {
      available: false,
      source: 'NASA POWER (GPM IMERG / MERRA-2 / GEOS-5 / CERES)',
      sourceUrl: 'https://power.larc.nasa.gov/',
      temporalResolution: 'Daily / Monthly',
      spatialResolution: '0.5° × 0.625°',
      freshnessStatus: 'Unavailable',
      latestObservationDate: null,
      retrievedAt,
      dates: [],
      series: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchModisNdviSeries(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
) {
  const cacheKey = `modis_ndvi:${lat.toFixed(2)},${lon.toFixed(2)}:${startDate}:${endDate}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached.payload;

  const retrievedAt = new Date().toISOString();
  try {
    // Step 1: Query available MODIS MOD13Q1 dates near coordinates
    const datesUrl = `https://modis.ornl.gov/rst/api/v1/MOD13Q1/dates?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;
    const datesData = await fetchJsonWithRetry(datesUrl, 12000, 1);
    const allDates: { modis_date: string; calendar_date: string }[] = datesData.dates ?? [];
    const filtered = allDates.filter((d) => d.calendar_date >= startDate && d.calendar_date <= endDate);
    if (filtered.length === 0) {
      return {
        available: false,
        source: 'NASA ORNL DAAC MODIS MOD13Q1 v061',
        sourceUrl: 'https://modis.ornl.gov/',
        freshnessStatus: 'Unavailable' as FreshnessStatus,
        retrievedAt,
        dates: [],
        values: [],
        error: 'No MODIS MOD13Q1 16-day granules found in the requested date range.',
      };
    }

    // ORNL RST subset allows up to 10 dates per request cleanly; sample up to 30 dates across up to 3 chunks
    const step = Math.max(1, Math.floor(filtered.length / 24));
    const sampled = filtered.filter((_, idx) => idx % step === 0).slice(-24);
    const chunks: typeof sampled[] = [];
    for (let i = 0; i < sampled.length; i += 10) {
      chunks.push(sampled.slice(i, i + 10));
    }

    const outDates: string[] = [];
    const outValues: (number | null)[] = [];

    for (const chunk of chunks) {
      const startM = chunk[0].modis_date;
      const endM = chunk[chunk.length - 1].modis_date;
      const subUrl =
        `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&band=250m_16_days_NDVI&startDate=${startM}&endDate=${endM}&kmAboveBelow=0&kmLeftRight=0`;
      const subData = await fetchJsonWithRetry(subUrl, 15000, 1);
      for (const row of subData.subset ?? []) {
        const rawVal = Array.isArray(row.data) ? row.data[0] : null;
        outDates.push(row.calendar_date);
        if (rawVal !== null && rawVal !== undefined && rawVal >= -2000 && rawVal <= 10000) {
          outValues.push(Math.round(rawVal * 0.0001 * 10000) / 10000);
        } else {
          outValues.push(null);
        }
      }
    }

    const latestDate = outDates.length > 0 ? outDates[outDates.length - 1] : null;
    const result = {
      available: outDates.length > 0,
      source: 'NASA Terra MODIS MOD13Q1 v061 (ORNL DAAC)',
      sourceUrl: 'https://modis.ornl.gov/',
      spatialResolution: '250 m',
      temporalResolution: '16-day composite',
      freshnessStatus: 'Delayed satellite observation' as FreshnessStatus,
      latestObservationDate: latestDate,
      retrievedAt,
      dates: outDates,
      values: outValues,
    };
    setCached(cacheKey, result, 86400);
    return result;
  } catch (err) {
    return {
      available: false,
      source: 'NASA Terra MODIS MOD13Q1 v061 (ORNL DAAC)',
      sourceUrl: 'https://modis.ornl.gov/',
      freshnessStatus: 'Unavailable' as FreshnessStatus,
      retrievedAt,
      dates: [],
      values: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function searchNasaCmrDatasets(keywords: string[]) {
  const token = process.env.NASA_EARTHDATA_TOKEN?.trim();
  const cacheKey = `cmr:${keywords.join(',').toLowerCase()}:${token ? 'auth' : 'pub'}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached.payload;

  const retrievedAt = new Date().toISOString();
  const entries: any[] = [];
  for (const kw of keywords.slice(0, 4)) {
    try {
      const url = `https://cmr.earthdata.nasa.gov/search/collections.json?keyword=${encodeURIComponent(kw)}&page_size=2&has_granules=true`;
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const e of data?.feed?.entry ?? []) {
        entries.push({
          id: e.id,
          shortName: e.short_name ?? e.id,
          title: e.title,
          dataCenter: e.data_center ?? 'NASA EOSDIS',
          timeStart: e.time_start ? e.time_start.slice(0, 10) : null,
          timeEnd: e.time_end ? e.time_end.slice(0, 10) : 'Ongoing',
          summary: (e.summary ?? '').slice(0, 220),
          sourceUrl: `https://search.earthdata.nasa.gov/search/granules?p=${encodeURIComponent(e.id)}`,
          queryKeyword: kw,
          earthdataAuthenticated: Boolean(token),
        });
      }
    } catch {
      // Continue collecting remaining missions
    }
  }
  const result = { retrievedAt, earthdataAuthenticated: Boolean(token), entries };
  setCached(cacheKey, result, 43200);
  return result;
}

export async function fetchSoilGridsBaseline(lat: number, lon: number) {
  const cacheKey = `soilgrids:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached.payload;

  const retrievedAt = new Date().toISOString();
  try {
    const url =
      `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}` +
      `&property=soc&property=clay&property=sand&property=phh2o&property=bdod&depth=0-5cm&depth=5-15cm&value=mean`;
    const data = await fetchJsonWithRetry(url, 10000, 0);
    const layers = data?.properties?.layers ?? [];
    const parsed: Record<string, { label: string; unit: string; top0to5cm: number | null; sub5to15cm: number | null }> = {};
    for (const l of layers) {
      const name = l.name;
      const factor = l.unit_measure?.d_factor ?? 1;
      const unit = l.unit_measure?.mapped_units ?? '';
      const d0 = l.depths?.find((d: any) => d.label === '0-5cm')?.values?.mean ?? null;
      const d1 = l.depths?.find((d: any) => d.label === '5-15cm')?.values?.mean ?? null;
      parsed[name] = {
        label: name.toUpperCase(),
        unit,
        top0to5cm: d0 !== null ? Math.round((d0 / factor) * 100) / 100 : null,
        sub5to15cm: d1 !== null ? Math.round((d1 / factor) * 100) / 100 : null,
      };
    }
    const out = {
      available: Object.keys(parsed).length > 0,
      source: 'ISRIC SoilGrids v2.0 (Static Soil Property Baseline)',
      sourceUrl: 'https://soilgrids.org/',
      spatialResolution: '250 m',
      temporalResolution: 'Static baseline soil prediction (NOT a live soil sensor)',
      freshnessStatus: 'Historical dataset' as FreshnessStatus,
      retrievedAt,
      properties: parsed,
    };
    setCached(cacheKey, out, 86400 * 7);
    return out;
  } catch (err) {
    return {
      available: false,
      source: 'ISRIC SoilGrids v2.0 (Static Soil Property Baseline)',
      sourceUrl: 'https://soilgrids.org/',
      spatialResolution: '250 m',
      temporalResolution: 'Static baseline soil prediction (NOT live)',
      freshnessStatus: 'Unavailable' as FreshnessStatus,
      retrievedAt,
      error: `ISRIC SoilGrids service timed out or unavailable (${err instanceof Error ? err.message : String(err)}). SoilGrids is a static baseline product; use NASA SMAP / POWER GWETTOP for recent soil wetness dynamics.`,
      properties: {},
    };
  }
}

export async function fetchNasaEonetAndFirms(lat: number, lon: number) {
  const cacheKey = `eonet:${lat.toFixed(1)},${lon.toFixed(1)}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return cached.payload;

  const retrievedAt = new Date().toISOString();
  let eonetEvents: any[] = [];
  let eonetAvailable = false;

  try {
    const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?limit=40&status=open';
    const data = await fetchJsonWithRetry(url, 10000, 1);
    eonetAvailable = true;
    eonetEvents = (data.events ?? [])
      .map((ev: any) => {
        const geom = ev.geometry?.[ev.geometry.length - 1];
        const coords = geom?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const evLon = Number(coords[0]);
        const evLat = Number(coords[1]);
        const distDeg = Math.hypot(evLat - lat, evLon - lon);
        return {
          id: ev.id,
          title: ev.title,
          category: ev.categories?.[0]?.title ?? 'Environmental Event',
          date: geom.date ? String(geom.date).slice(0, 10) : null,
          latitude: evLat,
          longitude: evLon,
          distanceKmApprox: Math.round(distDeg * 111),
          link: ev.link ?? `https://eonet.gsfc.nasa.gov/api/v3/events/${ev.id}`,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.distanceKmApprox - b.distanceKmApprox);
  } catch {
    eonetAvailable = false;
  }

  let firmsStatus: { available: boolean; note: string; hotspots: any[] } = {
    available: false,
    note: 'NASA FIRMS NRT point CSV requires NASA_FIRMS_MAP_KEY in Secrets; GIBS VIIRS Thermal Anomalies satellite tile layer and NASA EONET wildfire events remain active.',
    hotspots: [],
  };

  const firmsKey = process.env.NASA_FIRMS_MAP_KEY;
  if (firmsKey && firmsKey.trim().length > 4) {
    try {
      const minLon = Math.max(-180, lon - 2.5).toFixed(2);
      const minLat = Math.max(-90, lat - 2.5).toFixed(2);
      const maxLon = Math.min(180, lon + 2.5).toFixed(2);
      const maxLat = Math.min(90, lat + 2.5).toFixed(2);
      const firmsUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey.trim()}/VIIRS_SNPP_NRT/${minLon},${minLat},${maxLon},${maxLat}/2`;
      const res = await fetch(firmsUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const csv = await res.text();
        const lines = csv.trim().split('\n').slice(1, 51);
        const hotspots = lines.map((line) => {
          const cols = line.split(',');
          return {
            latitude: Number(cols[0]),
            longitude: Number(cols[1]),
            brightTi4: Number(cols[2]),
            acqDate: cols[5],
            acqTime: cols[6],
            confidence: cols[9],
            frp: Number(cols[12] ?? 0),
          };
        });
        firmsStatus = {
          available: true,
          note: 'NASA FIRMS VIIRS SNPP NRT active fire detections (last 48 hours within 2.5° bounding box).',
          hotspots,
        };
      }
    } catch (e) {
      firmsStatus.note = `NASA FIRMS query failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const out = {
    retrievedAt,
    eonetAvailable,
    nearbyEvents: eonetEvents.filter((e: any) => e.distanceKmApprox <= 1500).slice(0, 12),
    globalEvents: eonetEvents.slice(0, 18),
    firms: firmsStatus,
  };
  setCached(cacheKey, out, 1800);
  return out;
}

export function getNasaGibsLayers(dateStr?: string) {
  // Default to 3 days ago to ensure satellite composite availability across GIBS products
  const d = dateStr ? new Date(dateStr) : new Date(Date.now() - 3 * 86400000);
  const isoDate = d.toISOString().slice(0, 10);
  const modis8DayDate = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);

  return [
    {
      id: 'modis_truecolor',
      name: 'MODIS Terra True Color',
      layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
      date: isoDate,
      format: 'jpg',
      maxZoom: 9,
      tileMatrixSet: 'GoogleMapsCompatible_Level9',
      freshness: 'Delayed satellite observation',
      description: 'NASA Terra MODIS daily visible surface reflectance.',
    },
    {
      id: 'modis_ndvi',
      name: 'MODIS Terra NDVI (Vegetation)',
      layer: 'MODIS_Terra_NDVI_8Day',
      date: modis8DayDate,
      format: 'png',
      maxZoom: 9,
      tileMatrixSet: 'GoogleMapsCompatible_Level9',
      freshness: 'Delayed satellite observation (8-day)',
      description: 'Normalized Difference Vegetation Index showing plant greenness.',
    },
    {
      id: 'modis_lst',
      name: 'MODIS Land Surface Temp (Day)',
      layer: 'MODIS_Terra_Land_Surface_Temp_Day',
      date: isoDate,
      format: 'png',
      maxZoom: 7,
      tileMatrixSet: 'GoogleMapsCompatible_Level7',
      freshness: 'Delayed satellite observation',
      description: 'Daytime skin temperature observed by Terra MODIS.',
    },
    {
      id: 'smap_soil',
      name: 'SMAP Surface Soil Moisture',
      layer: 'SMAP_L4_Analyzed_Surface_Soil_Moisture',
      date: isoDate,
      format: 'png',
      maxZoom: 6,
      tileMatrixSet: 'GoogleMapsCompatible_Level6',
      freshness: 'Delayed satellite observation',
      description: 'NASA SMAP Level-4 modeled surface soil moisture.',
    },
    {
      id: 'gpm_imerg',
      name: 'GPM IMERG Precipitation Rate',
      layer: 'IMERG_Precipitation_Rate',
      date: isoDate,
      format: 'png',
      maxZoom: 6,
      tileMatrixSet: 'GoogleMapsCompatible_Level6',
      freshness: 'Delayed satellite observation',
      description: 'Global Precipitation Measurement multi-satellite rain rate.',
    },
    {
      id: 'viirs_fires',
      name: 'VIIRS Thermal Anomalies / Fires',
      layer: 'VIIRS_SNPP_Thermal_Anomalies_375m_All',
      date: isoDate,
      format: 'png',
      maxZoom: 8,
      tileMatrixSet: 'GoogleMapsCompatible_Level8',
      freshness: 'Recently updated',
      description: 'Active thermal hotspots detected by Suomi-NPP VIIRS 375m.',
    },
  ].map((l) => ({
    ...l,
    tileUrl: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${l.layer}/default/${l.date}/${l.tileMatrixSet}/{z}/{y}/{x}.${l.format}`,
    worldviewUrl: `https://worldview.earthdata.nasa.gov/?l=${encodeURIComponent(l.layer)},Reference_Labels_15m&t=${l.date}`,
  }));
}
