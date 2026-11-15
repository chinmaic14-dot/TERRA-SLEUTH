export type FreshnessStatus =
  | 'Recently updated'
  | 'Forecast'
  | 'Latest available observation'
  | 'Delayed satellite observation'
  | 'Historical dataset'
  | 'Unavailable';

export type AgentKey =
  | 'data_scout'
  | 'trend_detective'
  | 'geo_intelligence'
  | 'relationship_analyst'
  | 'cause_investigator'
  | 'science_challenger'
  | 'impact_analyst'
  | 'earth_judge';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';

export type VerdictType =
  | 'HIGH CONCERN'
  | 'MONITOR'
  | 'IMPROVING'
  | 'INSUFFICIENT EVIDENCE';

export interface InvestigationInput {
  researchQuestion: string;
  category: string;
  country: string;
  state: string;
  district: string;
  regionName: string;
  latitude: number;
  longitude: number;
  comparisonRegionName?: string;
  comparisonLat?: number;
  comparisonLon?: number;
  startDate: string;
  endDate: string;
  variables: string[];
}

export interface InvestigationRecord {
  id: string;
  research_question: string;
  category: string;
  country: string;
  state: string;
  district: string;
  region_name: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  comparison_region_name: string | null;
  comparison_lat: number | null;
  comparison_lon: number | null;
  comparison_elevation_m: number | null;
  start_date: string;
  end_date: string;
  variables_json: string;
  status: 'running' | 'completed' | 'cancelled' | 'error';
  progress_pct: number;
  current_agent: string | null;
  verdict: VerdictType | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunRecord {
  id: string;
  investigation_id: string;
  agent_key: AgentKey;
  agent_name: string;
  status: AgentStatus;
  started_at: string | null;
  completed_at: string | null;
  findings_count: number;
  output_json: string | null;
  error_message: string | null;
}

export interface VariableCatalogItem {
  code: string;
  label: string;
  unit: string;
  mission: string;
  dataset: string;
  spatialResolution: string;
  temporalResolution: string;
  sourceUrl: string;
}

export const ENVIRONMENTAL_VARIABLES: VariableCatalogItem[] = [
  {
    code: 'PRECTOTCORR',
    label: 'Precipitation (Corrected)',
    unit: 'mm/day',
    mission: 'NASA GPM / MERRA-2',
    dataset: 'NASA POWER IMERG-MERRA2 Precipitation',
    spatialResolution: '0.5° × 0.625° (~55 km)',
    temporalResolution: 'Daily / Monthly',
    sourceUrl: 'https://power.larc.nasa.gov/',
  },
  {
    code: 'GWETTOP',
    label: 'Surface Soil Wetness (0–5 cm)',
    unit: '0–1 wetness index',
    mission: 'NASA SMAP / GEOS-5',
    dataset: 'NASA POWER Surface Soil Wetness',
    spatialResolution: '0.5° × 0.625°',
    temporalResolution: 'Daily / Monthly',
    sourceUrl: 'https://power.larc.nasa.gov/',
  },
  {
    code: 'GWETROOT',
    label: 'Root-Zone Soil Wetness (0–100 cm)',
    unit: '0–1 wetness index',
    mission: 'NASA SMAP / GEOS-5',
    dataset: 'NASA POWER Root Zone Soil Wetness',
    spatialResolution: '0.5° × 0.625°',
    temporalResolution: 'Daily / Monthly',
    sourceUrl: 'https://power.larc.nasa.gov/',
  },
  {
    code: 'T2M',
    label: 'Air Temperature (2m)',
    unit: '°C',
    mission: 'NASA MERRA-2',
    dataset: 'MERRA-2 2-Meter Air Temperature',
    spatialResolution: '0.5° × 0.625°',
    temporalResolution: 'Daily / Monthly',
    sourceUrl: 'https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/',
  },
  {
    code: 'TS',
    label: 'Land Surface / Earth Skin Temp',
    unit: '°C',
    mission: 'NASA MODIS / MERRA-2',
    dataset: 'NASA POWER Earth Skin Temperature',
    spatialResolution: '0.5° × 0.625°',
    temporalResolution: 'Daily / Monthly',
    sourceUrl: 'https://modis.gsfc.nasa.gov/',
  },
  {
    code: 'NDVI',
    label: 'Normalized Difference Vegetation Index',
    unit: 'NDVI (-0.2 to 1.0)',
    mission: 'NASA Terra MODIS',
    dataset: 'MOD13Q1 v061 Vegetation Indices (ORNL DAAC)',
    spatialResolution: '250 m',
    temporalResolution: '16-day composite',
    sourceUrl: 'https://modis.ornl.gov/',
  },
  {
    code: 'RH2M',
    label: 'Relative Humidity (2m)',
    unit: '%',
    mission: 'NASA MERRA-2',
    dataset: 'NASA POWER Relative Humidity',
    spatialResolution: '0.5° × 0.625°',
    temporalResolution: 'Daily / Monthly',
    sourceUrl: 'https://power.larc.nasa.gov/',
  },
  {
    code: 'ALLSKY_SFC_SW_DWN',
    label: 'All-Sky Solar Irradiance',
    unit: 'MJ/m²/day',
    mission: 'NASA CERES',
    dataset: 'CERES SYN1deg Surface Solar Flux',
    spatialResolution: '1.0° × 1.0°',
    temporalResolution: 'Daily / Monthly',
    sourceUrl: 'https://ceres.larc.nasa.gov/',
  },
  {
    code: 'EVPTRNS',
    label: 'Evapotranspiration Energy Flux',
    unit: 'MJ/m²/day',
    mission: 'NASA MERRA-2 / GEOS',
    dataset: 'NASA POWER Evapotranspiration Energy Flux',
    spatialResolution: '0.5° × 0.625°',
    temporalResolution: 'Daily / Monthly',
    sourceUrl: 'https://power.larc.nasa.gov/',
  },
];

export const AGENT_SEQUENCE: { key: AgentKey; name: string }[] = [
  { key: 'data_scout', name: 'Data Scout' },
  { key: 'trend_detective', name: 'Trend Detective' },
  { key: 'geo_intelligence', name: 'Geo Intelligence' },
  { key: 'relationship_analyst', name: 'Relationship Analyst' },
  { key: 'cause_investigator', name: 'Cause Investigator' },
  { key: 'science_challenger', name: 'Science Challenger' },
  { key: 'impact_analyst', name: 'Impact Analyst' },
  { key: 'earth_judge', name: 'Earth Judge' },
];
