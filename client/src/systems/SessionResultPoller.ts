import { getSessionResult } from './ApiClient';
import type { ResultResponse } from '../types';

/** 진행 상태를 직렬 조회하며 화면 이탈 시 요청과 이벤트를 정리한다. */
export class SessionResultPoller {
  private stopped = false;
  private request?: AbortController;
  private interval: ReturnType<typeof setInterval>;
  private wake = () => {
    if (document.hidden || !navigator.onLine) {
      this.request?.abort();
    } else {
      this.request?.abort();
      this.request = undefined;
      void this.refresh();
    }
  };

  constructor(private sessionId: string,
    private onResult: (result: ResultResponse) => void,
    private onError: (error: unknown) => void) {
    document.addEventListener('visibilitychange', this.wake);
    window.addEventListener('online', this.wake);
    window.addEventListener('offline', this.wake);
    this.interval = setInterval(() => void this.refresh(), 2000);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.stopped || this.request || document.hidden || !navigator.onLine) return;
    const request = new AbortController();
    this.request = request;
    const timeout = setTimeout(() => {
      request.abort();
      if (!this.stopped && this.request === request && !document.hidden && navigator.onLine) {
        this.onError(new Error('서버 응답 시간이 초과됐어요.'));
      }
    }, 10000);
    try {
      const result = await getSessionResult(this.sessionId, request.signal);
      if (!this.stopped && !request.signal.aborted) this.onResult(result);
    } catch (error) {
      if (!this.stopped && !request.signal.aborted) this.onError(error);
    } finally {
      clearTimeout(timeout);
      if (this.request === request) this.request = undefined;
    }
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.interval);
    this.request?.abort();
    document.removeEventListener('visibilitychange', this.wake);
    window.removeEventListener('online', this.wake);
    window.removeEventListener('offline', this.wake);
  }
}
