'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { fetchProvenance } from '@/lib/api';
import type { Provenance } from '@/types/provenance';
import {
  getSourceStyle,
  getSpawnReasonStyle,
  getWriterMethodStyle,
  formatTraceId,
  formatServiceIdentity,
  formatHostIdentity,
  hasLineage,
  hasUserIdentity,
  hasWriterIdentity,
  hasProcessIdentity,
  hasTraceContext,
} from '@/types/provenance';
import { ChevronRight, AlertCircle, Copy, Check, ExternalLink } from './icons';

interface ProvenancePanelProps {
  contextId: string;
  /** Pre-loaded provenance (from context list). */
  provenance?: Provenance | null;
  /** Callback when a linked context is clicked. */
  onContextClick?: (contextId: string) => void;
  className?: string;
}

interface ProvenanceSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function ProvenanceSection({ title, children, defaultOpen = true }: ProvenanceSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-theme-border-dim/60 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-theme-bg-tertiary/30 transition-colors"
      >
        <span className="text-xs font-medium text-theme-text-muted uppercase tracking-wide">{title}</span>
        <ChevronRight
          className={cn(
            'w-4 h-4 text-theme-text-dim transition-transform',
            isOpen && 'rotate-90'
          )}
        />
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

interface ProvenanceFieldProps {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  copyable?: boolean;
  icon?: string;
  iconColor?: string;
  children?: React.ReactNode;
}

function ProvenanceField({ label, value, mono, copyable, icon, iconColor, children }: ProvenanceFieldProps) {
  const [copied, setCopied] = useState(false);

  if (!value && !children) return null;

  const handleCopy = async () => {
    if (value) {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-xs text-theme-text-dim min-w-[100px] shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {icon && <span className={cn('text-sm', iconColor)}>{icon}</span>}
        {children || (
          <span
            className={cn(
              'text-xs text-theme-text-secondary truncate',
              mono && 'font-mono'
            )}
            title={String(value)}
          >
            {value}
          </span>
        )}
        {copyable && value && (
          <button
            onClick={handleCopy}
            className="p-0.5 hover:bg-theme-bg-hover/50 rounded transition-colors shrink-0"
            title="Copy"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-theme-text-dim" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function ContextLink({
  contextId,
  label,
  onClick,
}: {
  contextId: number;
  label: string;
  onClick?: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onClick?.(String(contextId))}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded text-xs font-mono text-theme-accent transition-colors"
    >
      #{contextId}
      <ExternalLink className="w-3 h-3" />
    </button>
  );
}

export function ProvenancePanel({
  contextId,
  provenance: initialProvenance,
  onContextClick,
  className,
}: ProvenancePanelProps) {
  const [provenance, setProvenance] = useState<Provenance | null | undefined>(initialProvenance);
  const [loading, setLoading] = useState(!initialProvenance);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProvenance !== undefined) {
      setProvenance(initialProvenance);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchProvenance(contextId)
      .then((response) => {
        setProvenance(response.provenance);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load provenance');
        setLoading(false);
      });
  }, [contextId, initialProvenance]);

  if (loading) {
    return (
      <div className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-theme-text-dim">
          <div className="w-4 h-4 border-2 border-theme-text-faint border-t-theme-accent rounded-full animate-spin" />
          <span className="text-sm">Loading provenance...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('p-4', className)}>
        <div className="flex items-center gap-2 text-amber-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  if (!provenance) {
    return (
      <div className={cn('p-4 text-center', className)}>
        <p className="text-sm text-theme-text-dim">No provenance data available</p>
        <p className="text-xs text-theme-text-faint mt-1">
          Provenance is captured when a context is created with metadata.
        </p>
      </div>
    );
  }

  const sourceStyle = getSourceStyle(provenance.on_behalf_of_source);
  const spawnStyle = getSpawnReasonStyle(provenance.spawn_reason);
  const writerStyle = getWriterMethodStyle(provenance.writer_method);

  return (
    <div className={cn('divide-y divide-theme-border-dim/60', className)}>
      {/* Context Lineage */}
      {hasLineage(provenance) && (
        <ProvenanceSection title="Lineage">
          {provenance.parent_context_id && (
            <ProvenanceField label="Parent">
              <ContextLink
                contextId={provenance.parent_context_id}
                label="Parent context"
                onClick={onContextClick}
              />
            </ProvenanceField>
          )}
          {provenance.root_context_id && provenance.root_context_id !== provenance.parent_context_id && (
            <ProvenanceField label="Root">
              <ContextLink
                contextId={provenance.root_context_id}
                label="Root context"
                onClick={onContextClick}
              />
            </ProvenanceField>
          )}
          {provenance.spawn_reason && (
            <ProvenanceField
              label="Spawn reason"
              value={spawnStyle.label}
              icon={spawnStyle.icon}
              iconColor={spawnStyle.color}
            />
          )}
        </ProvenanceSection>
      )}

      {/* User Identity */}
      {hasUserIdentity(provenance) && (
        <ProvenanceSection title="On Behalf Of">
          {provenance.on_behalf_of && (
            <ProvenanceField label="User" value={provenance.on_behalf_of} />
          )}
          {provenance.on_behalf_of_email && (
            <ProvenanceField label="Email" value={provenance.on_behalf_of_email} />
          )}
          {provenance.on_behalf_of_source && (
            <ProvenanceField
              label="Source"
              value={sourceStyle.label}
              icon={sourceStyle.icon}
              iconColor={sourceStyle.color}
            />
          )}
        </ProvenanceSection>
      )}

      {/* Request Identity / Trace Context */}
      {hasTraceContext(provenance) && (
        <ProvenanceSection title="Request Identity">
          {provenance.trace_id && (
            <ProvenanceField
              label="Trace ID"
              value={provenance.trace_id}
              mono
              copyable
            />
          )}
          {provenance.span_id && (
            <ProvenanceField
              label="Span ID"
              value={provenance.span_id}
              mono
              copyable
            />
          )}
          {provenance.correlation_id && (
            <ProvenanceField
              label="Correlation"
              value={provenance.correlation_id}
              mono
              copyable
            />
          )}
        </ProvenanceSection>
      )}

      {/* Writer Identity */}
      {hasWriterIdentity(provenance) && (
        <ProvenanceSection title="Writer Identity">
          {provenance.writer_method && (
            <ProvenanceField
              label="Auth method"
              value={writerStyle.label}
              icon={writerStyle.icon}
              iconColor={writerStyle.color}
            />
          )}
          {provenance.writer_subject && (
            <ProvenanceField
              label="Subject"
              value={provenance.writer_subject}
              mono
              copyable
            />
          )}
          {provenance.writer_issuer && (
            <ProvenanceField
              label="Issuer"
              value={provenance.writer_issuer}
              mono
            />
          )}
        </ProvenanceSection>
      )}

      {/* Process Identity */}
      {hasProcessIdentity(provenance) && (
        <ProvenanceSection title="Process">
          {(provenance.service_name || provenance.service_version) && (
            <ProvenanceField
              label="Service"
              value={formatServiceIdentity(provenance)}
            />
          )}
          {provenance.service_instance_id && (
            <ProvenanceField
              label="Instance ID"
              value={provenance.service_instance_id}
              mono
              copyable
            />
          )}
          {(provenance.host_name || provenance.host_arch) && (
            <ProvenanceField
              label="Host"
              value={formatHostIdentity(provenance)}
            />
          )}
          {provenance.process_pid && (
            <ProvenanceField label="PID" value={provenance.process_pid} mono />
          )}
          {provenance.process_owner && (
            <ProvenanceField label="Owner" value={provenance.process_owner} />
          )}
        </ProvenanceSection>
      )}

      {/* Network Identity */}
      {(provenance.client_address || provenance.client_port) && (
        <ProvenanceSection title="Network">
          {provenance.client_address && (
            <ProvenanceField
              label="Client address"
              value={
                provenance.client_port
                  ? `${provenance.client_address}:${provenance.client_port}`
                  : provenance.client_address
              }
              mono
            />
          )}
        </ProvenanceSection>
      )}

      {/* SDK Identity */}
      {(provenance.sdk_name || provenance.sdk_version) && (
        <ProvenanceSection title="SDK">
          {provenance.sdk_name && (
            <ProvenanceField label="Name" value={provenance.sdk_name} />
          )}
          {provenance.sdk_version && (
            <ProvenanceField label="Version" value={provenance.sdk_version} />
          )}
        </ProvenanceSection>
      )}

      {/* Environment Variables */}
      {provenance.env && Object.keys(provenance.env).length > 0 && (
        <ProvenanceSection title="Environment" defaultOpen={false}>
          {Object.entries(provenance.env).map(([key, value]) => (
            <ProvenanceField key={key} label={key} value={value} mono />
          ))}
        </ProvenanceSection>
      )}

      {/* Timestamp */}
      {provenance.captured_at && (
        <ProvenanceSection title="Captured">
          <ProvenanceField
            label="Timestamp"
            value={new Date(provenance.captured_at).toISOString()}
          />
        </ProvenanceSection>
      )}
    </div>
  );
}

export default ProvenancePanel;
