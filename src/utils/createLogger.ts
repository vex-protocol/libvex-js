import winston from "winston";
import type { IClientOptions } from "../index.js";

/**
 * @ignore
 */
export function createLogger(logName: string, logLevel?: string) {
    const logger = winston.createLogger({
        level: logLevel || "error",
        format: winston.format.combine(
            winston.format.timestamp({
                format: "YYYY-MM-DD HH:mm:ss",
            }),
            winston.format.errors({ stack: true }),
            winston.format.splat(),
            winston.format.json(),
        ),
        defaultMeta: { service: "vex-" + logName },
        transports: [
            new winston.transports.File({
                filename: "vex:" + logName + ".log",
                level: "error",
            }),
        ],
    });
    // Also log to console outside production.
    if (process.env.NODE_ENV !== "production") {
        logger.add(
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple(),
                ),
            }),
        );
    }
    return logger;
}
