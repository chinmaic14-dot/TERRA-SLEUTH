export type PageId =
  | 'home'
  | 'live-earth'
  | 'workspace'
  | 'data-scout'
  | 'trend-detective'
  | 'geo-intelligence'
  | 'relationship-analyst'
  | 'cause-investigator'
  | 'science-challenger'
  | 'impact-analyst'
  | 'earth-judge'
  | 'solution-centre'
  | 'scientific-reports';

export interface NavItem {
  id: PageId;
  label: string;
  section: 'core' | 'agents' | 'action';
}

// EXACT NON-NEGOTIABLE NAVIGATION ORDER:
// Solution Centre MUST be second-last; Scientific Reports MUST be last.
export const NAVIGATION_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', section: 'core' },
  { id: 'live-earth', label: 'Live Earth Monitor', section: 'core' },
  { id: 'workspace', label: 'Investigation Workspace', section: 'core' },
  { id: 'data-scout', label: 'Data Scout', section: 'agents' },
  { id: 'trend-detective', label: 'Trend Detective', section: 'agents' },
  { id: 'geo-intelligence', label: 'Geo Intelligence', section: 'agents' },
  { id: 'relationship-analyst', label: 'Relationship Analyst', section: 'agents' },
  { id: 'cause-investigator', label: 'Cause Investigator', section: 'agents' },
  { id: 'science-challenger', label: 'Science Challenger', section: 'agents' },
  { id: 'impact-analyst', label: 'Impact Analyst', section: 'agents' },
  { id: 'earth-judge', label: 'Earth Judge', section: 'agents' },
  { id: 'solution-centre', label: 'Solution Centre', section: 'action' },
  { id: 'scientific-reports', label: 'Scientific Reports', section: 'action' },
];

export interface InvestigationSummary {
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
  verdict: 'HIGH CONCERN' | 'MONITOR' | 'IMPROVING' | 'INSUFFICIENT EVIDENCE' | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentRunSummary {
  id: string;
  investigation_id: string;
  agent_key: string;
  agent_name: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  findings_count: number;
  error_message: string | null;
}

export interface FullInvestigationBundle {
  investigation: InvestigationSummary;
  agentRuns: AgentRunSummary[];
  outputs: Record<string, any>;
}
