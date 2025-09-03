import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');

const createLogger = (label) =>
  winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.label({ label }),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, label }) => {
        return `[${timestamp}] [${label}] ${level.toUpperCase()}: ${message}`;
      }),
    ),
    transports: [
      new DailyRotateFile({
        // filename: `${label}-%DATE%.log`,
        dirname: logDir,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d',
      }),
      new winston.transports.Console({
        format: winston.format.colorize({ all: true }),
      }),
    ],
  });

const apiLogger = createLogger('api');
const errorLogger = createLogger('error');


export { apiLogger, errorLogger };
