import winston, {createLogger, format, transports } from 'winston';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoggerUtil = any;

export enum LoggerLevelsEnum {
  error,
  warn,
  info,
  http,
  verbpse,
  debug,
  silly,
}
class Logger {
  private readonly format = format.combine(
    format.colorize(),
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.printf(({ timestamp, level, message }: LoggerUtil) => `${level}: ${timestamp}: ${message}`),
  );
  private readonly logger: winston.Logger = createLogger({
    level: 'info',
    format: this.format,
    transports: [new transports.Console()],
  });

  public warn(message: LoggerUtil, cb?: () => unknown) {
    this.logger.warn(JSON.stringify(message), cb);
  }

  public error(message: LoggerUtil, error?: LoggerUtil, cb?: () => unknown) {
    return this.logger.error(`${message}: ${error?.message}: \n ${error?.stack}`, cb);
  }

  public info(message: LoggerUtil, cb?: () => unknown) {
    return this.logger.info(JSON.stringify(message), cb);
  }

  public log(message: LoggerUtil, cb?: () => unknown) {
    return this.logger.log(JSON.stringify(message), cb);
  }

  public debug(message: LoggerUtil, cb?: () => unknown) {
    return this.logger.debug(JSON.stringify(message), cb);
  }
}
export default new Logger();
