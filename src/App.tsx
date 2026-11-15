import { createContext, useCallback, useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { LanguageProvider } from './context/LanguageContext';

export const GoogleMapsActiveContext = createContext<boolean>(false);
import { Layout } from './components/Layout';
import { CauseInvestigatorPage } from './pages/CauseInvestigatorPage';
import { DataScoutPage } from './pages/DataScoutPage';
import { EarthJudgePage } from './pages/EarthJudgePage';
import { GeoIntelligencePage } from './pages/GeoIntelligencePage';
import { HomePage } from './pages/HomePage';
import { ImpactAnalystPage } from './pages/ImpactAnalystPage';
import { LiveEarthPage } from './pages/LiveEarthPage';
import { RelationshipAnalystPage } from './pages/RelationshipAnalystPage';
import { ScienceChallengerPage } from './pages/ScienceChallengerPage';
import { ScientificReportsPage } from './pages/ScientificReportsPage';
import { SolutionCentrePage } from './pages/SolutionCentrePage';
import { TrendDetectivePage } from './pages/TrendDetectivePage';
import { WorkspacePage } from './pages/WorkspacePage';
import { FullInvestigationBundle, InvestigationSummary, PageId } from './types/terra';

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('home');
  const [investigations, setInvestigations] = useState<InvestigationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<FullInvestigationBundle | null>(null);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || ''
  );

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/maps/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (cfg?.apiKey) setMapsApiKey(String(cfg.apiKey));
      })
      .catch(() => {
        // Keep resilient
      });
  }, [mapsApiKey]);

  const loadInvestigationsList = useCallback(async () => {
    try {
      const res = await fetch('/api/investigations');
      if (!res.ok) return;
      const json = await res.json();
      const list: InvestigationSummary[] = json.investigations ?? [];
      setInvestigations(list);
      setActiveId((prev) => prev ?? list[0]?.id ?? null);
    } catch {
      // Keep UI resilient
    }
  }, []);

  const loadActiveBundle = useCallback(async (id: string | null) => {
    if (!id) {
      setBundle(null);
      return;
    }
    try {
      const res = await fetch(`/api/investigations/${id}`);
      if (!res.ok) return;
      const json: FullInvestigationBundle = await res.json();
      setBundle(json);
      setInvestigations((prev) =>
        prev.map((item) => (item.id === json.investigation.id ? json.investigation : item))
      );
    } catch {
      // Ignore transient network blip
    }
  }, []);

  useEffect(() => {
    void loadInvestigationsList();
  }, [loadInvestigationsList]);

  useEffect(() => {
    void loadActiveBundle(activeId);
  }, [activeId, loadActiveBundle]);

  const handleSelectInvestigation = (id: string, targetPage?: PageId) => {
    setActiveId(id);
    if (targetPage) setActivePage(targetPage);
  };

  const handleInvestigationCreated = (id: string) => {
    setActiveId(id);
    void loadInvestigationsList();
    void loadActiveBundle(id);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return (
          <HomePage
            onNavigate={setActivePage}
            onSelectInvestigation={handleSelectInvestigation}
            activeInvestigation={bundle?.investigation ?? null}
          />
        );
      case 'live-earth':
        return <LiveEarthPage />;
      case 'workspace':
        return (
          <WorkspacePage
            activeInvestigation={bundle?.investigation ?? null}
            agentRuns={bundle?.agentRuns ?? []}
            onInvestigationCreated={handleInvestigationCreated}
            onRefreshActive={() => loadActiveBundle(activeId)}
            onNavigate={setActivePage}
          />
        );
      case 'data-scout':
        return <DataScoutPage bundle={bundle} onNavigate={setActivePage} />;
      case 'trend-detective':
        return <TrendDetectivePage bundle={bundle} onNavigate={setActivePage} />;
      case 'geo-intelligence':
        return <GeoIntelligencePage bundle={bundle} onNavigate={setActivePage} />;
      case 'relationship-analyst':
        return <RelationshipAnalystPage bundle={bundle} onNavigate={setActivePage} />;
      case 'cause-investigator':
        return <CauseInvestigatorPage bundle={bundle} onNavigate={setActivePage} />;
      case 'science-challenger':
        return <ScienceChallengerPage bundle={bundle} onNavigate={setActivePage} />;
      case 'impact-analyst':
        return <ImpactAnalystPage bundle={bundle} onNavigate={setActivePage} />;
      case 'earth-judge':
        return <EarthJudgePage bundle={bundle} onNavigate={setActivePage} />;
      case 'solution-centre':
        return <SolutionCentrePage bundle={bundle} onNavigate={setActivePage} />;
      case 'scientific-reports':
        return <ScientificReportsPage bundle={bundle} onNavigate={setActivePage} />;
      default:
        return (
          <HomePage
            onNavigate={setActivePage}
            onSelectInvestigation={handleSelectInvestigation}
            activeInvestigation={bundle?.investigation ?? null}
          />
        );
    }
  };

  const appBody = (
    <>
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <Layout
        activePage={activePage}
        onNavigate={setActivePage}
        investigations={investigations}
        activeInvestigationId={activeId}
        onSelectInvestigation={(id) => handleSelectInvestigation(id)}
      >
        {renderPage()}
      </Layout>
    </>
  );

  if (mapsApiKey) {
    return (
      <LanguageProvider>
        <GoogleMapsActiveContext.Provider value={!mapsQuotaExceeded}>
          <APIProvider apiKey={mapsApiKey} libraries={['marker']} language="en">
            {appBody}
          </APIProvider>
        </GoogleMapsActiveContext.Provider>
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <GoogleMapsActiveContext.Provider value={false}>{appBody}</GoogleMapsActiveContext.Provider>
    </LanguageProvider>
  );
}
