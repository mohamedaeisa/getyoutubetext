export interface RetryOptions {
  retries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<{ result: T; attempts: number }> {
  const {
    retries = 3,
    initialDelayMs = 400,
    maxDelayMs = 4_000,
    factor = 2,
    signal,
    shouldRetry = () => true,
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    try {
      const result = await fn();
      return { result, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error, attempt + 1)) {
        break;
      }

      const delay = Math.min(initialDelayMs * Math.pow(factor, attempt), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Retry failed');
}
