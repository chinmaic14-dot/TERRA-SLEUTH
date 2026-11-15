import React, { useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Compass,
  Database,
  FileText,
  FlaskConical,
  GitCompare,
  Globe,
  Home,
  Languages,
  Lightbulb,
  Loader2,
  MapPin,
  Menu,
  Scale,
  ShieldAlert,
  TrendingUp,
  Volume2,
  Wrench,
  X,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES, useLanguage } from '../context/LanguageContext';
import { InvestigationSummary, NAVIGATION_ITEMS, PageId } from '../types/terra';
import { DomTranslator } from './DomTranslator';
import { VoiceAssistant } from './VoiceAssistant';

interface LayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  investigations: InvestigationSummary[];
  activeInvestigationId: string | null;
  onSelectInvestigation: (id: string) => void;
  children: React.ReactNode;
}

const ICON_MAP: Record<PageId, React.ComponentType<{ className?: string }>> = {
  home: Home,
  'live-earth': Globe,
  workspace: FlaskConical,
  'data-scout': Database,
  'trend-detective': TrendingUp,
  'geo-intelligence': MapPin,
  'relationship-analyst': GitCompare,
  'cause-investigator': Lightbulb,
  'science-challenger': ShieldAlert,
  'impact-analyst': Activity,
  'earth-judge': Scale,
  'solution-centre': Wrench,
  'scientific-reports': FileText,
};

export const Layout: React.FC<LayoutProps> = ({
  activePage,
  onNavigate,
  investigations,
  activeInvestigationId,
  onSelectInvestigation,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { language, setLanguageCode, navLabel, uiText, voiceOpen, setVoiceOpen, translating } = useLanguage();

  const activeInv = investigations.find((i) => i.id === activeInvestigationId) ?? null;

  const renderNavContent = (isMobile = false) => (
    <div className="flex flex-col h-full bg-[#0B1C17] border-r border-[#9DB2A7]/15">
      {/* Brand Header */}
      <div className="px-4 py-4 border-b border-[#9DB2A7]/15 flex items-center justify-between gap-2">
        <button
          onClick={() => {
            onNavigate('home');
            setMobileOpen(false);
          }}
          className="flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#35C99A] rounded"
        >
          <div className="w-9 h-9 rounded-lg bg-[#10251E] border border-[#35C99A]/35 flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5 text-[#35C99A]" />
          </div>
          {(!collapsed || isMobile) && (
            <div className="min-w-0" data-no-translate="true">
              <div className="text-base font-bold tracking-tight text-[#E8F2ED] whitespace-nowrap">
                TERRA SLEUTH
              </div>
              <div className="text-[10px] font-mono tracking-wider text-[#35C99A] whitespace-nowrap">
                DETECT · INVESTIGATE · VERIFY · RESTORE
              </div>
            </div>
          )}
        </button>

        {!isMobile ? (
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-md text-[#9DB2A7] hover:text-[#E8F2ED] hover:bg-[#10251E] transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        ) : (
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 rounded-md text-[#9DB2A7] hover:text-[#E8F2ED]"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links in Exact Required Order */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5" aria-label="Primary Navigation">
        {NAVIGATION_ITEMS.map((item, idx) => {
          const Icon = ICON_MAP[item.id];
          const isActive = activePage === item.id;
          const prevSection = idx > 0 ? NAVIGATION_ITEMS[idx - 1].section : item.section;
          const showDivider = idx > 0 && item.section !== prevSection;

          return (
            <React.Fragment key={item.id}>
              {showDivider && (
                <div className="my-2.5 border-t border-[#9DB2A7]/10 mx-1.5" />
              )}
              <button
                onClick={() => {
                  onNavigate(item.id);
                  setMobileOpen(false);
                }}
                title={collapsed && !isMobile ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#10251E] text-[#35C99A] font-medium border border-[#35C99A]/30'
                    : 'text-[#9DB2A7] hover:text-[#E8F2ED] hover:bg-[#10251E]/60 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#35C99A]' : 'text-[#9DB2A7]'}`} />
                {(!collapsed || isMobile) && (
                  <span
                    className="truncate"
                    data-no-translate={language.code === 'kn' || language.code === 'hi' ? 'true' : undefined}
                  >
                    {navLabel(item.id, item.label)}
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* Active Investigation Footer Context */}
      {(!collapsed || isMobile) && activeInv && (
        <div className="p-3 border-t border-[#9DB2A7]/15 bg-[#07120F]/50 text-xs space-y-1">
          <div className="text-[#9DB2A7]">Active Study</div>
          <div className="text-[#E8F2ED] font-medium truncate" title={activeInv.research_question}>
            {activeInv.region_name} · {activeInv.category}
          </div>
          <div className="font-mono text-[11px] text-[#65B8D5]">
            {activeInv.status === 'completed'
              ? `● ${activeInv.verdict ?? 'Completed'}`
              : activeInv.status === 'running'
              ? `▲ Running (${activeInv.progress_pct}%)`
              : `◌ ${activeInv.status}`}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div ref={shellRef} className="min-h-screen flex bg-[#07120F] text-[#E8F2ED] terra-topo-grid">
      <DomTranslator roots={[shellRef]} />
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 sticky top-0 h-screen transition-[width] duration-200 ${
          collapsed ? 'w-[70px]' : 'w-[264px]'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            {renderNavContent(true)}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Context Bar */}
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-6 bg-[#07120F]/90 backdrop-blur border-b border-[#9DB2A7]/15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-md text-[#9DB2A7] hover:text-[#E8F2ED] hover:bg-[#10251E]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden font-display font-bold text-sm tracking-tight text-[#E8F2ED] whitespace-nowrap" data-no-translate="true">
              TERRA SLEUTH
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#9DB2A7] min-w-0">
              <span
                className="shrink-0"
                data-no-translate={language.code === 'kn' || language.code === 'hi' ? 'true' : undefined}
              >
                {uiText('investigationContext', 'Investigation Context:')}
              </span>
              {investigations.length > 0 ? (
                <select
                  aria-label="Select active investigation"
                  value={activeInvestigationId ?? ''}
                  onChange={(e) => onSelectInvestigation(e.target.value)}
                  className="bg-[#10251E] border border-[#9DB2A7]/20 rounded-md px-2.5 py-1.5 text-xs text-[#E8F2ED] max-w-[340px] focus:outline-none focus:border-[#35C99A]"
                >
                  {investigations.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.region_name} — {inv.research_question.slice(0, 48)}
                      {inv.research_question.length > 48 ? '…' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[#9DB2A7]/70">No active investigation yet</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div className="inline-flex items-center gap-1.5 bg-[#10251E] border border-[#9DB2A7]/20 rounded-md px-2 py-1" data-no-translate="true">
              {translating ? (
                <Loader2 className="w-3.5 h-3.5 text-[#35C99A] shrink-0 animate-spin" />
              ) : (
                <Languages className="w-3.5 h-3.5 text-[#35C99A] shrink-0" />
              )}
              <select
                aria-label="Global Language Selector"
                value={language.code}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="bg-transparent text-xs text-[#E8F2ED] focus:outline-none max-w-[125px]"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-[#0B1C17] text-[#E8F2ED]">
                    {lang.nativeLabel}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setVoiceOpen(!voiceOpen)}
              aria-label="Toggle Voice Assistant"
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                voiceOpen
                  ? 'bg-[#35C99A]/15 border-[#35C99A]/40 text-[#35C99A]'
                  : 'bg-[#10251E] border-[#9DB2A7]/20 text-[#E8F2ED] hover:border-[#35C99A]/40'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5 text-[#35C99A]" />
              <span data-no-translate={language.code === 'kn' || language.code === 'hi' ? 'true' : undefined}>
                {uiText('voiceAssistant', 'Voice Assistant')}
              </span>
            </button>
            <button
              onClick={() => onNavigate('workspace')}
              data-no-translate={language.code === 'kn' || language.code === 'hi' ? 'true' : undefined}
              className="px-3.5 py-1.5 rounded-lg bg-[#35C99A] text-[#07120F] text-xs font-semibold hover:bg-[#2eb58a] transition-colors whitespace-nowrap shrink-0"
            >
              {uiText('newInvestigation', 'New Investigation')}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
        <VoiceAssistant activePage={activePage} activeInvestigation={activeInv} />
      </div>
    </div>
  );
};
