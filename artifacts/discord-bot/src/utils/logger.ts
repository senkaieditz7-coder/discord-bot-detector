import { createLogger, format, transports } from 'winston';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '../../logs');
mkdirSync(LOGS_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = format;

const logLine = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackStr = stack ? `\n${stack}` : '';
  return `[${ts}] ${level}: ${message}${metaStr}${stackStr}`;
});

export const logger = createLogger({
  level: 'info',
  format: combine(errors({ stack: true }), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logLine),
  transports: [
    new transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        logLine,
      ),
    }),
    new transports.File({
      filename: join(LOGS_DIR, 'bot.log'),
      maxsize: 10_000_000,
      maxFiles: 5,
    }),
    new transports.File({
      filename: join(LOGS_DIR, 'errors.log'),
      level: 'error',
      maxsize: 10_000_000,
      maxFiles: 5,
    }),
  ],
});
