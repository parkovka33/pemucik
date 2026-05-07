import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { LogFields, LoggerPayload, LogLevel } from '../types';

const LOG_FILE_PATH = resolve(process.cwd(), 'logs/app.log');
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function ensureLogFilePath(): void {
  mkdirSync(dirname(LOG_FILE_PATH), { recursive: true });
}

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    const fields: LogFields = {
      error: error.message,
    };

    if (error.stack) {
      fields.stack = error.stack;
    }

    return fields;
  }

  return {
    error: String(error),
  };
}

export class Logger {
  public constructor(private readonly level: LogLevel) {
    ensureLogFilePath();
  }

  public debug(payload: Omit<LoggerPayload, 'level'>): void {
    this.log('debug', payload);
  }

  public info(payload: Omit<LoggerPayload, 'level'>): void {
    this.log('info', payload);
  }

  public warn(payload: Omit<LoggerPayload, 'level'>): void {
    this.log('warn', payload);
  }

  public error(
    payload: Omit<LoggerPayload, 'level' | 'error' | 'stack'>,
    error?: unknown,
  ): void {
    const normalized = error === undefined
      ? payload
      : {
          ...payload,
          ...serializeError(error),
        };

    this.log('error', normalized);
  }

  private log(level: LogLevel, payload: Omit<LoggerPayload, 'level'>): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.level]) {
      return;
    }

    const record = {
      level,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    const line = JSON.stringify(record);

    console.log(line);
    appendFileSync(LOG_FILE_PATH, `${line}\n`, 'utf8');
  }
}
