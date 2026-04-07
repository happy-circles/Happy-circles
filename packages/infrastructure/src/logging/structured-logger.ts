import type { LoggerPort } from '@happy-circles/application';

export class StructuredLogger implements LoggerPort {
  public info(event: string, payload: Record<string, unknown> = {}): void {
    console.info(JSON.stringify({ level: 'info', event, ...payload }));
  }

  public error(event: string, payload: Record<string, unknown> = {}): void {
    console.error(JSON.stringify({ level: 'error', event, ...payload }));
  }
}
