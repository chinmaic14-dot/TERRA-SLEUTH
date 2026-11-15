import React from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { InvestigationSummary, PageId } from '../types/terra';

interface AgentEmptyStateProps {
  agentName: string;
  investigation: InvestigationSummary | null;
  onNavigate: (page: PageId) => void;
}

export const AgentEmptyState: React.FC<AgentEmptyStateProps> = ({
  agentName,
  investigation,
  onNavigate,
}) => {
  if (investigation?.status === 'running') {
    return (
      <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-10 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-[#35C99A] animate-spin mx-auto" />
        <div className="text-base font-semibold text-[#E8F2ED]">
          {agentName} is awaiting pipeline execution...
        </div>
        <p className="text-xs text-[#9DB2A7]">
          Current stage: <span className="font-mono text-[#65B8D5]">{investigation.current_agent}</span> ({investigation.progress_pct}%)
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#10251E] border border-[#9DB2A7]/15 rounded-xl p-10 text-center space-y-4">
      <FlaskConical className="w-9 h-9 text-[#35C99A] mx-auto" />
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-[#E8F2ED]">No {agentName} Results Loaded</h2>
        <p className="text-xs text-[#9DB2A7] max-w-md mx-auto">
          Launch an investigation in the Investigation Workspace to retrieve NASA observations and generate {agentName} outputs.
        </p>
      </div>
      <button
        onClick={() => onNavigate('workspace')}
        className="px-4 py-2 rounded-lg bg-[#35C99A] text-[#07120F] text-xs font-semibold hover:bg-[#2eb58a]"
      >
        Open Investigation Workspace
      </button>
    </div>
  );
};
