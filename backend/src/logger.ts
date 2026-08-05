export function log(scope: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [${scope}] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [${scope}] ${message}`);
  }
}
