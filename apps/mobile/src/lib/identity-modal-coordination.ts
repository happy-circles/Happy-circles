import { scheduleAfterVisualFrame } from './visual-transition';

export const IDENTITY_MODAL_DISMISS_TIMEOUT_MS = 1_000;

export interface IdentityModalPresentation {
  readonly ready: Promise<boolean>;
  readonly closed: Promise<void>;
  readonly release: () => void;
  readonly closing: (waitForNativeDismiss: boolean) => Promise<void>;
}

export interface ActionFeedbackModalRegistration {
  readonly presented: () => void;
  readonly dismissed: () => void;
  readonly unregister: () => void;
}

interface PresentationState {
  readonly id: number;
  readonly awaiting: Set<symbol>;
  readonly ready: Promise<boolean>;
  readonly closed: Promise<void>;
  readonly resolveReady: (ready: boolean) => void;
  readonly resolveClosed: () => void;
  readySettled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  cancelClosing: (() => void) | null;
}

/** Serializes native modal presentation without imposing a delay when nothing is open. */
export class IdentityModalCoordinator {
  private readonly feedbackModals = new Set<symbol>();
  private readonly listeners = new Set<() => void>();
  private sequence = 0;
  private presentation: PresentationState | null = null;

  readonly isSuspended = (): boolean => this.presentation !== null;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private settleReady(presentation: PresentationState, ready: boolean): void {
    if (presentation.readySettled) return;
    presentation.readySettled = true;
    if (presentation.timer) clearTimeout(presentation.timer);
    presentation.timer = null;
    presentation.resolveReady(ready);
  }

  registerFeedbackModal(): ActionFeedbackModalRegistration {
    const id = Symbol('feedback-modal');
    const dismissed = () => {
      this.feedbackModals.delete(id);
      const presentation = this.presentation;
      if (!presentation || !presentation.awaiting.delete(id)) return;
      if (presentation.awaiting.size === 0) this.settleReady(presentation, true);
    };
    return {
      presented: () => this.feedbackModals.add(id),
      dismissed,
      unregister: () => {
        this.feedbackModals.delete(id);
        const presentation = this.presentation;
        // Removing the React host cannot acknowledge completion of an iOS native dismissal.
        if (presentation?.awaiting.has(id)) this.settleReady(presentation, false);
      },
    };
  }

  begin(): IdentityModalPresentation {
    if (this.presentation) {
      return {
        ready: Promise.resolve(false),
        closed: Promise.resolve(),
        release: () => undefined,
        closing: () => Promise.resolve(),
      };
    }

    let resolveReady!: (ready: boolean) => void;
    let resolveClosed!: () => void;
    const presentation: PresentationState = {
      id: ++this.sequence,
      awaiting: new Set(this.feedbackModals),
      ready: new Promise<boolean>((resolve) => {
        resolveReady = resolve;
      }),
      closed: new Promise<void>((resolve) => {
        resolveClosed = resolve;
      }),
      resolveReady: (ready) => resolveReady(ready),
      resolveClosed: () => resolveClosed(),
      readySettled: false,
      timer: null,
      cancelClosing: null,
    };
    this.presentation = presentation;
    if (presentation.awaiting.size === 0) this.settleReady(presentation, true);
    else {
      presentation.timer = setTimeout(
        () => this.settleReady(presentation, false),
        IDENTITY_MODAL_DISMISS_TIMEOUT_MS,
      );
    }
    this.notify();

    const release = () => {
      if (this.presentation?.id !== presentation.id) return;
      this.settleReady(presentation, false);
      presentation.cancelClosing?.();
      presentation.cancelClosing = null;
      this.presentation = null;
      presentation.resolveClosed();
      this.notify();
    };

    return {
      ready: presentation.ready,
      closed: presentation.closed,
      release,
      closing: (waitForNativeDismiss) => {
        if (this.presentation?.id !== presentation.id || presentation.cancelClosing)
          return presentation.closed;
        if (waitForNativeDismiss) {
          const timer = setTimeout(release, IDENTITY_MODAL_DISMISS_TIMEOUT_MS);
          presentation.cancelClosing = () => clearTimeout(timer);
        } else {
          presentation.cancelClosing = scheduleAfterVisualFrame(release);
        }
        return presentation.closed;
      },
    };
  }
}

export const identityModalCoordinator = new IdentityModalCoordinator();

export function beginIdentityConfirmationPresentation(): IdentityModalPresentation {
  return identityModalCoordinator.begin();
}
