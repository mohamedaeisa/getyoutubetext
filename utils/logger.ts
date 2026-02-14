interface LogContext {
  requestId?: string;
  [key: string]: unknown;
}

function formatContext(context?: LogContext): string {
  if (!context) return '';
  return JSON.stringify(context);
}

export const logger = {
  info(message: string, context?: LogContext) {
    console.info(`[youtube-transcript-module] ${message} ${formatContext(context)}`);
  },
  warn(message: string, context?: LogContext) {
    console.warn(`[youtube-transcript-module] ${message} ${formatContext(context)}`);
  },
  error(message: string, context?: LogContext) {
    console.error(`[youtube-transcript-module] ${message} ${formatContext(context)}`);
  },
};
