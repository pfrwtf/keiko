export class Logger {
  private static instance: Logger;
  private isEnabled: boolean;

  private constructor(isEnabled: boolean) {
    this.isEnabled = isEnabled;
  }

  static initialize(env: { LOGGING?: string }): Logger {
    if (!Logger.instance) {
      const isEnabled = env.LOGGING === 'true' || env.LOGGING === '1';
      Logger.instance = new Logger(isEnabled);
    }
    return Logger.instance;
  }

  info(context: string, message: string, data?: any) {
    if (!this.isEnabled) return;
    
    const logData = {
      timestamp: new Date().toISOString(),
      context,
      message,
      ...(data && { data })
    };
    
    console.log(JSON.stringify(logData));
  }

  error(context: string, message: string, error?: any) {
    if (!this.isEnabled) return;
    
    const logData = {
      timestamp: new Date().toISOString(),
      context,
      message,
      error: error?.message || error,
      stack: error?.stack
    };
    
    console.error(JSON.stringify(logData));
  }
}