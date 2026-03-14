/**
 * Structured logging for mcp-video
 * Logs to stderr to not interfere with MCP protocol on stdout
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const DEBUG = process.env.DEBUG?.includes('mcp-video') || process.env.MCP_VIDEO_DEBUG === '1';

function formatEntry(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
  return `${prefix} ${entry.message}${ctx}`;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (level === 'debug' && !DEBUG) return;

  const entry: LogEntry = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };

  console.error(formatEntry(entry));
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),

  logError: (message: string, error: unknown, context?: Record<string, unknown>) => {
    const errorContext: Record<string, unknown> = { ...context };

    if (error instanceof Error) {
      errorContext.errorMessage = error.message;
      errorContext.errorName = error.name;
      if (DEBUG && error.stack) {
        errorContext.stack = error.stack;
      }
    } else {
      errorContext.error = String(error);
    }

    log('error', message, errorContext);
  },
};

export type Logger = typeof logger;
