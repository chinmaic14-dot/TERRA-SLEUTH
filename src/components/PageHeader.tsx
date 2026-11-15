import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  contextLine?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  contextLine,
  actions,
}) => {
  return (
    <div className="border-b border-[#9DB2A7]/15 pb-5 mb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
      <div className="space-y-1.5 max-w-3xl">
        {contextLine && (
          <div className="text-xs font-mono text-[#65B8D5] tracking-wide">
            {contextLine}
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#E8F2ED] text-balance">
          {title}
        </h1>
        <p className="text-sm text-[#9DB2A7] leading-relaxed">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};
