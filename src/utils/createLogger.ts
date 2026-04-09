import winston from "winston";

/**
 * @ignore
 */
export function createLogger(logName: string, logLevel?: string) {
    const logger = winston.createLogger({
        defaultMeta: { service: "vex-" + logName },
        format: winston.format.combine(
            winston.format.timestamp({
                format: "YYYY-MM-DD HH:mm:ss",
            }),
            winston.format.errors({ stack: true }),
            winston.format.splat(),
            winston.format.json(),
        ),
        level: logLevel || "error",
        transports: [
            new winston.transports.File({
                filename: "vex:" + logName + ".log",
                level: "error",
            }),
        ],
    });
    // Also log to console outside production.
    if (process.env["NODE_ENV"] !== "production") {
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
