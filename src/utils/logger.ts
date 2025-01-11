export class Logger {
  private static instance: Logger;
  private isEnabled: boolean;

  private constructor(isEnabled: boolean) {
    this.isEnabled = isEnabled;
  }

  static initialize(env: Record<string, any>): Logger {
    if (!Logger.instance) {
      const isEnabled = env?.LOGGING === 'true' || env?.LOGGING === '1';
      Logger.instance = new Logger(isEnabled);
    }
    return Logger.instance;
  }

  info(context: string, message: string, data?: any) {
    if (!this.isEnabled) return;
    
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      context,
      message,
      ...(data ? { data } : {})
    }));
  }

  error(context: string, message: string, error?: any) {
    if (!this.isEnabled) return;
    
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      context,
      message,
      ...(error ? {
        error: error instanceof Error ? error.message : error,
        ...(error instanceof Error && error.stack ? { stack: error.stack } : {})
      } : {})
    }));
  }
}