import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {
  AGENT_SEQUENCE,
  type AgentKey,
  type AgentRunRecord,
  type AgentStatus,
  type InvestigationRecord,
  type VerdictType,
} from './types.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'terra_sleuth.sqlite');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS investigations (
    id TEXT PRIMARY KEY,
    research_question TEXT NOT NULL,
    category TEXT NOT NULL,
    country TEXT NOT NULL,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    region_name TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    elevation_m REAL,
    comparison_region_name TEXT,
    comparison_lat REAL,
    comparison_lon REAL,
    comparison_elevation_m REAL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    variables_json TEXT NOT NULL,
    status TEXT NOT NULL,
    progress_pct INTEGER NOT NULL DEFAULT 0,
    current_agent TEXT,
    verdict TEXT,
    summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL,
    agent_key TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    findings_count INTEGER NOT NULL DEFAULT 0,
    output_json TEXT,
    error_message TEXT,
    FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS solution_plans (
    id TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL UNIQUE,
    user_type TEXT NOT NULL DEFAULT 'Farmer / Land Steward',
    budget_inr INTEGER NOT NULL DEFAULT 50000,
    selected_solution_id TEXT,
    solutions_json TEXT,
    discovery_json TEXT,
    checklist_json TEXT,
    tracker_json TEXT,
    outcome_notes TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS api_cache (
    cache_key TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    ttl_seconds INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS translations_cache (
    lang_code TEXT NOT NULL,
    source_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (lang_code, source_text)
  );
`);

export function getCachedTranslations(langCode: string, texts: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (!langCode || langCode === 'en' || texts.length === 0) return result;
  const stmt = db.prepare(
    'SELECT translated_text FROM translations_cache WHERE lang_code = ? AND source_text = ?'
  );
  for (const t of texts) {
    const row = stmt.get(langCode, t) as { translated_text: string } | undefined;
    if (row?.translated_text) {
      result[t] = row.translated_text;
    }
  }
  return result;
}

export function saveCachedTranslations(langCode: string, pairs: Record<string, string>): void {
  if (!langCode || langCode === 'en') return;
  const entries = Object.entries(pairs).filter(([k, v]) => k && v);
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO translations_cache (lang_code, source_text, translated_text, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(lang_code, source_text) DO UPDATE SET
      translated_text = excluded.translated_text,
      updated_at = excluded.updated_at
  `);
  for (const [src, tr] of entries) {
    stmt.run(langCode, src, tr, now);
  }
}

export function getCached<T>(key: string): { payload: T; fetchedAt: string } | null {
  const row = db
    .prepare('SELECT payload_json, fetched_at, ttl_seconds FROM api_cache WHERE cache_key = ?')
    .get(key) as { payload_json: string; fetched_at: string; ttl_seconds: number } | undefined;
  if (!row) return null;
  const ageSec = (Date.now() - Date.parse(row.fetched_at)) / 1000;
  if (ageSec > row.ttl_seconds) return null;
  try {
    return { payload: JSON.parse(row.payload_json) as T, fetchedAt: row.fetched_at };
  } catch {
    return null;
  }
}

export function setCached(key: string, payload: unknown, ttlSeconds = 1800): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO api_cache (cache_key, payload_json, fetched_at, ttl_seconds)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      payload_json = excluded.payload_json,
      fetched_at = excluded.fetched_at,
      ttl_seconds = excluded.ttl_seconds
  `).run(key, JSON.stringify(payload), now, ttlSeconds);
}

export function createInvestigationRecord(inv: Omit<InvestigationRecord, 'created_at' | 'updated_at'>): InvestigationRecord {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO investigations (
      id, research_question, category, country, state, district, region_name,
      latitude, longitude, elevation_m,
      comparison_region_name, comparison_lat, comparison_lon, comparison_elevation_m,
      start_date, end_date, variables_json,
      status, progress_pct, current_agent, verdict, summary, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    inv.id,
    inv.research_question,
    inv.category,
    inv.country,
    inv.state,
    inv.district,
    inv.region_name,
    inv.latitude,
    inv.longitude,
    inv.elevation_m,
    inv.comparison_region_name,
    inv.comparison_lat,
    inv.comparison_lon,
    inv.comparison_elevation_m,
    inv.start_date,
    inv.end_date,
    inv.variables_json,
    inv.status,
    inv.progress_pct,
    inv.current_agent,
    inv.verdict,
    inv.summary,
    now,
    now
  );

  const insertRun = db.prepare(`
    INSERT INTO agent_runs (id, investigation_id, agent_key, agent_name, status, findings_count)
    VALUES (?, ?, ?, ?, 'pending', 0)
  `);
  for (const agent of AGENT_SEQUENCE) {
    insertRun.run(`${inv.id}_${agent.key}`, inv.id, agent.key, agent.name);
  }

  return getInvestigationById(inv.id)!;
}

export function updateInvestigationStatus(
  id: string,
  fields: Partial<{
    status: 'running' | 'completed' | 'cancelled' | 'error';
    progress_pct: number;
    current_agent: string | null;
    verdict: VerdictType | null;
    summary: string | null;
    elevation_m: number | null;
    comparison_elevation_m: number | null;
  }>
): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
  db.prepare(`UPDATE investigations SET ${sets}, updated_at = ? WHERE id = ?`).run(
    ...(values as (string | number | null)[]),
    new Date().toISOString(),
    id
  );
}

export function updateAgentRun(
  investigationId: string,
  agentKey: AgentKey,
  fields: Partial<{
    status: AgentStatus;
    started_at: string | null;
    completed_at: string | null;
    findings_count: number;
    output_json: string | null;
    error_message: string | null;
  }>
): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
  db.prepare(`UPDATE agent_runs SET ${sets} WHERE investigation_id = ? AND agent_key = ?`).run(
    ...(values as (string | number | null)[]),
    investigationId,
    agentKey
  );
}

export function getInvestigationById(id: string): InvestigationRecord | null {
  const row = db.prepare('SELECT * FROM investigations WHERE id = ?').get(id) as InvestigationRecord | undefined;
  return row ?? null;
}

export function listInvestigations(): InvestigationRecord[] {
  return db.prepare('SELECT * FROM investigations ORDER BY created_at DESC').all() as unknown as InvestigationRecord[];
}

export function getAgentRuns(investigationId: string): AgentRunRecord[] {
  return db
    .prepare('SELECT * FROM agent_runs WHERE investigation_id = ?')
    .all(investigationId) as unknown as AgentRunRecord[];
}

export function getLatestAgentStatuses(): Record<string, AgentRunRecord | null> {
  const latestInv = db
    .prepare('SELECT id FROM investigations ORDER BY created_at DESC LIMIT 1')
    .get() as { id: string } | undefined;
  const result: Record<string, AgentRunRecord | null> = {};
  for (const agent of AGENT_SEQUENCE) {
    if (!latestInv) {
      result[agent.key] = null;
    } else {
      const row = db
        .prepare('SELECT * FROM agent_runs WHERE investigation_id = ? AND agent_key = ?')
        .get(latestInv.id, agent.key) as AgentRunRecord | undefined;
      result[agent.key] = row ?? null;
    }
  }
  return result;
}

export function getDashboardStats() {
  const all = listInvestigations();
  const total = all.length;
  const active = all.filter((i) => i.status === 'running').length;
  const completed = all.filter((i) => i.status === 'completed').length;
  const concerns = all.filter((i) => i.verdict === 'HIGH CONCERN' || i.verdict === 'MONITOR').length;
  const regions = new Set(all.map((i) => `${i.region_name}, ${i.country}`)).size;
  return {
    totalInvestigations: total,
    activeInvestigations: active,
    completedInvestigations: completed,
    concernsDetected: concerns,
    regionsMonitored: regions,
  };
}

export function getSolutionPlan(investigationId: string) {
  return db
    .prepare('SELECT * FROM solution_plans WHERE investigation_id = ?')
    .get(investigationId) as Record<string, unknown> | undefined;
}

export function upsertSolutionPlan(
  investigationId: string,
  patch: Partial<{
    user_type: string;
    budget_inr: number;
    selected_solution_id: string | null;
    solutions_json: string | null;
    discovery_json: string | null;
    checklist_json: string | null;
    tracker_json: string | null;
    outcome_notes: string | null;
  }>
) {
  const existing = getSolutionPlan(investigationId);
  const now = new Date().toISOString();
  if (!existing) {
    const id = `sol_${investigationId}`;
    db.prepare(`
      INSERT INTO solution_plans (
        id, investigation_id, user_type, budget_inr, selected_solution_id,
        solutions_json, discovery_json, checklist_json, tracker_json, outcome_notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      investigationId,
      patch.user_type ?? 'Farmer / Land Steward',
      patch.budget_inr ?? 50000,
      patch.selected_solution_id ?? null,
      patch.solutions_json ?? null,
      patch.discovery_json ?? null,
      patch.checklist_json ?? null,
      patch.tracker_json ?? null,
      patch.outcome_notes ?? null,
      now
    );
  } else {
    const keys = Object.keys(patch);
    if (keys.length > 0) {
      const sets = keys.map((k) => `${k} = ?`).join(', ');
      const values = keys.map((k) => (patch as Record<string, unknown>)[k]);
      db.prepare(`UPDATE solution_plans SET ${sets}, updated_at = ? WHERE investigation_id = ?`).run(
        ...(values as (string | number | null)[]),
        now,
        investigationId
      );
    }
  }
  return getSolutionPlan(investigationId);
}
