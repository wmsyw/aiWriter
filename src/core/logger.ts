export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  service?: string;
  error?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

interface LoggerOptions {
  service?: string;
  minLevel?: LogLevel;
  json?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private service: string;
  private minLevel: number;
  private useJson: boolean;

  constructor(options: LoggerOptions = {}) {
    this.service = options.service || 'aiwriter';
    this.minLevel = LOG_LEVELS[options.minLevel || 'debug'];
    this.useJson = options.json ?? (process.env.NODE_ENV === 'production');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  private formatError(err: Error): LogEntry['error'] {
    return {
      message: err.message,
      stack: err.stack,
      name: err.name,
    };
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = this.formatError(error);
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    if (this.useJson) {
      console.log(JSON.stringify(entry));
    } else {
      const { timestamp, level, message, context, error } = entry;
      const levelStr = level.toUpperCase().padEnd(5);
      const serviceStr = this.service ? `[${this.service}]` : '';
      
      let output = `[${timestamp}] ${levelStr} ${serviceStr} ${message}`;
      
      if (context && Object.keys(context).length > 0) {
        const contextStr = Object.entries(context)
          .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(' ');
        output += ` | ${contextStr}`;
      }

      switch (entry.level) {
        case 'debug':
          console.debug(output);
          break;
        case 'info':
          console.info(output);
          break;
        case 'warn':
          console.warn(output);
          break;
        case 'error':
          console.error(output);
          if (error?.stack) {
            console.error(error.stack);
          }
          break;
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      this.output(this.formatEntry('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      this.output(this.formatEntry('info', message, context));
    }
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('warn')) {
      this.output(this.formatEntry('warn', message, context, error));
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('error')) {
      this.output(this.formatEntry('error', message, context, error));
    }
  }

  child(additionalContext: LogContext): ChildLogger {
    return new ChildLogger(this, additionalContext);
  }
}

class ChildLogger {
  private parent: Logger;
  private context: LogContext;

  constructor(parent: Logger, context: LogContext) {
    this.parent = parent;
    this.context = context;
  }

  private mergeContext(additional?: LogContext): LogContext {
    return { ...this.context, ...additional };
  }

  debug(message: string, context?: LogContext): void {
    this.parent.debug(message, this.mergeContext(context));
  }

  info(message: string, context?: LogContext): void {
    this.parent.info(message, this.mergeContext(context));
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.parent.warn(message, this.mergeContext(context), error);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.parent.error(message, this.mergeContext(context), error);
  }
}

export const workerLogger = new Logger({ service: 'worker' });
export const webLogger = new Logger({ service: 'web' });
export const logger = new Logger();

export function createLogger(options: LoggerOptions): Logger {
  return new Logger(options);
}

export { Logger };
