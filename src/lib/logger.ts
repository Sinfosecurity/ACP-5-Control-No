// ============================================================
// lib/logger.ts
// Structured logging for production
// Replace console.log/error with this logger
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private serviceName = 'nyc-dob-lookup';
  private environment = process.env.NODE_ENV || 'development';

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      environment: this.environment,
      message,
      ...context,
    };

    // In development: pretty print
    // In production: JSON for log aggregation
    if (this.environment === 'development') {
      const emoji = {
        debug: '🔍',
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      };
      console.log(`${emoji[level]} [${level.toUpperCase()}] ${message}`, context || '');
    } else {
      // JSON output for production log aggregation (CloudWatch, DataDog, etc.)
      console.log(JSON.stringify(logEntry));
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext: LogContext = {
      ...context,
    };

    if (error instanceof Error) {
      errorContext.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      errorContext.error = error;
    }

    this.log('error', message, errorContext);
  }
}

export const logger = new Logger();
