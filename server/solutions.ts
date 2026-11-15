import { getInvestigationById, getSolutionPlan, upsertSolutionPlan } from './db.ts';
import { fetchModisNdviSeries, fetchNasaPowerSeries } from './envData.ts';
import { discoverSolutionResourcesWithSearch } from './gemini.ts';
import { extractAgentOutputs } from './pipeline.ts';

export type EnvDomain = 'water' | 'soil' | 'fire' | 'vegetation' | 'heat';

export const DOMAIN_OPTIONS: { id: EnvDomain; label: string }[] = [
  { id: 'water', label: 'Water & Soil Moisture' },
  { id: 'soil', label: 'Soil Health & Agriculture' },
  { id: 'fire', label: 'Wildfire & Thermal Risk' },
  { id: 'vegetation', label: 'Vegetation & Forest Canopy' },
  { id: 'heat', label: 'Heat & Surface Thermal Stress' },
];

export const IMPLEMENTER_ROLES = [
  'Farmer / Land Steward',
  'Environmentalist / Conservationist',
  'Environmental Researcher / NGO',
  'Water Resource Manager / Irrigation User',
  'Forestry & Ecosystem Restoration Officer',
  'FPO / Watershed Cooperative',
  'Gram Panchayat / Local Administration',
  'Urban Heat & Municipal Planner',
  'Disaster & Wildfire Response Coordinator',
] as const;

export type RoleKey =
  | 'farmer'
  | 'environmentalist'
  | 'researcher'
  | 'water_mgr'
  | 'forestry'
  | 'fpo'
  | 'panchayat'
  | 'urban'
  | 'wildfire';

export interface SolutionOption {
  id: string;
  rank: number;
  title: string;
  category: string;
  scientificBasis: string;
  feasibility: string;
  sustainability: string;
  estimatedBudgetRange: string;
  recommendedFor: string;
  targetRoleKey: RoleKey;
  targetDomain: EnvDomain;
  implementationSteps: string[];
  monitoringVariables: string[];
}

const DOMAIN_LABELS: Record<EnvDomain, string> = {
  water: 'Water & Soil Moisture',
  soil: 'Soil Health & Agriculture',
  fire: 'Wildfire & Thermal Risk',
  vegetation: 'Vegetation & Forest Canopy',
  heat: 'Heat & Surface Thermal Stress',
};

export function resolveInvestigationDomain(
  inv: any,
  overrideDomain?: string
): { domain: EnvDomain; label: string } {
  if (overrideDomain && overrideDomain in DOMAIN_LABELS) {
    const d = overrideDomain as EnvDomain;
    return { domain: d, label: DOMAIN_LABELS[d] };
  }

  const cat = String(inv?.category ?? '').toLowerCase().trim();
  if (cat.includes('fire') || cat.includes('wildfire') || cat.includes('burn')) {
    return { domain: 'fire', label: DOMAIN_LABELS.fire };
  }
  if (cat === 'soil' || cat === 'agriculture' || cat.includes('soil') || cat.includes('agri')) {
    return { domain: 'soil', label: DOMAIN_LABELS.soil };
  }
  if (cat.includes('water') || cat.includes('drought') || cat.includes('rain')) {
    return { domain: 'water', label: DOMAIN_LABELS.water };
  }
  if (cat.includes('forest') || cat.includes('vegetation') || cat.includes('land cover')) {
    return { domain: 'vegetation', label: DOMAIN_LABELS.vegetation };
  }
  if (cat.includes('temperature') || cat.includes('heat') || cat.includes('climate')) {
    return { domain: 'heat', label: DOMAIN_LABELS.heat };
  }

  const q = String(inv?.research_question ?? '').toLowerCase();
  if (q.includes('fire') || q.includes('wildfire') || q.includes('burn')) {
    return { domain: 'fire', label: DOMAIN_LABELS.fire };
  }
  if (q.includes('soil health') || q.includes('soil organic') || q.includes('soil degradation') || q.includes('soil erosion') || q.includes('crop')) {
    return { domain: 'soil', label: DOMAIN_LABELS.soil };
  }
  if (q.includes('heat') || q.includes('urban heat') || q.includes('lst') || q.includes('warming')) {
    return { domain: 'heat', label: DOMAIN_LABELS.heat };
  }
  if (q.includes('forest') || q.includes('vegetation') || q.includes('deforest') || q.includes('ndvi') || q.includes('canopy')) {
    return { domain: 'vegetation', label: DOMAIN_LABELS.vegetation };
  }
  if (q.includes('water') || q.includes('drought') || q.includes('rain') || q.includes('groundwater') || q.includes('soil moisture')) {
    return { domain: 'water', label: DOMAIN_LABELS.water };
  }
  return { domain: 'water', label: DOMAIN_LABELS.water };
}

export function classifyRoleKey(userType: string): RoleKey {
  const r = userType.toLowerCase();
  if (r.includes('environmentalist') || r.includes('conservationist')) return 'environmentalist';
  if (r.includes('researcher') || r.includes('ngo')) return 'researcher';
  if (r.includes('urban') || r.includes('municipal')) return 'urban';
  if (r.includes('wildfire') || r.includes('disaster')) return 'wildfire';
  if (r.includes('forestry') || r.includes('ecosystem')) return 'forestry';
  if (r.includes('water resource') || r.includes('irrigation')) return 'water_mgr';
  if (r.includes('fpo') || r.includes('cooperative')) return 'fpo';
  if (r.includes('panchayat') || r.includes('administration')) return 'panchayat';
  return 'farmer';
}

export function resolveRelevantRolesForInvestigation(inv: any): string[] {
  const q = String(inv?.research_question ?? '').toLowerCase();
  const cat = String(inv?.category ?? '').toLowerCase();
  const combined = `${cat} ${q}`;

  const roles: string[] = [];
  const add = (r: (typeof IMPLEMENTER_ROLES)[number]) => {
    if (!roles.includes(r)) roles.push(r);
  };

  // Explicit user-specified role cues in the research question come first
  if (q.includes('farmer') || q.includes('farm') || q.includes('crop') || q.includes('agri') || q.includes('yield')) {
    add('Farmer / Land Steward');
    add('FPO / Watershed Cooperative');
  }
  if (q.includes('urban') || q.includes('city') || q.includes('municipal') || q.includes('ward') || q.includes('heat island')) {
    add('Urban Heat & Municipal Planner');
  }
  if (q.includes('wildfire') || q.includes('forest fire') || q.includes('burn') || q.includes('fire')) {
    add('Disaster & Wildfire Response Coordinator');
    add('Forestry & Ecosystem Restoration Officer');
  }
  if (q.includes('forest') || q.includes('deforest') || q.includes('canopy') || q.includes('biodiversity') || q.includes('wildlife')) {
    add('Forestry & Ecosystem Restoration Officer');
    add('Environmentalist / Conservationist');
  }
  if (q.includes('panchayat') || q.includes('village') || q.includes('watershed') || q.includes('community') || q.includes('basin')) {
    add('Gram Panchayat / Local Administration');
    add('Water Resource Manager / Irrigation User');
  }
  if (q.includes('research') || q.includes('study') || q.includes('attribute') || q.includes('sensor') || q.includes('trend')) {
    add('Environmental Researcher / NGO');
  }

  // Domain-driven fallback strictly matching investigation topic when roles are still sparse
  const { domain } = resolveInvestigationDomain(inv);
  if (domain === 'water') {
    if (!combined.includes('urban') && !combined.includes('city') && !combined.includes('municipal')) {
      add('Farmer / Land Steward');
      add('Water Resource Manager / Irrigation User');
      add('Gram Panchayat / Local Administration');
      add('FPO / Watershed Cooperative');
    } else {
      add('Urban Heat & Municipal Planner');
      add('Water Resource Manager / Irrigation User');
    }
    add('Environmental Researcher / NGO');
  } else if (domain === 'soil') {
    add('Farmer / Land Steward');
    add('FPO / Watershed Cooperative');
    add('Environmentalist / Conservationist');
    add('Environmental Researcher / NGO');
  } else if (domain === 'fire') {
    add('Disaster & Wildfire Response Coordinator');
    add('Forestry & Ecosystem Restoration Officer');
    add('Environmentalist / Conservationist');
    add('Environmental Researcher / NGO');
  } else if (domain === 'vegetation') {
    add('Forestry & Ecosystem Restoration Officer');
    add('Environmentalist / Conservationist');
    add('Environmental Researcher / NGO');
  } else if (domain === 'heat') {
    if (combined.includes('urban') || combined.includes('city') || combined.includes('municipal')) {
      add('Urban Heat & Municipal Planner');
      add('Environmentalist / Conservationist');
      add('Environmental Researcher / NGO');
    } else {
      add('Farmer / Land Steward');
      add('Environmentalist / Conservationist');
      add('Environmental Researcher / NGO');
    }
  }

  return roles.length > 0 ? roles : ['Farmer / Land Steward', 'Environmental Researcher / NGO'];
}

export function buildRankedSolutions(
  inv: any,
  judgeOut: any,
  userType: string,
  budgetInr: number,
  domainOverride?: string
): SolutionOption[] {
  const { domain, label: domainLabel } = resolveInvestigationDomain(inv, domainOverride);
  const roleKey = classifyRoleKey(userType);
  const verdict = judgeOut?.verdict || 'MONITOR';
  const region = [inv?.district, inv?.state, inv?.country].filter(Boolean).join(', ');
  const lowBudget = budgetInr < 25000;

  const tag = (
    item: Omit<SolutionOption, 'recommendedFor' | 'targetRoleKey' | 'targetDomain'>
  ): SolutionOption => ({
    ...item,
    recommendedFor: userType,
    targetRoleKey: roleKey,
    targetDomain: domain,
  });

  if (roleKey === 'researcher') {
    if (domain === 'water') {
      return [
        tag({
          id: 'sol_res_water_telemetry',
          rank: 1,
          title: 'Hydrological & Rain-Gauge Ground-Truth Validation Network',
          category: 'Water & Soil Moisture · Research Telemetry',
          scientificBasis: `Resolves 0.5° (~55 km) NASA POWER precipitation & SMAP grid uncertainty across ${region} (${verdict}).`,
          feasibility: lowBudget
            ? 'High (manual WMO rain gauges & piezometer logging within ₹25,000)'
            : 'Very High (tipping-bucket dataloggers + piezometric pressure transducers)',
          sustainability: 'High — builds multi-season catchment water-balance validation datasets.',
          estimatedBudgetRange: 'Verify hydro-met instrument pricing on GeM / IMD-authorised OEMs',
          implementationSteps: [
            `Select 3–5 catchment stations across ${region} elevation gradients.`,
            'Co-locate tipping-bucket rain gauges and shallow observation wells with NASA POWER grid cells.',
            'Calibrate daily runoff and soil-wetness bias every monsoon quarter.',
          ],
          monitoringVariables: ['PRECTOTCORR', 'GWETTOP', 'GWETROOT'],
        }),
        tag({
          id: 'sol_res_water_paired',
          rank: 2,
          title: 'Controlled Paired-Watershed Recharge Attribution Study',
          category: 'Water & Soil Moisture · Applied Hydrology',
          scientificBasis: `Isolates local check-dam / micro-irrigation impact from ENSO rainfall variability in ${region}.`,
          feasibility: 'High via ANRF / DST Water Technology Initiative grants',
          sustainability: 'High — generates peer-reviewable hydrological impact evidence.',
          estimatedBudgetRange: 'Eligible for DST-WTI / ANRF water research grants',
          implementationSteps: [
            'Pair a treated micro-watershed with a hydrologically matched control sub-basin.',
            'Track monthly water-table depth alongside NASA POWER GWETROOT anomalies.',
          ],
          monitoringVariables: ['GWETROOT', 'PRECTOTCORR'],
        }),
      ];
    }

    if (domain === 'soil') {
      return [
        tag({
          id: 'sol_res_soil_sampling',
          rank: 1,
          title: 'Stratified Soil Organic Carbon (SOC) & TDR Moisture Profiling',
          category: 'Soil Health & Agriculture · Soil Telemetry',
          scientificBasis: `Validates SoilGrids 250m baseline and NASA POWER surface moisture against lab soil profiles in ${region} (${verdict}).`,
          feasibility: lowBudget
            ? 'High (auger sampling + KVK/ICAR-IISS wet chemistry analysis)'
            : 'Very High (handheld TDR soil moisture/EC probes + multi-depth lab assays)',
          sustainability: 'High — establishes repeatable 0–30 cm soil carbon and structure baselines.',
          estimatedBudgetRange: 'Verify GeM / ICAR soil probe & lab assay costs directly',
          implementationSteps: [
            `Collect composite 0–15 cm and 15–30 cm soil cores across dominant ${region} soil textures.`,
            'Analyze pH, organic carbon, bulk density, and NPK at ICAR/KVK Soil Testing Labs.',
            'Correlate in-situ TDR moisture readings with SMAP/POWER GWETTOP & NDVI.',
          ],
          monitoringVariables: ['GWETTOP', 'GWETROOT', 'NDVI'],
        }),
        tag({
          id: 'sol_res_soil_tillage',
          rank: 2,
          title: 'Conservation Tillage & Biochar Carbon-Sequestration Field Trial',
          category: 'Soil Health & Agriculture · Experimental Agronomy',
          scientificBasis: 'Quantifies infiltration gains and topsoil moisture retention under organic amendments.',
          feasibility: 'High with State Agricultural University / KVK plot partners',
          sustainability: 'Very High — long-term topsoil fertility benchmark.',
          estimatedBudgetRange: 'Eligible under ICAR / NMSA / ANRF soil research calls',
          implementationSteps: [
            'Lay out randomized block plots comparing no-till mulching vs conventional tillage.',
            'Measure pre- and post-season SOC, infiltration rate, and MODIS NDVI response.',
          ],
          monitoringVariables: ['GWETTOP', 'NDVI'],
        }),
      ];
    }

    if (domain === 'fire') {
      return [
        tag({
          id: 'sol_res_fire_firms',
          rank: 1,
          title: 'VIIRS/MODIS Active Fire Ground-Truthing & Fuel-Load Survey',
          category: 'Wildfire & Thermal Risk · Fire Ecology Telemetry',
          scientificBasis: `Validates NASA FIRMS VIIRS thermal anomalies against fuel moisture and RH2M dry spells in ${region} (${verdict}).`,
          feasibility: 'High with Forest Survey of India (FSI) / university field teams',
          sustainability: 'High — calibrates false-alarm vs genuine wildfire ignition thresholds.',
          estimatedBudgetRange: 'Verify IR radiometer & portable anemometer rates on GeM',
          implementationSteps: [
            'Establish dry-litter fuel-load transects across fire-prone scrub/forest edges.',
            'Log fuel moisture, ambient RH2M, and wind speed during FIRMS satellite overpasses.',
            'Map burn-severity recovery using post-fire 250m MODIS NDVI.',
          ],
          monitoringVariables: ['TS', 'RH2M', 'NDVI'],
        }),
      ];
    }

    return [
      tag({
        id: `sol_res_ground_truth_${domain}`,
        rank: 1,
        title: `Ground-Truth Sensor Validation Network for ${domainLabel}`,
        category: `${domainLabel} · Research Telemetry`,
        scientificBasis: `Resolves satellite pixel-scale uncertainty in ${region} (${verdict}) exclusively for ${domainLabel}.`,
        feasibility: lowBudget
          ? 'High (manual calibrated field logging within ₹25,000)'
          : 'Very High (automated datalogger stations & MODIS ground truthing)',
        sustainability: 'High — generates peer-reviewable validation datasets.',
        estimatedBudgetRange: 'Verify calibrated instrument pricing directly on GeM / OEM portals',
        implementationSteps: [
          `Select 3–5 stratified sampling sites across ${region}.`,
          `Deploy calibrated sensors strictly for ${domainLabel} indicators.`,
          'Co-locate weekly field observations with NASA POWER / 250m MODIS overpasses.',
        ],
        monitoringVariables: domain === 'heat' ? ['TS', 'T2M', 'ALLSKY_SFC_SW_DWN'] : ['NDVI', 'GWETTOP', 'TS'],
      }),
    ];
  }

  if (roleKey === 'environmentalist') {
    if (domain === 'water') {
      return [
        tag({
          id: 'sol_env_water_wetland',
          rank: 1,
          title: 'Citizen Wetland, Lake & Spring-Shed Protection Campaign',
          category: 'Water & Soil Moisture · Conservation Action',
          scientificBasis: `Protects critical groundwater recharge zones and local waterbodies against depletion in ${region} (${verdict}).`,
          feasibility: 'High — combines citizen geo-tagging with NPCA / Jal Shakti petitions',
          sustainability: 'Very High — safeguards public commons aquifers and riparian buffers.',
          estimatedBudgetRange: 'Low capital outlay; eligible for MoEFCC EIACP / Wetland Mithra community support',
          implementationSteps: [
            'Map threatened local tanks, check-dams, and feeder streams around Geo Intelligence coordinates.',
            'Submit documented satellite moisture decline evidence to District Wetland Authority / Gram Sabha.',
            'Organize community silt-trap clearing and native riparian reed planting before monsoon.',
          ],
          monitoringVariables: ['PRECTOTCORR', 'GWETTOP', 'GWETROOT'],
        }),
        tag({
          id: 'sol_env_water_audit',
          rank: 2,
          title: 'Participatory Water-Watch & Greywater Bio-Filtration Pilot',
          category: 'Water & Soil Moisture · Ecological Stewardship',
          scientificBasis: 'Reduces freshwater extraction pressure while restoring local surface moisture buffers.',
          feasibility: lowBudget ? 'High (citizen water-quality test kits + reed-bed pilot)' : 'High (ward/village bio-swales)',
          sustainability: 'High — scalable community water stewardship model.',
          estimatedBudgetRange: 'Verify citizen water-test kit prices on ONDC / authorised lab suppliers',
          implementationSteps: [
            'Train local volunteers to log monthly open-well levels alongside NASA POWER tracking.',
            'Establish planted reed-bed greywater bio-filters at community discharge points.',
          ],
          monitoringVariables: ['GWETTOP', 'PRECTOTCORR'],
        }),
      ];
    }

    if (domain === 'soil') {
      return [
        tag({
          id: 'sol_env_soil_restoration',
          rank: 1,
          title: 'Degraded Land Bio-Composting, Vetiver Hedgerows & Erosion Control',
          category: 'Soil Health & Agriculture · Ecological Restoration',
          scientificBasis: `Reverses topsoil organic carbon loss and gully erosion across degraded parcels in ${region} (${verdict}).`,
          feasibility: 'Very High — low-cost biological soil stabilization using vetiver & leaf-litter compost',
          sustainability: 'Very High — rebuilds living topsoil microbiome and water-holding capacity.',
          estimatedBudgetRange: 'Verify vetiver slips & bio-inoculant rates via local nurseries / ONDC',
          implementationSteps: [
            'Identify bare, crusted, or eroding slopes using SoilGrids & Geo Intelligence spatial markers.',
            'Plant contour vetiver grass strips to arrest sheet erosion prior to rains.',
            'Convert community dry leaves and biomass into enriched compost instead of burning.',
          ],
          monitoringVariables: ['GWETTOP', 'NDVI'],
        }),
      ];
    }

    if (domain === 'fire') {
      return [
        tag({
          id: 'sol_env_fire_watch',
          rank: 1,
          title: 'Community Wildfire Watch & Zero-Burn Biomass Advocacy',
          category: 'Wildfire & Thermal Risk · Conservation Preparedness',
          scientificBasis: `Counters human-ignited edge fires and stubble/litter burning flagged in ${region} (${verdict}).`,
          feasibility: 'High — leverages Live Earth NASA FIRMS hotspot alerts with volunteer patrols',
          sustainability: 'Very High — protects biodiversity corridors from recurring dry-season burns.',
          estimatedBudgetRange: 'Minimal hardware cost; coordinate with local Range Forest Office & SDMA',
          implementationSteps: [
            'Monitor Live Earth NASA FIRMS VIIRS alerts daily during peak dry months.',
            'Organize zero-burn dry biomass mulching workshops along forest-farm boundaries.',
            'Report verified active smoke plumes promptly to District Forest / Fire Control Room.',
          ],
          monitoringVariables: ['TS', 'RH2M', 'NDVI'],
        }),
      ];
    }

    if (domain === 'heat') {
      return [
        tag({
          id: 'sol_env_heat_canopy',
          rank: 1,
          title: 'Citizen Native Shade-Tree Corridors & Heat-Island Greening',
          category: 'Heat & Surface Thermal Stress · Urban/Rural Cooling',
          scientificBasis: `Lowers exposed land skin temperature (TS) across ${region} (${verdict}) via dense native canopy.`,
          feasibility: 'High via MoEFCC Green Credit / State Forest Nursery sapling drives',
          sustainability: 'Very High — multi-decade microclimate cooling & biodiversity habitat.',
          estimatedBudgetRange: 'Saplings often subsidized at State Forest Nurseries; tree-guards via ONDC',
          implementationSteps: [
            'Target high-LST concrete corridors and bare commons identified in Geo Intelligence.',
            'Plant drought-resilient native shade species with protective bamboo/mesh guards.',
            'Track seasonal cooling via Outcome Monitoring (TS & MODIS NDVI).',
          ],
          monitoringVariables: ['TS', 'T2M', 'NDVI'],
        }),
      ];
    }

    return [
      tag({
        id: 'sol_env_veg_biodiversity',
        rank: 1,
        title: 'Native Habitat Corridor Rewilding & Invasive Weed Removal',
        category: 'Vegetation & Forest Canopy · Conservation Action',
        scientificBasis: `Rebuilds indigenous biodiversity and reverses canopy NDVI fragmentation in ${region} (${verdict}).`,
        feasibility: 'High with local Eco-Development Committees & volunteer conservation groups',
        sustainability: 'Very High — self-regenerating native plant communities.',
        estimatedBudgetRange: 'Verify native sapling & weed-clearing tool costs via Forest Nursery / ONDC',
        implementationSteps: [
          'Clear invasive Lantana/Prosopis patches on degraded commons.',
          'Replant native multi-tier trees, shrubs, and grasses matched to local rainfall.',
          'Monitor 250m MODIS NDVI trajectory quarterly in Outcome Monitoring.',
        ],
        monitoringVariables: ['NDVI', 'GWETTOP'],
      }),
    ];
  }

  if (roleKey === 'urban') {
    if (domain === 'water') {
      return [
        tag({
          id: 'sol_urban_stormwater_recharge',
          rank: 1,
          title: 'Municipal Permeable Pavements & Ward Stormwater Recharge Wells',
          category: 'Water & Soil Moisture · Municipal Infrastructure',
          scientificBasis: `Captures urban runoff surges into aquifer recharge shafts in ${region} (${verdict}).`,
          feasibility: budgetInr >= 100000 ? 'High via AMRUT 2.0 ward stormwater allocation' : 'Pilot Ward Scale',
          sustainability: 'Very High — multi-year municipal groundwater & stormwater resilience.',
          estimatedBudgetRange: 'Verify GeM stormwater drain/paver schedule of rates (SOR) with Municipal Engineer',
          implementationSteps: [
            'Identify water-stressed or flood-prone municipal wards using Geo Intelligence moisture markers.',
            'Specify BIS-compliant modular permeable pavers and rainwater recharge shafts on GeM.',
            'Enforce pre-monsoon desilting audit and track moisture recovery quarterly.',
          ],
          monitoringVariables: ['PRECTOTCORR', 'GWETTOP', 'GWETROOT'],
        }),
        tag({
          id: 'sol_urban_lake_stepwell',
          rank: 2,
          title: 'Urban Lake, Tank & Stormwater Inlet Desilting Restoration',
          category: 'Water & Soil Moisture · Urban Hydrology',
          scientificBasis: 'Restores urban surface water storage and shallow aquifer recharge corridors.',
          feasibility: 'High under AMRUT 2.0 Waterbody Rejuvenation grants',
          sustainability: 'Very High — durable municipal water buffer.',
          estimatedBudgetRange: 'Verify municipal waterbody DPR norms via AMRUT 2.0 portal',
          implementationSteps: [
            'Map encroached or silted storm inlets draining into municipal tanks.',
            'Install silt traps and native riparian bank stabilization.',
            'Monitor seasonal precipitation storage and root-zone wetness.',
          ],
          monitoringVariables: ['PRECTOTCORR', 'GWETROOT', 'GWETTOP'],
        }),
      ];
    }

    if (domain === 'soil') {
      return [
        tag({
          id: 'sol_urban_soil_bioretention',
          rank: 1,
          title: 'Urban Rain-Gardens, Bioswales & Municipal Compost Soil Remediation',
          category: 'Soil Health & Agriculture · Peri-Urban Infrastructure',
          scientificBasis: `Restores compacted urban/peri-urban topsoil infiltration and organic matter in ${region} (${verdict}).`,
          feasibility: 'High via Swachh Bharat Urban compost + AMRUT greening convergence',
          sustainability: 'Very High — turns municipal wet waste compost into sponge-city soil.',
          estimatedBudgetRange: 'Verify municipal compost/bioswale unit rates on GeM',
          implementationSteps: [
            'Amend compacted civic parks and median strips with certified municipal city compost.',
            'Construct roadside vegetated bioswales to filter silt and retain moisture.',
          ],
          monitoringVariables: ['GWETTOP', 'NDVI'],
        }),
      ];
    }

    if (domain === 'fire') {
      return [
        tag({
          id: 'sol_urban_fire_interface',
          rank: 1,
          title: 'Peri-Urban Wildland-Urban Interface (WUI) Firebreaks & Hydrant Readiness',
          category: 'Wildfire & Thermal Risk · Municipal Safety',
          scientificBasis: `Protects municipal fringes and landfill/greenbelt edges from thermal ignitions in ${region} (${verdict}).`,
          feasibility: 'High via Municipal Fire Services & SDMA convergence',
          sustainability: 'Very High — prevents smoke hazards and peri-urban fire spread.',
          estimatedBudgetRange: 'Verify municipal fire-safety equipment rates on GeM',
          implementationSteps: [
            'Clear dry grass and combustible waste buffers around urban-forest edges.',
            'Link municipal fire control rooms to daily Live Earth NASA FIRMS alerts.',
          ],
          monitoringVariables: ['TS', 'RH2M'],
        }),
      ];
    }

    return [
      tag({
        id: 'sol_urban_cool_surface',
        rank: 1,
        title: 'High-Albedo Cool Roofs & Shaded Urban Canopy Corridors',
        category: `${domainLabel} · Municipal Infrastructure`,
        scientificBasis: `Directly reduces daytime land surface skin temperature (TS) and sensible heat storage in ${region} (${verdict}).`,
        feasibility: budgetInr >= 100000 ? 'High via Smart Cities / NDMA Heat Action Plan' : 'Pilot Ward Scale',
        sustainability: 'Very High — multi-year municipal thermal & canopy resilience.',
        estimatedBudgetRange: 'Verify GeM cool-roof coating schedule of rates (SOR) with Municipal Engineer',
        implementationSteps: [
          'Identify hottest municipal wards using Geo Intelligence LST/thermal markers.',
          'Specify BIS-compliant high-SRI cool-roof coatings on municipal buildings via GeM.',
          'Track MODIS LST (TS) and 250m NDVI cooling impact every quarter.',
        ],
        monitoringVariables: ['TS', 'T2M', 'NDVI'],
      }),
      tag({
        id: 'sol_urban_park_buffer',
        rank: 2,
        title: 'Nagar Van Micro-Forests & Shaded Streetscape Buffers',
        category: `${domainLabel} · Urban Green Infrastructure`,
        scientificBasis: 'Evapotranspiration cooling reduces local thermal peaks while restoring urban canopy.',
        feasibility: 'High under MoEFCC Nagar Van Yojana',
        sustainability: 'Very High — long-term municipal cooling asset.',
        estimatedBudgetRange: 'Verify municipal forestry grant norms via official urban/MoEFCC portal',
        implementationSteps: [
          'Map vacant municipal parcels near thermal hotspots.',
          'Plant native shade-canopy species sourced from State Forest Nurseries.',
          'Track seasonal 250m MODIS NDVI recovery.',
        ],
        monitoringVariables: ['NDVI', 'TS'],
      }),
    ];
  }

  if (roleKey === 'wildfire') {
    if (domain === 'water' || domain === 'soil') {
      return [
        tag({
          id: `sol_disaster_${domain}_drought`,
          rank: 1,
          title:
            domain === 'water'
              ? 'District Drought Contingency Water Storage & Tanker/Aquifer Readiness'
              : 'Erosion & Landslide Slope Stabilization in Vulnerable Catchments',
          category: `${domainLabel} · Disaster Mitigation`,
          scientificBasis: `Mitigates severe ${domainLabel} disaster exposure flagged in ${region} (${verdict}).`,
          feasibility: 'High via State Disaster Mitigation Fund (SDMF) & DDMA action plans',
          sustainability: 'Very High — strengthens rapid district drought/erosion resilience.',
          estimatedBudgetRange: 'Verify SDMF / DDMA mitigation norms on official state portal',
          implementationSteps: [
            `Flag critically stressed sub-districts using Geo Intelligence ${domain} markers.`,
            'Pre-position emergency water/slope stabilization kits procured via GeM.',
          ],
          monitoringVariables: ['GWETTOP', 'GWETROOT', 'PRECTOTCORR'],
        }),
      ];
    }

    return [
      tag({
        id: 'sol_fire_early_warning',
        rank: 1,
        title: 'NASA FIRMS NRT Alert Dispatch & Mineral Firebreak Network',
        category: 'Wildfire & Thermal Risk · Prevention & Rapid Response',
        scientificBasis: `Targets dry thermal anomaly corridors (TS / VIIRS hotspots) flagged in ${region} (${verdict}).`,
        feasibility: 'High — integrates directly with FSI / SDMA / Range fire crews',
        sustainability: 'Very High — prevents high-severity crown fires.',
        estimatedBudgetRange: 'Eligible under MoEFCC FFPMS & State Disaster Mitigation Fund (verify on portal)',
        implementationSteps: [
          'Monitor daily NASA FIRMS NRT detections and low-humidity RH2M spikes in Live Earth Monitor.',
          'Clear 10–15 m mineral fuel breaks along high-risk ridge lines prior to peak dry season.',
          'Pre-position portable water bladders and suppression hand-tools procured via GeM.',
        ],
        monitoringVariables: ['TS', 'RH2M', 'NDVI'],
      }),
      tag({
        id: 'sol_fire_fuel_moisture',
        rank: 2,
        title: 'Fuel-Moisture Monitoring & Community Fire Watch Committees',
        category: 'Wildfire & Thermal Risk · Community Preparedness',
        scientificBasis: 'Links root-zone dryness and relative humidity thresholds to proactive burning bans.',
        feasibility: 'High with Village Forest Committees / SDMA volunteers',
        sustainability: 'High — reduces human-ignited agricultural/forest edge fires.',
        estimatedBudgetRange: 'Verify SDMA / FFPMS community outreach allocation on official state portal',
        implementationSteps: [
          'Train local volunteer spotters on FIRMS hotspot verification protocols.',
          'Establish controlled dry-litter clearing schedules away from forest boundaries.',
        ],
        monitoringVariables: ['GWETTOP', 'RH2M', 'TS'],
      }),
    ];
  }

  if (roleKey === 'forestry') {
    if (domain === 'fire') {
      return [
        tag({
          id: 'sol_forest_fire_buffer',
          rank: 1,
          title: 'Fire-Resilient Green Firebreaks & Controlled Fuel-Load Reduction',
          category: 'Wildfire & Thermal Risk · Forest Protection',
          scientificBasis: `Protects forest compartments from dry-season surface fires in ${region} (${verdict}).`,
          feasibility: 'High via CAMPA & Forest Fire Prevention Scheme (FFPMS)',
          sustainability: 'Very High — protects regenerating native stands.',
          estimatedBudgetRange: 'Funded via State Forest Department CAMPA / FFPMS APO norms',
          implementationSteps: [
            'Maintain 10 m firelines and evergreen broadleaf fire-retardant belts.',
            'Monitor daily NASA FIRMS NRT hotspots in Live Earth Monitor.',
          ],
          monitoringVariables: ['TS', 'RH2M', 'NDVI'],
        }),
      ];
    }

    if (domain === 'soil') {
      return [
        tag({
          id: 'sol_forest_soil_conservation',
          rank: 1,
          title: 'Forest Catchment Soil & Moisture Conservation (SMC) Gully Plugs',
          category: 'Soil Health & Agriculture · Forest Soil Conservation',
          scientificBasis: `Arrests topsoil loss and organic matter runoff in degraded forest slopes of ${region} (${verdict}).`,
          feasibility: 'High — low material cost using local loose-boulder & brushwood checks',
          sustainability: 'Very High — rebuilds forest floor humus and infiltration.',
          estimatedBudgetRange: 'Verify CAMPA SMC unit rates locally',
          implementationSteps: [
            'Survey eroded forest gullies and stabilize slopes with contour trenches and vetiver/grasses.',
            'Monitor surface soil moisture and canopy NDVI recovery quarterly.',
          ],
          monitoringVariables: ['GWETTOP', 'NDVI'],
        }),
      ];
    }

    return [
      tag({
        id: 'sol_forest_native_regen',
        rank: 1,
        title: 'Staggered Contour Trenches & Native Canopy Restoration',
        category: `${domainLabel} · Ecosystem Restoration`,
        scientificBasis: `Stabilizes moisture and reverses vegetation index (NDVI) decline across ${region} (${verdict}).`,
        feasibility: 'High via CAMPA & Green India Mission annual working plans',
        sustainability: 'Very High — self-sustaining native biodiversity recovery.',
        estimatedBudgetRange: 'Funded via State Forest Department CAMPA / GIM norms',
        implementationSteps: [
          'Delineate degraded compartments aligned with Geo Intelligence spatial markers.',
          'Excavate staggered contour trenches before monsoon to maximize retention.',
          'Plant climate-matched native saplings and track 16-day MODIS NDVI recovery.',
        ],
        monitoringVariables: domain === 'water' ? ['PRECTOTCORR', 'GWETROOT', 'NDVI'] : ['NDVI', 'GWETTOP', 'TS'],
      }),
    ];
  }

  if (roleKey === 'water_mgr' || roleKey === 'panchayat' || roleKey === 'fpo') {
    if (domain === 'soil') {
      return [
        tag({
          id: `sol_comm_soil_${roleKey}`,
          rank: 1,
          title:
            roleKey === 'fpo'
              ? 'FPO Village Soil Testing Lab & Bio-Compost Custom Hiring Hub'
              : 'Panchayat Watershed Silt Harvesting & Community Composting Yards',
          category: 'Soil Health & Agriculture · Institutional Scale',
          scientificBasis: `Restores soil organic carbon and reduces chemical fertilizer imbalance across ${region} (${verdict}).`,
          feasibility: 'High via Soil Health Card convergence / MGNREGS / SMAM CHC',
          sustainability: 'Very High — builds shared soil diagnostics and organic nutrient cycling.',
          estimatedBudgetRange: 'Verify SMAM CHC / MGNREGS norms on official portal',
          implementationSteps: [
            'Coordinate village-wide composite soil sampling before Kharif sowing.',
            'Desilt village tanks to spread nutrient-rich tank silt onto degraded farm soils.',
          ],
          monitoringVariables: ['GWETTOP', 'NDVI'],
        }),
      ];
    }

    if (domain === 'fire') {
      return [
        tag({
          id: `sol_comm_fire_${roleKey}`,
          rank: 1,
          title:
            roleKey === 'fpo'
              ? 'FPO Zero-Burn Straw Baler & Mulcher Custom Hiring Centre'
              : 'Gram Panchayat Village Fire-Watch & Dry-Biomass Mulching Action',
          category: 'Wildfire & Thermal Risk · Community Prevention',
          scientificBasis: `Eliminates open residue burning and edge wildfires flagged in ${region} (${verdict}).`,
          feasibility: 'High under SMAM Crop Residue Management / SDMA community preparedness',
          sustainability: 'Very High — turns fire hazard biomass into soil mulch.',
          estimatedBudgetRange: 'Verify SMAM CRM / Finance Commission norms on official portal',
          implementationSteps: [
            'Procure Happy Seeder / straw mulcher implements via SMAM CHC for member farms.',
            'Coordinate village rapid response alerts whenever Live Earth FIRMS spots nearby heat anomalies.',
          ],
          monitoringVariables: ['TS', 'RH2M', 'NDVI'],
        }),
      ];
    }

    const isHeatOrVeg = domain === 'heat' || domain === 'vegetation';
    return [
      tag({
        id: `sol_comm_${domain}_1`,
        rank: 1,
        title: isHeatOrVeg
          ? `Community ${domainLabel} Buffer & Panchayat Green-Cover Action`
          : 'Community Percolation Tanks, Check-Dam Desilting & Water Budgeting',
        category: `${domainLabel} · ${roleKey === 'fpo' ? 'Cooperative Scale' : 'Watershed / Village Scale'}`,
        scientificBasis: `Addresses basin-wide deficits in ${region} (${verdict}) across shared hydrological boundaries.`,
        feasibility: 'High via Atal Bhujal / MGNREGS NRM / WDC-PMKSY / 15th Finance Commission grants',
        sustainability: 'Very High — community-governed recharge and long-term resilience.',
        estimatedBudgetRange: 'Verify MGNREGS / WDC-PMKSY / Finance Commission unit cost norms on official portal',
        implementationSteps: [
          'Conduct Participatory Water/Resource Budget in Gram Sabha / Cooperative General Body.',
          'Map priority recharge/restoration structures along drainage lines using Geo Intelligence markers.',
          'Procure community instrumentation (rain gauges, piezometers) via GeM / FPO framework.',
        ],
        monitoringVariables: isHeatOrVeg ? ['NDVI', 'TS', 'GWETTOP'] : ['PRECTOTCORR', 'GWETROOT', 'GWETTOP'],
      }),
      tag({
        id: `sol_comm_${domain}_2`,
        rank: 2,
        title:
          roleKey === 'fpo'
            ? 'FPO Custom Hiring Centre for Water-Saving & Conservation Implements'
            : 'Village Piezometer & Automated Weather Telemetry Tracking',
        category: `${domainLabel} · Institutional Capacity`,
        scientificBasis: 'Reduces individual capital barrier while tracking local moisture/canopy response.',
        feasibility: 'High under SMAM Custom Hiring / Atal Bhujal community monitoring',
        sustainability: 'High — builds shared local technical assets.',
        estimatedBudgetRange: 'Verify SMAM CHC / Jal Shakti grant limits on official portal',
        implementationSteps: [
          'Register institutional entity and submit project DPR on state portal.',
          'Maintain monthly village-level measurements alongside TERRA SLEUTH Outcome Monitoring.',
        ],
        monitoringVariables: ['GWETROOT', 'PRECTOTCORR', 'NDVI'],
      }),
    ];
  }

  // Farmer / Land Steward — strictly scoped to investigation domain ONLY
  if (domain === 'soil') {
    return [
      tag({
        id: 'sol_farmer_soil_health',
        rank: 1,
        title: 'Soil Health Card Testing, Bio-Composting & Green Manuring',
        category: 'Soil Health & Agriculture · Farm Scale',
        scientificBasis: `Rebuilds depleted topsoil organic carbon, water-holding capacity, and nutrient balance in ${region} (${verdict}).`,
        feasibility: lowBudget
          ? 'Very High (on-farm compost + Sesbania/sunhemp green manure within ₹25,000)'
          : 'High (combine Soil Health Card lab micronutrients + enriched vermicompost)',
        sustainability: 'Very High — permanently improves soil structure and biological fertility.',
        estimatedBudgetRange: 'Free soil testing at KVK/State labs; verify PKVY organic input subsidy on official portal',
        implementationSteps: [
          'Collect zigzag composite topsoil samples (0–15 cm) and submit to nearest KVK Soil Testing Lab.',
          'Apply Soil Health Card recommended zinc/boron micronutrients and farmyard compost.',
          'Sow pre-monsoon green manure (dhaincha/sunhemp) and incorporate prior to flowering.',
        ],
        monitoringVariables: ['GWETTOP', 'GWETROOT', 'NDVI'],
      }),
      tag({
        id: 'sol_farmer_soil_bunding',
        rank: 2,
        title: 'Vegetative Contour Bunding & Conservation Mulch Tillage',
        category: 'Soil Health & Agriculture · Erosion Protection',
        scientificBasis: 'Prevents sheet erosion of fertile topsoil during intense cloudbursts.',
        feasibility: 'High via MGNREGS individual land development / State Agriculture support',
        sustainability: 'Very High — retains topsoil depth and root moisture.',
        estimatedBudgetRange: 'Verify contour-bunding MGNREGS wage/material norms at Gram Panchayat / RSK',
        implementationSteps: [
          'Stabilize field bunds with vetiver or fodder grasses.',
          'Retain 30% crop stubbles as surface mulch instead of deep plowing.',
        ],
        monitoringVariables: ['GWETTOP', 'NDVI'],
      }),
    ];
  }

  if (domain === 'fire') {
    return [
      tag({
        id: 'sol_farmer_fire_no_burn',
        rank: 1,
        title: 'In-Situ Crop Residue Mulching & Farm-Boundary Firelines',
        category: 'Wildfire & Thermal Risk · Farm Protection',
        scientificBasis: `Prevents dangerous agricultural residue fires and protects orchards/crops from dry-season wildfire spread in ${region} (${verdict}).`,
        feasibility: 'High via SMAM Crop Residue Management (CRM) & custom-hiring mulchers',
        sustainability: 'Very High — eliminates smoke hazards while protecting farm topsoil moisture.',
        estimatedBudgetRange: 'Verify SMAM CRM / Bio-Decomposer subsidy at local RSK',
        implementationSteps: [
          'Clear a 3–5 m bare soil firebreak along boundaries adjoining dry scrub or forest edges.',
          'Use bio-decomposer capsules or hire a straw mulcher instead of open burning.',
          'Watch Live Earth NASA FIRMS alerts during dry windy days.',
        ],
        monitoringVariables: ['TS', 'RH2M', 'NDVI'],
      }),
    ];
  }

  if (domain === 'heat') {
    return [
      tag({
        id: 'sol_farmer_heat_mulch',
        rank: 1,
        title: 'Crop-Residue Soil Mulching & Agroforestry Shade Windbreaks',
        category: 'Heat & Surface Thermal Stress · Farm Microclimate',
        scientificBasis: `Reduces bare-soil daytime heating (TS) and heat-induced crop stress in ${region} (${verdict}).`,
        feasibility: lowBudget ? 'Very High (uses existing farm crop residue)' : 'High (combine mulching + boundary saplings)',
        sustainability: 'Very High — builds organic carbon while cooling root zones.',
        estimatedBudgetRange: 'Low cash outlay; verify State Horticulture / Agroforestry nursery subsidy',
        implementationSteps: [
          'Cover exposed soil rows with 5–7 cm organic straw/residue mulch before peak summer.',
          'Plant heat-tolerant boundary trees along western/southern field edges.',
          'Monitor farm-grid Land Surface Temp (TS) and NDVI in Outcome Monitoring.',
        ],
        monitoringVariables: ['TS', 'T2M', 'NDVI'],
      }),
    ];
  }

  if (domain === 'vegetation') {
    return [
      tag({
        id: 'sol_farmer_agroforestry',
        rank: 1,
        title: 'On-Farm Bund Agroforestry & Native Shelterbelt Restoration',
        category: 'Vegetation & Forest Canopy · Farm Scale',
        scientificBasis: `Rebuilds vegetative cover (NDVI) and boundary windbreaks in ${region} (${verdict}).`,
        feasibility: 'High — low capital cost via State Forestry / Horticulture nurseries',
        sustainability: 'Very High — long-term canopy and soil protection.',
        estimatedBudgetRange: 'Verify subsidized sapling distribution at local RSK / Forest Range Office',
        implementationSteps: [
          'Source drought-hardy native boundary saplings from authorised state nurseries.',
          'Plant along field bunds with protective guards and organic mulch.',
        ],
        monitoringVariables: ['NDVI', 'GWETTOP', 'TS'],
      }),
    ];
  }

  // Farmer + Water ONLY
  return [
    tag({
      id: 'sol_farmer_micro_irrigation',
      rank: 1,
      title: 'Precision Drip & Micro-Irrigation with Organic Mulching',
      category: 'Water & Soil Moisture · Farm Scale',
      scientificBasis: `Directly counters surface/root-zone soil wetness deficits observed in ${region} (${verdict}).`,
      feasibility: budgetInr >= 25000 ? 'High (eligible for PMKSY-PDMC micro-irrigation subsidy)' : 'Moderate (start with 0.5-acre pilot + mulching)',
      sustainability: 'High — cuts evaporative water waste while protecting root-zone moisture.',
      estimatedBudgetRange: 'Verify per-hectare rate via official PMKSY / State Agriculture portal',
      implementationSteps: [
        'Verify Farmer ID on state portal and check PMKSY micro-irrigation eligibility.',
        'Obtain water/soil quality test from nearest KVK Soil Testing Lab.',
        'Procure BIS-certified inline drip kits through state-empanelled dealers or ONDC.',
      ],
      monitoringVariables: ['GWETTOP', 'GWETROOT', 'PRECTOTCORR'],
    }),
    tag({
      id: 'sol_farmer_farm_pond',
      rank: 2,
      title: 'Farm Pond (Krishi Honda) & Contour Field Bunding',
      category: 'Water & Soil Moisture · Farm Harvesting',
      scientificBasis: 'Stores intense rainfall bursts on-farm to buffer mid-season dry spells.',
      feasibility: 'High via State Krishi Bhagya / MGNREGS individual beneficiary convergence',
      sustainability: 'Very High — 15+ year protective irrigation storage asset.',
      estimatedBudgetRange: 'Verify Krishi Bhagya / MGNREGS farm-pond subsidy norms on official portal',
      implementationSteps: [
        'Mark natural field runoff channel with Raitha Samparka Kendra / Watershed Officer.',
        'Apply via official State Agriculture portal before pre-monsoon excavation window.',
      ],
      monitoringVariables: ['PRECTOTCORR', 'GWETROOT'],
    }),
  ];
}

export function getVerifiedOfficialPortals(
  state: string,
  country: string,
  userType = 'Farmer / Land Steward',
  domain: EnvDomain = 'water'
) {
  const isKarnataka = state.toLowerCase().includes('karnataka');
  const roleKey = classifyRoleKey(userType);

  const schemes: any[] = [];
  const productPlatforms: any[] = [];
  const videos: any[] = [];

  const pushScheme = (s: any) =>
    schemes.push({ ...s, targetRoleKey: roleKey, targetDomain: domain });
  const pushPlatform = (p: any) =>
    productPlatforms.push({ ...p, targetRoleKey: roleKey, targetDomain: domain });
  const pushVideo = (v: any) =>
    videos.push({ ...v, targetRoleKey: roleKey, targetDomain: domain });

  // ---------------------------------------------------------------------------
  // 1. STRICTLY SCOPED SCHEMES (Role × Domain ONLY)
  // ---------------------------------------------------------------------------
  if (roleKey === 'farmer') {
    if (domain === 'water') {
      pushScheme({
        name: 'Pradhan Mantri Krishi Sinchayee Yojana (PMKSY — Per Drop More Crop)',
        department: 'Ministry of Agriculture & Farmers Welfare',
        benefits: 'Subsidy assistance strictly for on-farm drip/sprinkler micro-irrigation and water conservation.',
        eligibility: 'Cultivable landholders with valid irrigation source',
        assistanceAmount: 'Verify state-specific PMKSY subsidy slab on official portal',
        requiredDocuments: ['Land Ownership (RTC/Pahani)', 'Farmer ID', 'Empanelled Vendor Quotation'],
        applicationDates: 'Annual state allocation windows',
        officialUrl: 'https://pmksy.mowr.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
      if (isKarnataka) {
        pushScheme({
          name: 'FRUITS & K-KISAN — Karnataka Farmer Irrigation & Farm Pond Subsidies',
          department: 'Department of Agriculture, Government of Karnataka',
          benefits: 'Single Farmer ID (FRUITS) and online K-KISAN applications for Krishi Honda farm ponds and micro-irrigation.',
          eligibility: 'Karnataka farmers holding RTC/Pahani',
          assistanceAmount: 'Verify active Krishi Bhagya / PDMC norms on K-KISAN',
          requiredDocuments: ['FRUITS FID', 'RTC / Pahani', 'Bank Passbook'],
          applicationDates: 'Seasonal Kharif / Rabi windows',
          officialUrl: 'https://kkisan.karnataka.gov.in/',
          lastVerifiedDate: '2026-11-15',
          regionScope: 'Karnataka, India',
        });
      }
    } else if (domain === 'soil') {
      pushScheme({
        name: 'Soil Health Card & Soil Health Management Scheme (NMSA)',
        department: 'Ministry of Agriculture & Farmers Welfare',
        benefits: 'Subsidized laboratory soil testing, micronutrient amendments, and Soil Health Card fertility prescriptions.',
        eligibility: 'All Indian farmers holding cultivable agricultural land',
        assistanceAmount: 'Free / subsidized soil testing & micronutrient assistance (verify locally)',
        requiredDocuments: ['Farmer ID', 'Land Record (RTC/Pahani)', 'Composite Soil Sample'],
        applicationDates: 'Year-round prior to Kharif / Rabi sowing',
        officialUrl: 'https://soilhealth.dac.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
      pushScheme({
        name: 'Paramparagat Krishi Vikas Yojana (PKVY — Organic Soil Carbon Farming)',
        department: 'Department of Agriculture & Farmers Welfare',
        benefits: 'Financial support for bio-composting, green manuring, and chemical-free soil regeneration.',
        eligibility: 'Farmers participating in cluster organic/soil restoration groups',
        assistanceAmount: 'Verify active PKVY per-hectare cluster norms on official portal',
        requiredDocuments: ['Farmer ID', 'RTC / Land Extract', 'Bank Passbook'],
        applicationDates: 'State cluster formation windows',
        officialUrl: 'https://pgsindia-ncof.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else if (domain === 'fire') {
      pushScheme({
        name: 'Crop Residue Management (CRM) & Zero-Burn Farm Mechanization (SMAM)',
        department: 'Ministry of Agriculture & Farmers Welfare',
        benefits: 'Subsidy on in-situ straw mulchers, shredders, and bio-decomposers to eliminate open farm burning.',
        eligibility: 'Individual farmers and custom hiring groups',
        assistanceAmount: 'Verify SMAM/CRM subsidy percentages on agrimachinery.nic.in',
        requiredDocuments: ['Farmer ID', 'Land Record', 'Empanelled Implement Quotation'],
        applicationDates: 'Pre-harvest seasonal windows',
        officialUrl: 'https://agrimachinery.nic.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else {
      pushScheme({
        name: 'Sub-Mission on Agroforestry (SMAF) / State Social Forestry Nursery Support',
        department: 'Ministry of Agriculture / State Forest & Horticulture Dept.',
        benefits: 'Planting material and boundary tree-plantation assistance for shade, windbreaks, and canopy cover.',
        eligibility: 'Landholders establishing boundary windbreaks or agroforestry plots',
        assistanceAmount: 'Verify sapling and maintenance norms on state portal',
        requiredDocuments: ['Land Record (RTC)', 'Farmer ID', 'Bank Passbook'],
        applicationDates: 'Pre-monsoon planting window',
        officialUrl: isKarnataka ? 'https://fruits.karnataka.gov.in/' : 'https://www.myscheme.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: isKarnataka ? 'Karnataka, India' : 'All India',
      });
    }
  } else if (roleKey === 'environmentalist') {
    if (domain === 'water') {
      pushScheme({
        name: 'National Plan for Conservation of Aquatic Ecosystems (NPCA) & Wetland Mithra',
        department: 'Ministry of Environment, Forest and Climate Change (MoEFCC)',
        benefits: 'Citizen wetland stewardship, lake conservation proposals, and community waterbody protection.',
        eligibility: 'Registered Conservation Groups, Citizen Wetland Volunteers & NGOs',
        assistanceAmount: 'Verify NPCA / State Wetland Authority community project norms',
        requiredDocuments: ['Wetland/Lake Geo-Coordinates', 'Community Petition / NGO Registration'],
        applicationDates: 'Ongoing Wetland Authority submissions',
        officialUrl: 'https://indianwetlands.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else if (domain === 'soil') {
      pushScheme({
        name: 'MoEFCC Desertification Combat & Community Soil Restoration Support',
        department: 'Ministry of Environment, Forest and Climate Change',
        benefits: 'Community land degradation neutrality, bio-composting, and vegetative erosion stabilization.',
        eligibility: 'Environmentalist collectives, Eco-Clubs & Conservation NGOs',
        assistanceAmount: 'Verify CFP / Green Credit soil restoration norms on official portal',
        requiredDocuments: ['Site Degradation Assessment', 'Conservation Group Registration'],
        applicationDates: 'Annual CFP / Mission cycles',
        officialUrl: 'https://moef.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else if (domain === 'fire') {
      pushScheme({
        name: 'Forest Survey of India (FSI) Citizen Fire Watch & EIACP Awareness Support',
        department: 'Forest Survey of India / MoEFCC',
        benefits: 'Community fire-alert coordination, zero-burn awareness, and volunteer forest-edge fire watches.',
        eligibility: 'Conservationists, Eco-Development Volunteers & Wildlife NGOs',
        assistanceAmount: 'Coordinate with State Forest Range & SDMA community preparedness budgets',
        requiredDocuments: ['Volunteer Group / NGO ID', 'FIRMS Alert Zone Coordinates'],
        applicationDates: 'Pre-fire season (Nov–May)',
        officialUrl: 'https://fsi.nic.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else {
      pushScheme({
        name: 'MoEFCC Green Credit Program & Eco-Restoration Grants',
        department: 'Ministry of Environment, Forest and Climate Change (ICFRE)',
        benefits: 'Community tree-cover, degraded commons greening, and urban/rural cooling canopy verification.',
        eligibility: 'Individuals, Conservationists, NGOs & Community Organizations',
        assistanceAmount: 'Credit / restoration recognition verified per planted native block',
        requiredDocuments: ['Land/Parcel Permission', 'Species List & GPS Polygon'],
        applicationDates: 'Ongoing registration on Green Credit Portal',
        officialUrl: 'https://www.moefcc-gcp.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    }
  } else if (roleKey === 'researcher') {
    if (domain === 'water') {
      pushScheme({
        name: 'DST Water Technology Initiative (WTI) & ANRF Hydrological Research Grants',
        department: 'Department of Science & Technology / ANRF',
        benefits: 'Research funding specifically for catchment hydrology, groundwater recharge attribution, and sensor telemetry.',
        eligibility: 'Universities, Research Institutes & SIRO-recognised Scientific NGOs',
        assistanceAmount: 'Peer-reviewed project grant ceiling',
        requiredDocuments: ['Principal Investigator Proposal', 'Institutional Endorsement', 'Sensor BOQ'],
        applicationDates: 'Call-for-proposal windows',
        officialUrl: 'https://anrfonline.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else if (domain === 'soil') {
      pushScheme({
        name: 'ICAR-IISS / ANRF Soil Carbon & Land Degradation Research Grants',
        department: 'ICAR / Anusandhan National Research Foundation',
        benefits: 'Research support for in-situ SOC assays, TDR moisture validation, and soil microbiome studies.',
        eligibility: 'Agricultural Universities, Research Labs & Registered Scientific NGOs',
        assistanceAmount: 'Peer-reviewed R&D grant norms',
        requiredDocuments: ['Soil Sampling Methodology', 'Institutional Endorsement', 'Lab Assay Budget'],
        applicationDates: 'Annual CFP cycles',
        officialUrl: 'https://anrfonline.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else if (domain === 'fire') {
      pushScheme({
        name: 'NDMA / FSI Wildfire Telemetry & Thermal Remote-Sensing R&D',
        department: 'NDMA / Forest Survey of India / MoEFCC',
        benefits: 'Applied research on VIIRS/FIRMS false-alarm calibration, fuel moisture models, and burn-scar recovery.',
        eligibility: 'Research Institutes & Disaster-Science NGOs',
        assistanceAmount: 'Verify current CFP norms on official portals',
        requiredDocuments: ['FIRMS Validation Protocol', 'Forest Dept Research Permit'],
        applicationDates: 'Annual CFP cycles',
        officialUrl: 'https://ndma.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else {
      pushScheme({
        name: 'ANRF / MoEFCC EIACP Climate, Canopy & Thermal Research Grants',
        department: 'ANRF / Ministry of Environment, Forest and Climate Change',
        benefits: `Funding for satellite-vs-ground validation strictly within ${DOMAIN_LABELS[domain]}.`,
        eligibility: 'Academic Institutions & Registered Environmental NGOs (NGO Darpan ID)',
        assistanceAmount: 'Verify current CFP norms on MoEFCC / ANRF portal',
        requiredDocuments: ['NGO Darpan ID / Institute Registration', 'Technical Methodology Proposal'],
        applicationDates: 'Annual CFP cycles',
        officialUrl: 'https://moef.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    }
  } else if (roleKey === 'water_mgr' || roleKey === 'panchayat') {
    if (domain === 'water' || domain === 'soil') {
      pushScheme({
        name:
          domain === 'soil'
            ? 'WDC-PMKSY 2.0 & MGNREGS Soil & Moisture Conservation (SMC) Works'
            : 'Atal Bhujal Yojana & Jal Shakti Abhiyan (Community Water Management)',
        department:
          domain === 'soil' ? 'Department of Land Resources / MoRD' : 'Ministry of Jal Shakti, Govt. of India',
        benefits:
          domain === 'soil'
            ? 'Contour trenching, gully plugs, silt traps, and community topsoil stabilization works.'
            : 'Community groundwater budgeting, check-dam recharge structures, and village water security planning.',
        eligibility: 'Gram Panchayats, Water User Associations, and Watershed Committees',
        assistanceAmount: 'Determined by approved Gram Panchayat / Watershed Action Plan',
        requiredDocuments: ['Gram Sabha Resolution', 'Technical DPR & Coordinates', 'Authorized Signatory Mandate'],
        applicationDates: 'Annual Panchayat planning cycle',
        officialUrl: domain === 'soil' ? 'https://wdcpmksy.dolr.gov.in/' : 'https://ataljal.mowr.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else {
      pushScheme({
        name: `15th Finance Commission / MGNREGS Community ${DOMAIN_LABELS[domain]} Works`,
        department: 'Ministry of Panchayati Raj / Rural Development',
        benefits: `Village-scale action strictly scoped to ${DOMAIN_LABELS[domain]} resilience.`,
        eligibility: 'Gram Panchayats & Local Bodies',
        assistanceAmount: 'Approved Panchayat Annual Development Plan (GPDP)',
        requiredDocuments: ['Gram Sabha Resolution', 'Geo-tagged Site Coordinates'],
        applicationDates: 'Annual GPDP cycle',
        officialUrl: 'https://egramswaraj.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    }
  } else if (roleKey === 'fpo') {
    pushScheme({
      name: `SMAM Custom Hiring Centre & SFAC FPO Grants (${DOMAIN_LABELS[domain]})`,
      department: 'SFAC / NABARD / Department of Agriculture',
      benefits: `Shared FPO machinery & field services tailored strictly for ${DOMAIN_LABELS[domain]}.`,
      eligibility: 'Registered Farmer Producer Organizations (FPOs) & Cooperatives',
      assistanceAmount: 'Verify equity matching & CHC grant ceilings on official portal',
      requiredDocuments: ['FPO Registration Certificate', 'Board Resolution', 'Business Plan'],
      applicationDates: 'Ongoing institutional windows',
      officialUrl: 'https://agrimachinery.nic.in/',
      lastVerifiedDate: '2026-11-15',
      regionScope: 'All India',
    });
  } else if (roleKey === 'forestry') {
    pushScheme({
      name:
        domain === 'fire'
          ? 'Forest Fire Prevention & Management Scheme (FFPMS) — Forest Ranges'
          : `National Mission for a Green India (GIM) & CAMPA Funds (${DOMAIN_LABELS[domain]})`,
      department: 'Ministry of Environment, Forest and Climate Change (MoEFCC)',
      benefits:
        domain === 'fire'
          ? 'Range fireline clearance, watchtowers, and FSI alert response infrastructure.'
          : `Compartment restoration, SMC trenches, and native planting for ${DOMAIN_LABELS[domain]}.`,
      eligibility: 'State Forest Departments & Joint Forest Management Committees',
      assistanceAmount: 'Approved Annual Plan of Operations (APO) norms',
      requiredDocuments: ['Working Plan / APO Extract', 'Compartment Coordinates', 'Committee Resolution'],
      applicationDates: 'Annual APO cycle',
      officialUrl: domain === 'fire' ? 'https://fsi.nic.in/' : 'https://moef.gov.in/',
      lastVerifiedDate: '2026-11-15',
      regionScope: 'All India',
    });
  } else if (roleKey === 'urban') {
    if (domain === 'water' || domain === 'soil') {
      pushScheme({
        name: 'AMRUT 2.0 — Urban Waterbody Rejuvenation & Sponge-City Recharge',
        department: 'Ministry of Housing and Urban Affairs (MoHUA)',
        benefits:
          domain === 'soil'
            ? 'Urban bioswales, rain-gardens, and city-compost park soil remediation.'
            : 'Municipal lake rejuvenation, permeable drains, and urban aquifer recharge.',
        eligibility: 'Urban Local Bodies (ULBs) & Municipal Corporations',
        assistanceAmount: 'Approved State Water Action Plan (SWAP) allocation',
        requiredDocuments: ['City Action Plan', 'ULB Council Resolution', 'Ward DPR'],
        applicationDates: 'Municipal mission cycle',
        officialUrl: 'https://amrut.mohua.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    } else {
      pushScheme({
        name:
          domain === 'fire'
            ? 'NDMA Urban-Forest Fire Preparedness & Municipal Safety Grant'
            : 'NDMA Heatwave Action Plan & Nagar Van Yojana',
        department: 'NDMA / MoEFCC',
        benefits: `Municipal grants strictly addressing ${DOMAIN_LABELS[domain]}.`,
        eligibility: 'Municipalities, Smart City SPVs & District Administrations',
        assistanceAmount: 'Verify current municipal grant guidelines on official portals',
        requiredDocuments: ['Municipal Ward Hazard/LST Map', 'ULB Action Proposal'],
        applicationDates: 'Pre-summer & Annual cycles',
        officialUrl: 'https://ndma.gov.in/',
        lastVerifiedDate: '2026-11-15',
        regionScope: 'All India',
      });
    }
  } else {
    // Disaster & Wildfire Response Coordinator
    pushScheme({
      name:
        domain === 'fire'
          ? 'Forest Fire Prevention & Management Scheme (FFPMS) & SDMF'
          : `NDMA / State Disaster Mitigation Fund (SDMF) — ${DOMAIN_LABELS[domain]}`,
      department: 'National / State Disaster Management Authority',
      benefits: `Emergency mitigation & early-warning funding strictly for ${DOMAIN_LABELS[domain]}.`,
      eligibility: 'District Disaster Management Authorities (DDMAs) & Responders',
      assistanceAmount: 'Per 15th FC SDMF mitigation guidelines',
      requiredDocuments: ['DDMA Mitigation Proposal', 'District Hazard Coordinates'],
      applicationDates: 'Ongoing institutional window',
      officialUrl: domain === 'fire' ? 'https://fsi.nic.in/' : 'https://ndma.gov.in/',
      lastVerifiedDate: '2026-11-15',
      regionScope: 'All India',
    });
  }

  // ---------------------------------------------------------------------------
  // 2. STRICTLY SCOPED PRODUCT MARKETPLACE (Role × Domain ONLY)
  // ---------------------------------------------------------------------------
  if (roleKey === 'farmer' || roleKey === 'fpo' || roleKey === 'environmentalist') {
    if (domain === 'water') {
      pushPlatform({
        name: 'PMKSY Empanelled Micro-Irrigation Dealers Directory',
        sellerType: 'State-Empanelled Drip & Sprinkler Manufacturers',
        description: 'BIS-certified inline drip, sprinkler, filtration, and fertigation kits.',
        availabilityNote: 'Obtain live quotation directly from state-empanelled OEM dealers.',
        purchaseUrl: 'https://pmksy.mowr.gov.in/',
        specs: 'BIS IS:13488 / IS:12786 compliant emitters.',
      });
      pushPlatform({
        name: 'ONDC Network — Agricultural Irrigation & Water-Saving Kits',
        sellerType: 'Authorised ONDC Network Agri Sellers',
        description: 'Drip spare parts, moisture sensors, and rainwater filter barrels.',
        availabilityNote: 'Check real-time prices & PIN-code delivery directly on ONDC.',
        purchaseUrl: 'https://ondc.org/',
        specs: 'Open network verified water-conservation supplies.',
      });
    } else if (domain === 'soil') {
      pushPlatform({
        name: 'IFFCO eBazar — Authorised Soil Health, Bio-Compost & Micronutrient Store',
        sellerType: 'Cooperative Authorised Storefront',
        description: 'Soil organic carbon builders, vermicompost, green-manure seeds, and zinc/boron amendments.',
        availabilityNote: 'Check PIN-code stock & rates live on iffcobazar.in.',
        purchaseUrl: 'https://www.iffcobazar.in/',
        specs: 'Cooperative FCO-certified soil inputs.',
      });
      pushPlatform({
        name: 'ONDC Network — Portable Soil Testing Kits & Vetiver Erosion Slips',
        sellerType: 'Authorised ONDC Agri & Conservation Sellers',
        description: 'Field NPK/pH colorimetric soil test kits and bio-composting inoculants.',
        availabilityNote: 'Inspect live prices & seller ratings directly on ONDC buyer apps.',
        purchaseUrl: 'https://ondc.org/',
        specs: 'Field-ready soil health tools.',
      });
    } else if (domain === 'fire') {
      pushPlatform({
        name: 'SMAM / Farm Machinery Portal — Residue Shredders & Mulchers',
        sellerType: 'Authorised CRM Machinery Manufacturers',
        description: 'In-situ straw mulchers, shredders, and zero-burn residue tools.',
        availabilityNote: 'Verify subsidy-approved manufacturer pricing on agrimachinery.nic.in.',
        purchaseUrl: 'https://agrimachinery.nic.in/',
        specs: 'Government-empanelled residue management gear.',
      });
      pushPlatform({
        name: 'ONDC Network — Portable Fire-Watch Hand Tools & Biomass Decomposers',
        sellerType: 'Authorised ONDC Sellers',
        description: 'Boundary clearing tools, knapsacks, and microbial residue decomposers.',
        availabilityNote: 'Check live availability on ONDC.',
        purchaseUrl: 'https://ondc.org/',
        specs: 'Zero-burn prevention & boundary clearance gear.',
      });
    } else {
      pushPlatform({
        name: 'ONDC Network — Native Saplings, Tree Guards & Organic Mulch',
        sellerType: 'Authorised ONDC Nursery & Conservation Sellers',
        description: `Native shade saplings, bamboo guards, and moisture-retention mulch tailored for ${DOMAIN_LABELS[domain]}.`,
        availabilityNote: 'Verify live stock and rates directly on ONDC buyer portals.',
        purchaseUrl: 'https://ondc.org/',
        specs: 'Regional nursery and canopy/thermal protection supplies.',
      });
    }
  } else {
    // Institutional / Technical Roles -> GeM & Domain-Specific Catalogue ONLY
    const gemLabel =
      domain === 'water'
        ? roleKey === 'urban'
          ? 'GeM — Permeable Pavers, Stormwater Grates & Municipal Recharge Gear'
          : roleKey === 'researcher'
          ? 'GeM — Tipping-Bucket Rain Gauges, Piezometers & Hydro Telemetry'
          : 'GeM — Community Rain Gauges, Piezometers & Watershed Civil Materials'
        : domain === 'soil'
        ? roleKey === 'researcher'
          ? 'GeM — TDR Soil Moisture Probes, pH/EC Meters & Lab Augers'
          : 'GeM — Soil Testing Lab Kits, Bio-Compost & Slope Stabilization Geotextiles'
        : domain === 'fire'
        ? roleKey === 'researcher'
          ? 'GeM — IR Thermal Radiometers, Portable Anemometers & RH2M Loggers'
          : 'GeM — Wildfire Suppression Hand-Tools, Water Bladders & Weather Meters'
        : roleKey === 'urban'
        ? 'GeM — High-SRI Cool Roof Coatings & Urban Canopy Shading Gear'
        : 'GeM — PAR Canopy Radiometers, IR Thermometers & Field Dataloggers';

    pushPlatform({
      name: gemLabel,
      sellerType: 'Government e-Marketplace (GeM) Verified OEMs',
      description: `Official institutional procurement strictly tailored for ${userType} addressing ${DOMAIN_LABELS[domain]}.`,
      availabilityNote: 'All unit rates, SLA terms, and OEM stock are live on gem.gov.in only.',
      purchaseUrl: 'https://gem.gov.in/',
      specs: `BIS/ISO certified equipment scoped exclusively for ${DOMAIN_LABELS[domain]}.`,
    });

    if (roleKey === 'researcher') {
      pushPlatform({
        name:
          domain === 'water'
            ? 'IMD / ICAR Authorised Hydro-Met & Rain-Gauge Vendors'
            : domain === 'soil'
            ? 'ICAR-IISS / Authorised Soil Lab & TDR Sensor Suppliers'
            : 'IMD / NPL Authorised Thermal, Fire-Met & Canopy Radiometer Suppliers',
        sellerType: 'Scientific Calibration Suppliers',
        description: `WMO/ICAR-grade calibrated instruments strictly matching ${DOMAIN_LABELS[domain]} field validation.`,
        availabilityNote: 'Request formal institutional quotation with NIST/IMD/ICAR calibration certificate.',
        purchaseUrl: domain === 'soil' ? 'https://soilhealth.dac.gov.in/' : 'https://mausam.imd.gov.in/',
        specs: 'Research-grade +/- 2% sensor calibration.',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. STRICTLY SCOPED WATCH & LEARN VIDEOS (Role × Domain ONLY)
  // ---------------------------------------------------------------------------
  if (domain === 'water') {
    if (roleKey === 'farmer') {
      pushVideo({
        title: 'Drip Irrigation & Micro-Irrigation Field Layout (Official ICAR Extension)',
        publisher: 'ICAR / Ministry of Agriculture',
        language: 'English',
        topic: 'Water & Soil Moisture',
        url: 'https://www.youtube.com/results?search_query=ICAR+drip+irrigation+installation+guide',
        embedAllowed: false,
      });
      pushVideo({
        title: 'ಹನಿ ನೀರಾವರಿ (Drip Irrigation) & ಕೃಷಿ ಹೊಂಡ (Krishi Honda) ಮಾಹಿತಿ — Karnataka',
        publisher: 'Department of Agriculture Karnataka / UAS',
        language: 'Kannada',
        topic: 'Farm Water Conservation (Kannada)',
        url: 'https://www.youtube.com/results?search_query=karnataka+agriculture+drip+irrigation+krishi+honda+kannada',
        embedAllowed: false,
      });
    } else if (roleKey === 'urban') {
      pushVideo({
        title: 'Urban Stormwater Harvesting, Permeable Pavements & Municipal Recharge (NIUA)',
        publisher: 'NIUA / Ministry of Housing & Urban Affairs',
        language: 'English',
        topic: 'Urban Stormwater & Waterbody Rejuvenation',
        url: 'https://www.youtube.com/results?search_query=NIUA+AMRUT+urban+rainwater+harvesting+stormwater+recharge+india',
        embedAllowed: false,
      });
    } else if (roleKey === 'researcher') {
      pushVideo({
        title: 'Validating NASA POWER Precipitation & SMAP Soil Wetness With Rain Gauges',
        publisher: 'NASA ARSET Earth Observation Training',
        language: 'English',
        topic: 'Hydrological Satellite Validation',
        url: 'https://www.youtube.com/results?search_query=NASA+ARSET+validation+soil+moisture+precipitation',
        embedAllowed: false,
      });
    } else {
      pushVideo({
        title: `${userType}: Community Watershed, Wetland & Atal Bhujal Conservation Guide`,
        publisher: 'Ministry of Jal Shakti / NIRDPR',
        language: 'English',
        topic: 'Watershed & Wetland Restoration',
        url: 'https://www.youtube.com/results?search_query=atal+bhujal+yojana+community+water+security+plan',
        embedAllowed: false,
      });
      pushVideo({
        title: 'ಗ್ರಾಮ ಪಂಚಾಯಿತಿ ಜಲ ಸಂರಕ್ಷಣೆ & ಅಂತರ್ಜಲ ಮರುಪೂರಣ (Kannada Guide)',
        publisher: 'RDPR Karnataka Extension',
        language: 'Kannada',
        topic: 'Community Water Budgeting (Kannada)',
        url: 'https://www.youtube.com/results?search_query=karnataka+gram+panchayat+watershed+conservation+kannada',
        embedAllowed: false,
      });
    }
  } else if (domain === 'soil') {
    pushVideo({
      title: `Soil Health Card Sampling, Organic Carbon & Erosion Control (${userType})`,
      publisher: 'ICAR / Indian Institute of Soil Science',
      language: 'English',
      topic: 'Soil Health & Organic Carbon',
      url: 'https://www.youtube.com/results?search_query=ICAR+soil+health+card+sampling+organic+carbon+restoration',
      embedAllowed: false,
    });
    if (roleKey === 'farmer' || roleKey === 'environmentalist' || roleKey === 'panchayat' || roleKey === 'fpo') {
      pushVideo({
        title: 'ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಕಾರ್ಡ್ & ಸಾವಯವ ಇಂಗಾಲ ವೃದ್ಧಿ (Kannada Extension)',
        publisher: 'UAS Bengaluru / Karnataka Agriculture Dept.',
        language: 'Kannada',
        topic: 'Soil Health (Kannada)',
        url: 'https://www.youtube.com/results?search_query=soil+health+card+organic+compost+kannada+agriculture',
        embedAllowed: false,
      });
    }
  } else if (domain === 'fire') {
    pushVideo({
      title:
        roleKey === 'farmer'
          ? 'Zero-Burn Crop Residue Mulching & Bio-Decomposer Field Guide (ICAR)'
          : 'Forest Fireline Preparation & NASA FIRMS / FSI Alert Verification',
      publisher: roleKey === 'farmer' ? 'ICAR / Ministry of Agriculture' : 'Forest Survey of India / NDMA',
      language: 'English',
      topic: 'Wildfire Prevention & FIRMS Alerts',
      url:
        roleKey === 'farmer'
          ? 'https://www.youtube.com/results?search_query=ICAR+crop+residue+management+mulching+no+burning'
          : 'https://www.youtube.com/results?search_query=forest+survey+of+india+forest+fire+alert+management+training',
      embedAllowed: false,
    });
  } else if (domain === 'heat') {
    pushVideo({
      title:
        roleKey === 'urban'
          ? 'Urban Heat Island Mitigation: Cool Roofs & Shaded Canopy (NDMA / NIUA)'
          : 'Heat Stress Protection: Soil Mulching & Agroforestry Canopy Buffers',
      publisher: roleKey === 'urban' ? 'NDMA / NIUA' : 'ICAR / NASA ARSET',
      language: 'English',
      topic: 'Heat & Surface Thermal Mitigation',
      url:
        roleKey === 'urban'
          ? 'https://www.youtube.com/results?search_query=NDMA+NIUA+urban+heat+action+plan+cool+roof+india'
          : 'https://www.youtube.com/results?search_query=agroforestry+mulching+heat+stress+mitigation+india',
      embedAllowed: false,
    });
  } else {
    pushVideo({
      title: 'Native Canopy Restoration & MODIS 250m NDVI Monitoring Guide',
      publisher: 'MoEFCC / NASA ARSET Training',
      language: 'English',
      topic: 'Vegetation & Forest Canopy',
      url: 'https://www.youtube.com/results?search_query=native+forest+restoration+MODIS+NDVI+monitoring',
      embedAllowed: false,
    });
  }

  return { schemes, productPlatforms, videos };
}

function buildRoleOnlineGuidance(userType: string, domain: EnvDomain, schemes: any[], isKarnataka: boolean) {
  const roleKey = classifyRoleKey(userType);
  const primaryPortal = schemes[0]?.officialUrl ?? 'https://www.myscheme.gov.in/';
  const primaryName = schemes[0]?.name ?? 'Official Government Portal';
  const domainLabel = DOMAIN_LABELS[domain];

  if (roleKey === 'farmer') {
    return {
      heading: `Farmer Online Application Workflow (${domainLabel} Scope Only)`,
      steps: [
        {
          title: 'Register / Verify Farmer ID',
          detail: isKarnataka
            ? 'Verify your FRUITS Farmer ID (FID) directly on fruits.karnataka.gov.in.'
            : 'Check farmer registration eligibility on MyScheme or your State Agriculture Portal.',
          url: isKarnataka ? 'https://fruits.karnataka.gov.in/' : 'https://www.myscheme.gov.in/',
          urlLabel: isKarnataka ? 'FRUITS Portal' : 'MyScheme Portal',
        },
        {
          title: `Prepare ${domainLabel} Document Scans`,
          detail:
            domain === 'soil'
              ? 'Upload Land RTC/Pahani, Soil Health Card sample details, and bank passbook.'
              : 'Upload clean copies of Land RTC/Pahani, DBT-seeded bank passbook, and empanelled vendor quotation.',
        },
        {
          title: `Submit ${domainLabel} Application`,
          detail: `Log in on ${primaryName} using your official citizen credentials (never share OTPs externally).`,
          url: primaryPortal,
          urlLabel: 'Open Scheme Portal',
        },
      ],
    };
  }

  if (roleKey === 'environmentalist') {
    return {
      heading: `Conservation & Citizen Action Portal Workflow (${domainLabel})`,
      steps: [
        {
          title: 'Package Verified Satellite Evidence',
          detail: `Export TERRA SLEUTH coordinates and ${domainLabel} statistical summary from Scientific Reports.`,
        },
        {
          title: `Register Conservation Action on Official Portal`,
          detail: `Submit site details and species/restoration plan via ${primaryName}.`,
          url: primaryPortal,
          urlLabel: 'Open Conservation Portal',
        },
        {
          title: 'Coordinate Verified Citizen Monitoring & Supplies',
          detail: 'Source test kits or native nursery saplings strictly from verified ONDC/State Nursery channels.',
          url: 'https://ondc.org/',
          urlLabel: 'ONDC Network',
        },
      ],
    };
  }

  return {
    heading: `${userType} Official Portal & Procurement Workflow (${domainLabel})`,
    steps: [
      {
        title: 'Verify Institutional Mandate & DPR Coordinates',
        detail: `Export verified coordinates and NASA ${domainLabel} evidence summary from TERRA SLEUTH Reports.`,
      },
      {
        title: `Submit ${domainLabel} Grant / Action Plan on Official Portal`,
        detail: `Submit under ${primaryName} using authorised institutional/official credentials.`,
        url: primaryPortal,
        urlLabel: 'Official Portal',
      },
      {
        title: `Execute Transparent GeM Procurement (${domainLabel})`,
        detail: `Raise bid/BOQ strictly for ${domainLabel}-verified equipment on Government e-Marketplace (GeM).`,
        url: 'https://gem.gov.in/',
        urlLabel: 'GeM Portal',
      },
    ],
  };
}

function buildRoleOfflineGuidance(inv: any, userType: string, domain: EnvDomain) {
  const roleKey = classifyRoleKey(userType);
  const isKarnataka = (inv?.state || '').toLowerCase().includes('karnataka');
  const targetDistrict = [inv?.district, inv?.state, inv?.country].filter(Boolean).join(', ');
  const domainLabel = DOMAIN_LABELS[domain];

  if (roleKey === 'environmentalist') {
    return {
      targetDistrict,
      officeTypes: [
        domain === 'water'
          ? 'District Wetland Authority / Minor Irrigation & Lake Tank Office'
          : domain === 'soil'
          ? 'ICAR Krishi Vigyan Kendra (KVK) Soil Lab & Watershed Cell'
          : 'Divisional Forest Office (DFO) — Social Forestry & Nursery Wing',
        'District Collectorate — Environment & Public Grievance Cell',
        'Local Gram Panchayat / Ward Biodiversity Management Committee (BMC)',
      ],
      verificationPolicy: `Conservation offices filtered strictly for ${userType} (${domainLabel}).`,
      officialLookupLinks: [
        { label: 'MoEFCC Portal', url: 'https://moef.gov.in/' },
        { label: 'India National District Directory', url: 'https://igod.gov.in/' },
      ],
      visitChecklist: [
        `Carry TERRA SLEUTH ${domainLabel} PDF evidence and site GPS coordinates.`,
        'Request Biodiversity Management Committee (BMC) or Wetland authority endorsement.',
      ],
    };
  }

  if (roleKey === 'urban') {
    return {
      targetDistrict,
      officeTypes: [
        'Municipal Corporation / Town Planning & Engineering Cell',
        'District Urban Development Cell (DUDC)',
        domain === 'water' ? 'Municipal Water Supply & Stormwater Drainage Division' : 'State Disaster Management / Urban Heat Nodal Office',
      ],
      verificationPolicy: `Offline offices filtered strictly for ${userType} (${domainLabel}).`,
      officialLookupLinks: [
        { label: 'AMRUT 2.0 Municipal Portal', url: 'https://amrut.mohua.gov.in/' },
        { label: 'India National District Directory', url: 'https://igod.gov.in/' },
      ],
      visitChecklist: [
        `Carry Geo Intelligence ${domainLabel} hotspot coordinates for priority wards.`,
        'Confirm Municipal Schedule of Rates (SOR) for domain-specific civil/green works.',
      ],
    };
  }

  if (roleKey === 'wildfire' || roleKey === 'forestry') {
    return {
      targetDistrict,
      officeTypes: [
        'Divisional Forest Office (DFO) / Conservator of Forests',
        'Range Forest Office (RFO) — Local Beats & Fire Crews',
        roleKey === 'wildfire' ? 'District Disaster Management Authority (DDMA) Control Room' : 'Village Forest / Eco-Development Committee Office',
      ],
      verificationPolicy: `Offline offices filtered strictly for ${userType} (${domainLabel}).`,
      officialLookupLinks: [
        { label: 'Forest Survey of India (FSI)', url: 'https://fsi.nic.in/' },
        { label: 'NDMA / DDMA Directory', url: 'https://ndma.gov.in/' },
      ],
      visitChecklist: [
        `Carry compartment/beat GPS coordinates and ${domainLabel} hazard summary.`,
        'Confirm pre-season CAMPA / FFPMS fireline and nursery stock availability.',
      ],
    };
  }

  if (roleKey === 'researcher') {
    return {
      targetDistrict,
      officeTypes: [
        domain === 'soil'
          ? 'ICAR Krishi Vigyan Kendra (KVK) — Soil Testing & Agronomy Lab'
          : 'ICAR Krishi Vigyan Kendra (KVK) — Agro-Met & Calibration Lab',
        'State Agricultural University / Regional Research Station',
        domain === 'fire'
          ? 'Forest Survey / State Remote Sensing Application Centre'
          : 'District Groundwater / IMD Automatic Weather Station Office',
      ],
      verificationPolicy: `Research and lab calibration offices filtered strictly for ${userType} (${domainLabel}).`,
      officialLookupLinks: [
        { label: 'ICAR KVK Directory', url: 'https://kvk.icar.gov.in/' },
        { label: 'ANRF Research Portal', url: 'https://anrfonline.in/' },
      ],
      visitChecklist: [
        `Carry institutional ID and NASA POWER / MODIS coordinates for ${domainLabel}.`,
        'Coordinate co-located sensor/lab sampling dates with local KVK/IMD staff.',
      ],
    };
  }

  if (roleKey === 'panchayat' || roleKey === 'water_mgr' || roleKey === 'fpo') {
    return {
      targetDistrict,
      officeTypes: [
        'Gram Panchayat / Taluk Panchayat Executive Office',
        domain === 'soil'
          ? 'District Watershed & Soil Conservation Office'
          : 'District Watershed Development / Minor Irrigation Office',
        roleKey === 'fpo' ? 'NABARD / SFAC District Development Manager (DDM) Office' : 'District Groundwater / Atal Bhujal Nodal Unit',
      ],
      verificationPolicy: `Institutional offices filtered strictly for ${userType} (${domainLabel}).`,
      officialLookupLinks: [
        { label: 'Atal Bhujal / Jal Shakti Portal', url: 'https://ataljal.mowr.gov.in/' },
        { label: 'India District Directory', url: 'https://igod.gov.in/' },
      ],
      visitChecklist: [
        `Carry Gram Sabha / Cooperative resolution and ${domainLabel} Geo Intelligence coordinates.`,
        'Confirm Annual Action Plan sanction status and MGNREGS/WDC-PMKSY convergence.',
      ],
    };
  }

  // Farmer ONLY
  return {
    targetDistrict,
    officeTypes: [
      isKarnataka ? 'Raitha Samparka Kendra (RSK) — Hobli Level' : 'Block / Taluk Agriculture Extension Office',
      'Krishi Vigyan Kendra (KVK) — District Soil & Water Testing Lab',
      'Assistant Director of Agriculture / Horticulture Office',
    ],
    verificationPolicy: `Farmer extension offices filtered strictly for ${userType} (${domainLabel} focus).`,
    officialLookupLinks: isKarnataka
      ? [
          { label: 'Karnataka RSK / Raitamitra Directory', url: 'https://raitamitra.karnataka.gov.in/' },
          { label: 'ICAR KVK Portal', url: 'https://kvk.icar.gov.in/' },
        ]
      : [
          { label: 'ICAR KVK Portal', url: 'https://kvk.icar.gov.in/' },
          { label: 'India District Directory', url: 'https://igod.gov.in/' },
        ],
    visitChecklist: [
      'Carry original and 2 photocopies of RTC/Pahani and Farmer ID.',
      `Ask specifically about ${domainLabel} subsidy/lab support in your Hobli.`,
      'Collect written acknowledgement receipt for any application submitted.',
    ],
  };
}

function buildRoleChecklist(userType: string, domain: EnvDomain, isKarnataka: boolean) {
  const roleKey = classifyRoleKey(userType);
  const tag = (item: any) => ({ ...item, targetRoleKey: roleKey, targetDomain: domain });

  if (roleKey === 'environmentalist') {
    return [
      tag({
        id: `doc_env_1_${domain}`,
        label: `TERRA SLEUTH ${DOMAIN_LABELS[domain]} Evidence Summary & GPS Coordinates`,
        required: true,
        prepared: false,
        portalUrl: 'https://moef.gov.in/',
      }),
      tag({
        id: `doc_env_2_${domain}`,
        label: 'NGO Darpan / Volunteer Group / BMC Endorsement Letter',
        required: true,
        prepared: false,
        portalUrl: domain === 'water' ? 'https://indianwetlands.in/' : 'https://www.moefcc-gcp.in/',
      }),
      tag({
        id: `doc_env_3_${domain}`,
        label:
          domain === 'soil'
            ? 'Baseline Soil Sample / Erosion Photo Log'
            : domain === 'fire'
            ? 'FIRMS Hotspot Log & Local Fire-Control Contact Sheet'
            : 'Site Ownership / Commons Permission Clearance',
        required: false,
        prepared: false,
        portalUrl: 'https://ondc.org/',
      }),
    ];
  }

  if (roleKey === 'urban') {
    return [
      tag({ id: 'doc_u1', label: 'Municipal Council / ULB Ward Action Approval Resolution', required: true, prepared: false, portalUrl: 'https://amrut.mohua.gov.in/' }),
      tag({ id: 'doc_u2', label: `Ward ${DOMAIN_LABELS[domain]} Hotspot GIS Coordinates (from TERRA SLEUTH)`, required: true, prepared: false, portalUrl: 'https://ndma.gov.in/' }),
      tag({ id: 'doc_u3', label: 'GeM Specification & Schedule of Rates (SOR) Cost Estimate', required: true, prepared: false, portalUrl: 'https://gem.gov.in/' }),
    ];
  }

  if (roleKey === 'wildfire' || roleKey === 'forestry') {
    return [
      tag({ id: 'doc_f1', label: 'Approved Forest Working Plan / Annual Plan of Operations (APO) Extract', required: true, prepared: false, portalUrl: 'https://moef.gov.in/' }),
      tag({ id: 'doc_f2', label: `Beat/Compartment Boundary Coordinates (${DOMAIN_LABELS[domain]})`, required: true, prepared: false, portalUrl: 'https://fsi.nic.in/' }),
      tag({ id: 'doc_f3', label: 'GeM Equipment / Nursery Seedling Procurement Indent', required: false, prepared: false, portalUrl: 'https://gem.gov.in/' }),
    ];
  }

  if (roleKey === 'researcher') {
    return [
      tag({ id: 'doc_r1', label: `Institutional Endorsement & ${DOMAIN_LABELS[domain]} Research Protocol`, required: true, prepared: false, portalUrl: 'https://anrfonline.in/' }),
      tag({ id: 'doc_r2', label: 'NGO Darpan ID / University Registration Certificate', required: true, prepared: false, portalUrl: 'https://moef.gov.in/' }),
      tag({ id: 'doc_r3', label: `Calibrated Sensor / Lab Assay Sampling Design (${DOMAIN_LABELS[domain]})`, required: true, prepared: false, portalUrl: 'https://gem.gov.in/' }),
      tag({ id: 'doc_r4', label: 'Local Landowner / Forest Field Access Permission Letter', required: false, prepared: false, portalUrl: 'https://kvk.icar.gov.in/' }),
    ];
  }

  if (roleKey === 'panchayat' || roleKey === 'water_mgr' || roleKey === 'fpo') {
    return [
      tag({ id: 'doc_c1', label: roleKey === 'fpo' ? 'FPO Registration Certificate & Board Resolution' : 'Gram Sabha / Watershed Committee Approval Resolution', required: true, prepared: false, portalUrl: 'https://ataljal.mowr.gov.in/' }),
      tag({ id: 'doc_c2', label: `${DOMAIN_LABELS[domain]} Technical Estimate & DPR`, required: true, prepared: false, portalUrl: 'https://wdcpmksy.dolr.gov.in/' }),
      tag({ id: 'doc_c3', label: 'GeM Authorised Vendor Comparative Quotation', required: true, prepared: false, portalUrl: 'https://gem.gov.in/' }),
      tag({ id: 'doc_c4', label: 'Institutional Bank Mandate / PFMS Registration Details', required: true, prepared: false, portalUrl: 'https://ataljal.mowr.gov.in/' }),
    ];
  }

  // Farmer ONLY
  return [
    tag({ id: 'doc_1', label: 'Land Ownership Record (RTC / Pahani / Khata extract)', required: true, prepared: false, portalUrl: isKarnataka ? 'https://landrecords.karnataka.gov.in/' : 'https://www.myscheme.gov.in/' }),
    tag({ id: 'doc_2', label: isKarnataka ? 'Farmer Registration ID (FRUITS FID)' : 'Farmer Registration / AgriStack ID', required: true, prepared: false, portalUrl: isKarnataka ? 'https://fruits.karnataka.gov.in/' : 'https://www.myscheme.gov.in/' }),
    tag({ id: 'doc_3', label: 'DBT-Enabled Bank Passbook Copy', required: true, prepared: false, portalUrl: 'https://www.myscheme.gov.in/' }),
    tag({
      id: 'doc_4',
      label:
        domain === 'water'
          ? 'Empanelled Drip / Farm-Pond Technical Quotation'
          : domain === 'soil'
          ? 'KVK Soil Health Card & Composite Sample Receipt'
          : domain === 'fire'
          ? 'SMAM Crop-Residue Mulcher / Decomposer Slip'
          : 'Authorised Nursery / Agroforestry Sapling Slip',
      required: false,
      prepared: false,
      portalUrl:
        domain === 'water'
          ? 'https://pmksy.mowr.gov.in/'
          : domain === 'soil'
          ? 'https://soilhealth.dac.gov.in/'
          : 'https://ondc.org/',
    }),
  ];
}

function buildRoleTracker(inv: any, judgeOut: any, userType: string, domain: EnvDomain, domainLabel: string) {
  const roleKey = classifyRoleKey(userType);
  const verdict = judgeOut?.verdict ?? inv.verdict ?? 'Completed';

  const roleLabels: Record<string, string[]> = {
    farmer: [
      `Problem identified (${domainLabel})`,
      `Farm-scale ${domainLabel} solution selected`,
      'Verified equipment / soil inputs / saplings sourced',
      'Official farmer scheme eligibility checked',
      'RTC, Farmer ID & bank docs prepared',
      'Application submitted on official portal',
      'Department sanction received',
      'Materials / inputs procured',
      'On-farm implementation completed',
      `Satellite ${domainLabel} monitoring started`,
    ],
    environmentalist: [
      `Ecological hotspot identified (${domainLabel})`,
      `Conservation action selected (${domainLabel})`,
      'Citizen-science / native nursery supplies identified',
      'MoEFCC / NPCA / Green Credit eligibility verified',
      'Evidence packet & BMC/NGO permissions prepared',
      'Conservation petition / proposal submitted',
      'Local commons access approved',
      'Volunteer mobilization & materials ready',
      'Field restoration / watch activity completed',
      `Long-term ${domainLabel} outcome monitoring active`,
    ],
    researcher: [
      `Hypothesis & gap identified (${domainLabel})`,
      'Ground-truth study design selected',
      `Calibrated ${domainLabel} sensor / lab spec finalized`,
      'Grant eligibility (ANRF/DST/ICAR/MoEFCC) verified',
      'Protocol & institutional approvals prepared',
      'Proposal / site access submitted',
      'Funding & site access approved',
      'Telemetry equipment procured via GeM',
      'Field sensor / sampling campaign deployed',
      'NASA POWER / MODIS co-location monitoring active',
    ],
    urban: [
      `Ward hotspot identified (${domainLabel})`,
      'Municipal intervention selected',
      `GeM ${domainLabel} BOQ prepared`,
      'AMRUT / NDMA scheme alignment verified',
      'Council resolution & DPR prepared',
      'State mission approval submitted',
      'Work order sanctioned',
      'Materials procured via GeM',
      'Ward civil / greening works completed',
      `Satellite ${domainLabel} monitoring started`,
    ],
    wildfire: [
      `High-risk corridor identified (${domainLabel})`,
      'Preparedness / early-warning plan selected',
      'GeM response tools & telemetry specified',
      'FFPMS / SDMF eligibility verified',
      'DDMA & Range APO documents prepared',
      'Mitigation indent submitted',
      'Sanction & crew deployment approved',
      'Equipment & response points positioned',
      'Pre-season preventive works cleared',
      `Daily FIRMS / ${domainLabel} monitoring active`,
    ],
  };

  const titles = roleLabels[roleKey] ?? [
    `Regional issue identified (${domainLabel})`,
    `${userType} intervention selected (${domainLabel})`,
    'Verified GeM / ONDC supplies identified',
    'Official scheme eligibility checked',
    'Institutional documents & resolutions prepared',
    'Portal application / APO submitted',
    'Sanction & budget released',
    'Equipment / materials procured',
    'Field implementation completed',
    `Satellite ${domainLabel} Outcome Monitoring started`,
  ];

  return titles.map((title, idx) => ({
    step: idx + 1,
    title,
    targetRoleKey: roleKey,
    targetDomain: domain,
    status: idx === 0 ? 'verified_by_system' : 'pending',
    updatedAt: idx === 0 ? inv.created_at : null,
    note: idx === 0 ? `Investigation verdict: ${verdict} · Scoped for ${userType} (${domainLabel})` : '',
  }));
}

export async function getOrBuildSolutionWorkspace(
  investigationId: string,
  userType?: string,
  budgetInr = 50000,
  forceRefreshDiscovery = false,
  recalculate = false,
  domainOverride?: string
) {
  const inv = getInvestigationById(investigationId);
  if (!inv) throw new Error('Investigation not found');

  const { outputs } = extractAgentOutputs(investigationId);
  const judgeOut = outputs.earth_judge;
  const existing = getSolutionPlan(investigationId) as any;

  const relevantRoles = resolveRelevantRolesForInvestigation(inv);
  const requestedRole = userType && userType.trim() ? userType.trim() : existing?.user_type;
  const effectiveRole =
    requestedRole && relevantRoles.includes(requestedRole) ? requestedRole : relevantRoles[0];
  const effectiveBudget = Number.isFinite(budgetInr) && budgetInr > 0 ? budgetInr : existing?.budget_inr || 50000;
  const { domain, label: domainLabel } = resolveInvestigationDomain(inv, domainOverride);
  const isKarnataka = (inv.state || '').toLowerCase().includes('karnataka');

  const roleChanged = Boolean(existing && existing.user_type && existing.user_type !== effectiveRole);
  const shouldRebuild = recalculate || roleChanged || Boolean(domainOverride) || !existing;

  const solutions = buildRankedSolutions(inv, judgeOut, effectiveRole, effectiveBudget, domain);
  const portals = getVerifiedOfficialPortals(inv.state, inv.country, effectiveRole, domain);
  const onlineGuidance = buildRoleOnlineGuidance(effectiveRole, domain, portals.schemes, isKarnataka);
  const offlineGuidance = buildRoleOfflineGuidance(inv, effectiveRole, domain);

  let discovery = existing?.discovery_json ? JSON.parse(existing.discovery_json) : null;
  if (!discovery || forceRefreshDiscovery || shouldRebuild) {
    discovery = await discoverSolutionResourcesWithSearch({
      question: inv.research_question,
      category: inv.category,
      domain: domainLabel,
      country: inv.country,
      state: inv.state,
      district: inv.district,
      userType: effectiveRole,
      budgetInr: effectiveBudget,
      verdict: judgeOut?.verdict ?? inv.verdict ?? 'MONITOR',
    });
  }

  const defaultChecklist = buildRoleChecklist(effectiveRole, domain, isKarnataka);
  const defaultTracker = buildRoleTracker(inv, judgeOut, effectiveRole, domain, domainLabel);

  const checklist =
    !shouldRebuild && existing?.checklist_json ? JSON.parse(existing.checklist_json) : defaultChecklist;
  const tracker =
    !shouldRebuild && existing?.tracker_json ? JSON.parse(existing.tracker_json) : defaultTracker;

  const selectedSolutionId =
    !shouldRebuild && existing?.selected_solution_id && solutions.some((s) => s.id === existing.selected_solution_id)
      ? existing.selected_solution_id
      : solutions[0]?.id ?? null;

  upsertSolutionPlan(investigationId, {
    user_type: effectiveRole,
    budget_inr: effectiveBudget,
    selected_solution_id: selectedSolutionId,
    solutions_json: JSON.stringify(solutions),
    discovery_json: JSON.stringify(discovery),
    checklist_json: JSON.stringify(checklist),
    tracker_json: JSON.stringify(tracker),
  });

  const outcomeFocusVars =
    domain === 'water'
      ? ['PRECTOTCORR', 'GWETTOP', 'GWETROOT']
      : domain === 'soil'
      ? ['GWETTOP', 'GWETROOT', 'NDVI']
      : domain === 'heat'
      ? ['TS', 'T2M', 'NDVI']
      : domain === 'fire'
      ? ['TS', 'RH2M', 'NDVI']
      : ['NDVI', 'GWETTOP', 'TS'];

  return {
    investigation: inv,
    userType: effectiveRole,
    roleKey: classifyRoleKey(effectiveRole),
    budgetInr: effectiveBudget,
    domain,
    domainLabel,
    availableRoles: relevantRoles,
    availableDomains: DOMAIN_OPTIONS,
    selectedSolutionId,
    solutions,
    portals,
    onlineGuidance,
    discovery,
    checklist,
    tracker,
    outcomeConfig: {
      focusVariables: outcomeFocusVars,
      roleMonitoringNote: `Filtered strictly for ${effectiveRole} (${domainLabel} indicators only).`,
    },
    outcomeNotes: existing?.outcome_notes ?? '',
    offlineGuidance,
  };
}

export async function compareBeforeAfterOutcome(
  investigationId: string,
  interventionDate: string,
  domainOverride?: string
) {
  const inv = getInvestigationById(investigationId);
  if (!inv) throw new Error('Investigation not found');

  const { domain } = resolveInvestigationDomain(inv, domainOverride);
  const powerVars =
    domain === 'heat'
      ? ['TS', 'T2M']
      : domain === 'fire'
      ? ['TS', 'RH2M', 'GWETTOP']
      : domain === 'soil'
      ? ['GWETTOP', 'GWETROOT', 'PRECTOTCORR']
      : domain === 'vegetation'
      ? ['GWETTOP', 'PRECTOTCORR', 'TS']
      : ['PRECTOTCORR', 'GWETTOP', 'GWETROOT'];

  const today = new Date().toISOString().slice(0, 10);
  const startPre = inv.start_date;
  const [powerSeries, modisSeries] = await Promise.all([
    fetchNasaPowerSeries(inv.latitude, inv.longitude, startPre, today, powerVars),
    fetchModisNdviSeries(inv.latitude, inv.longitude, startPre, today),
  ]);

  const comparisons: any[] = [];
  if (powerSeries.available) {
    for (const [varCode, s] of Object.entries(powerSeries.series)) {
      const beforeVals: number[] = [];
      const afterVals: number[] = [];
      powerSeries.dates.forEach((d, idx) => {
        const val = s.values[idx];
        if (val === null || val === undefined) return;
        if (d < interventionDate) beforeVals.push(val);
        else afterVals.push(val);
      });
      const avg = (arr: number[]) =>
        arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 1000 : null;
      const bAvg = avg(beforeVals);
      const aAvg = avg(afterVals);
      comparisons.push({
        variable: varCode,
        label: s.label,
        unit: s.unit,
        source: powerSeries.source,
        freshness: powerSeries.freshnessStatus,
        beforeCount: beforeVals.length,
        afterCount: afterVals.length,
        beforeMean: bAvg,
        afterMean: aAvg,
        delta: bAvg !== null && aAvg !== null ? Math.round((aAvg - bAvg) * 1000) / 1000 : null,
      });
    }
  }

  if (modisSeries.available) {
    const beforeVals: number[] = [];
    const afterVals: number[] = [];
    modisSeries.dates.forEach((d: string, idx: number) => {
      const val = modisSeries.values[idx];
      if (val === null || val === undefined) return;
      if (d < interventionDate) beforeVals.push(val);
      else afterVals.push(val);
    });
    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10000) / 10000 : null;
    const bAvg = avg(beforeVals);
    const aAvg = avg(afterVals);
    comparisons.push({
      variable: 'NDVI',
      label: 'MODIS 250m Vegetation Index',
      unit: 'NDVI',
      source: modisSeries.source,
      freshness: modisSeries.freshnessStatus,
      beforeCount: beforeVals.length,
      afterCount: afterVals.length,
      beforeMean: bAvg,
      afterMean: aAvg,
      delta: bAvg !== null && aAvg !== null ? Math.round((aAvg - bAvg) * 10000) / 10000 : null,
    });
  }

  return {
    interventionDate,
    domain,
    retrievedAt: new Date().toISOString(),
    comparisons,
    scientificCaveat:
      'Observed before-vs-after differences reflect regional satellite/reanalysis conditions (0.5° grid for POWER, 250 m for MODIS). ' +
      'Changes cannot be automatically attributed solely to a single local intervention; seasonal rainfall variation, ENSO cycles, and surrounding land-use changes may also contribute.',
  };
}
