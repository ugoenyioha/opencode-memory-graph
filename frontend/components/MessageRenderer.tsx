'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Layers,
  Wrench,
  Terminal,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Brain,
  Image as ImageIcon,
  Lock,
  Settings,
} from './icons';

// ============================================================================
// Types for ai-agents-sdk.Message format
// ============================================================================

export interface AgentMessage {
  Role: 'user' | 'assistant' | 'system' | 'tool';
  Name?: string;
  ToolCallID?: string;
  Parts?: ContentPart[];
}

export interface ContentPart {
  Kind: 'text' | 'image' | 'tool_call' | 'tool_result' | 'thinking' | 'redacted';
  Text?: string;
  ImageURL?: string;
  ImageData?: string;
  ImageMediaType?: string;
  ImageDetail?: string;
  ToolCall?: AgentToolCall;
  ToolResult?: AgentToolResult;
  ThinkingSignature?: string;
  ThinkingText?: string;
  RedactedData?: string;
}

export interface AgentToolCall {
  ID: string;
  Name: string;
  Arguments?: string;      // v1: bytes (base64)
  ArgumentsStr?: string;   // v2: string (readable JSON)
  Input?: string;
  Type?: string;
}

export interface AgentToolResult {
  ToolCallID: string;
  Content?: string;        // v1: bytes (base64)
  ContentStr?: string;     // v2: string (readable JSON)
  IsError?: boolean;
  Type?: string;
}

// ============================================================================
// Type Guard
// ============================================================================

export function isAgentMessage(data: unknown): data is AgentMessage {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  // Must have Role field (PascalCase from registry projection)
  return typeof d.Role === 'string' && ['user', 'assistant', 'system', 'tool'].includes(d.Role);
}

// ============================================================================
// Role Styling
// ============================================================================

interface RoleStyle {
  icon: React.ReactNode;
  badge: string;
  border: string;
  headerBg: string;
}

function getRoleStyle(role: string): RoleStyle {
  switch (role) {
    case 'user':
      return {
        icon: <MessageSquare className="w-4 h-4" />,
        badge: 'bg-theme-role-user-muted text-theme-role-user',
        border: 'border-theme-role-user/30',
        headerBg: 'bg-theme-role-user-muted',
      };
    case 'assistant':
      return {
        icon: <Layers className="w-4 h-4" />,
        badge: 'bg-theme-role-assistant-muted text-theme-role-assistant',
        border: 'border-theme-role-assistant/30',
        headerBg: 'bg-theme-role-assistant-muted',
      };
    case 'system':
      return {
        icon: <Settings className="w-4 h-4" />,
        badge: 'bg-theme-role-system-muted text-theme-role-system',
        border: 'border-theme-role-system/30',
        headerBg: 'bg-theme-role-system-muted',
      };
    case 'tool':
      return {
        icon: <Wrench className="w-4 h-4" />,
        badge: 'bg-theme-role-tool-muted text-theme-role-tool',
        border: 'border-theme-role-tool/30',
        headerBg: 'bg-theme-role-tool-muted',
      };
    default:
      return {
        icon: <Layers className="w-4 h-4" />,
        badge: 'bg-theme-role-system-muted text-theme-role-system',
        border: 'border-theme-role-system/30',
        headerBg: 'bg-theme-role-system-muted',
      };
  }
}

// ============================================================================
// Part Renderers
// ============================================================================

function TextPartRenderer({ text }: { text: string }) {
  return (
    <div className="text-sm text-theme-text-secondary whitespace-pre-wrap leading-relaxed">
      {text}
    </div>
  );
}

function ThinkingPartRenderer({ text, signature }: { text?: string; signature?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!text) return null;

  return (
    <div className="border border-purple-500/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-purple-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-purple-400" />
        )}
        <Brain className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-medium text-purple-300">Thinking</span>
        {signature && (
          <span className="text-xs text-purple-400/50 font-mono ml-auto">
            {signature.slice(0, 8)}...
          </span>
        )}
      </button>
      {isOpen && (
        <div className="p-3 bg-purple-950/20 border-t border-purple-500/30">
          <pre className="text-xs text-purple-200/80 whitespace-pre-wrap font-mono leading-relaxed max-h-[300px] overflow-y-auto">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolCallPartRenderer({ toolCall }: { toolCall: AgentToolCall }) {
  const [showArgs, setShowArgs] = useState(false);

  // Prefer v2 string field, fall back to v1 bytes field or Input
  let formattedArgs = toolCall.ArgumentsStr || toolCall.Arguments || toolCall.Input || '';
  try {
    if (formattedArgs) {
      const parsed = JSON.parse(formattedArgs);
      formattedArgs = JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Keep as-is if not JSON
  }

  return (
    <div className="border border-amber-500/30 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-amber-500/10 flex items-center gap-2">
        <Wrench className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-amber-300">{toolCall.Name}</span>
        <span className="text-xs text-theme-text-dim font-mono">{toolCall.ID}</span>
        {toolCall.Type && (
          <span className="text-xs text-theme-text-faint ml-auto">{toolCall.Type}</span>
        )}
      </div>
      {formattedArgs && (
        <div className="border-t border-amber-500/20">
          <button
            onClick={() => setShowArgs(!showArgs)}
            className="w-full px-3 py-1.5 flex items-center gap-2 text-left bg-theme-bg-tertiary/20 hover:bg-theme-bg-tertiary/40 transition-colors"
          >
            {showArgs ? (
              <ChevronDown className="w-3 h-3 text-theme-text-dim" />
            ) : (
              <ChevronRight className="w-3 h-3 text-theme-text-dim" />
            )}
            <span className="text-xs text-theme-text-dim">Arguments</span>
          </button>
          {showArgs && (
            <div className="p-3 bg-theme-bg-secondary/50">
              <pre className="text-xs text-theme-text-secondary whitespace-pre-wrap break-words font-mono">
                {formattedArgs}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolResultPartRenderer({ toolResult }: { toolResult: AgentToolResult }) {
  const isError = toolResult.IsError;
  // Prefer v2 string field, fall back to v1 bytes field
  const content = toolResult.ContentStr || toolResult.Content || '';

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden',
        isError ? 'border-red-500/30' : 'border-emerald-500/30'
      )}
    >
      <div
        className={cn(
          'px-3 py-2 flex items-center gap-2',
          isError ? 'bg-red-500/10' : 'bg-emerald-500/10'
        )}
      >
        {isError ? (
          <XCircle className="w-4 h-4 text-red-400" />
        ) : (
          <CheckCircle className="w-4 h-4 text-emerald-400" />
        )}
        <span
          className={cn('text-xs font-medium', isError ? 'text-red-300' : 'text-emerald-300')}
        >
          {isError ? 'Error' : 'Result'}
        </span>
        <span className="text-xs text-theme-text-dim font-mono">{toolResult.ToolCallID}</span>
      </div>
      {content && (
        <div className="p-3 bg-theme-bg-secondary/50">
          <pre
            className={cn(
              'text-xs whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-y-auto',
              isError ? 'text-red-200' : 'text-theme-text-secondary'
            )}
          >
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function ImagePartRenderer({ part }: { part: ContentPart }) {
  const hasImage = part.ImageURL || part.ImageData;

  return (
    <div className="border border-cyan-500/30 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-cyan-500/10 flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-medium text-cyan-300">Image</span>
        {part.ImageMediaType && (
          <span className="text-xs text-theme-text-dim font-mono">{part.ImageMediaType}</span>
        )}
        {part.ImageDetail && (
          <span className="text-xs text-theme-text-faint">{part.ImageDetail}</span>
        )}
      </div>
      {hasImage && (
        <div className="p-3 bg-theme-bg-secondary/50 flex justify-center">
          {part.ImageURL ? (
            <img
              src={part.ImageURL}
              alt="Content"
              className="max-h-[200px] rounded"
            />
          ) : part.ImageData ? (
            <img
              src={`data:${part.ImageMediaType || 'image/png'};base64,${part.ImageData}`}
              alt="Content"
              className="max-h-[200px] rounded"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function RedactedPartRenderer({ data }: { data?: string }) {
  return (
    <div className="border border-theme-text-faint/30 rounded-lg overflow-hidden bg-theme-bg-tertiary/30">
      <div className="px-3 py-2 flex items-center gap-2">
        <Lock className="w-4 h-4 text-theme-text-dim" />
        <span className="text-xs font-medium text-theme-text-muted">Redacted Content</span>
        {data && (
          <span className="text-xs text-theme-text-faint font-mono ml-auto">
            {data.length} bytes
          </span>
        )}
      </div>
    </div>
  );
}

function ContentPartRenderer({ part }: { part: ContentPart }) {
  switch (part.Kind) {
    case 'text':
      return part.Text ? <TextPartRenderer text={part.Text} /> : null;
    case 'thinking':
      return <ThinkingPartRenderer text={part.ThinkingText} signature={part.ThinkingSignature} />;
    case 'tool_call':
      return part.ToolCall ? <ToolCallPartRenderer toolCall={part.ToolCall} /> : null;
    case 'tool_result':
      return part.ToolResult ? <ToolResultPartRenderer toolResult={part.ToolResult} /> : null;
    case 'image':
      return <ImagePartRenderer part={part} />;
    case 'redacted':
      return <RedactedPartRenderer data={part.RedactedData} />;
    default:
      // Unknown kind - show raw
      return (
        <div className="text-xs text-theme-text-dim italic">
          Unknown part kind: {part.Kind}
        </div>
      );
  }
}

// ============================================================================
// Main Message Renderer
// ============================================================================

interface MessageRendererProps {
  message: AgentMessage;
  className?: string;
}

export function MessageRenderer({ message, className }: MessageRendererProps) {
  const style = getRoleStyle(message.Role);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className={cn('border rounded-lg overflow-hidden', style.border)}>
        <div className={cn('px-3 py-2 flex items-center gap-2', style.headerBg)}>
          {style.icon}
          <span className={cn('text-sm font-medium', style.badge.split(' ')[1])}>
            {message.Role}
          </span>
          {message.Name && (
            <span className="text-xs text-theme-text-muted">{message.Name}</span>
          )}
          {message.ToolCallID && (
            <span className="text-xs text-theme-text-dim font-mono ml-auto">
              {message.ToolCallID}
            </span>
          )}
        </div>

        {/* Parts */}
        {message.Parts && message.Parts.length > 0 && (
          <div className="p-3 space-y-3 bg-theme-bg-secondary/30">
            {message.Parts.map((part, idx) => (
              <ContentPartRenderer key={idx} part={part} />
            ))}
          </div>
        )}

        {/* Empty message */}
        {(!message.Parts || message.Parts.length === 0) && (
          <div className="p-3 text-sm text-theme-text-dim italic">
            No content
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Extract text for previews
// ============================================================================

export function extractMessageText(message: AgentMessage): string | null {
  if (!message.Parts) return null;

  const textParts = message.Parts
    .filter(p => p.Kind === 'text' && p.Text)
    .map(p => p.Text!);

  return textParts.length > 0 ? textParts.join('\n') : null;
}

// ============================================================================
// TurnRendererProps Wrapper
// ============================================================================

import type { TurnRendererProps } from '@/lib/renderer-registry';

/**
 * Wrapper that accepts standard TurnRendererProps interface.
 * Used by the dynamic renderer registry.
 */
export function MessageRendererWrapper({ data, className }: TurnRendererProps) {
  if (isAgentMessage(data)) {
    return <MessageRenderer message={data} className={className} />;
  }
  // If data doesn't match, return null - DynamicRenderer will use fallback
  return null;
}
