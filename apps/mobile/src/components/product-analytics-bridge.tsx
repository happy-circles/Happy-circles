import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useSegments } from 'expo-router';

import type { AnalyticsScreenName } from '@happy-circles/shared';

import {
  createAnalyticsClientSessionId,
  flushProductAnalyticsEvents,
  recordProductEvent,
  recordProductEventSafe,
  resetProductAnalyticsSession,
  startProductAnalyticsSession,
} from '@/lib/analytics-client';
import { getCurrentAppVersion } from '@/lib/device-trust';
import {
  recordPerformanceAppStart,
  recordPerformanceScreenReady,
  setCurrentPerformanceRoute,
} from '@/lib/performance-metrics';
import { setSupportErrorContext } from '@/lib/support-errors';
import { useSession } from '@/providers/session-provider';

function screenNameFromSegments(segments: readonly string[]): AnalyticsScreenName {
  const visibleSegments = segments.filter((segment) => !segment.startsWith('('));
  const [first] = visibleSegments;

  if (!first || first === 'index') {
    return 'home';
  }

  if (first === 'circles') {
    return 'circles';
  }

  if (first === 'person') {
    return 'person_detail';
  }

  if (first === 'settlements') {
    return 'settlement_detail';
  }

  if (first === 'reset-password') {
    return 'reset_password';
  }

  if (first === 'setup-account') {
    return 'setup_account';
  }

  if (first === 'sign-in') {
    return 'auth';
  }

  if (
    first === 'activity' ||
    first === 'home' ||
    first === 'invite' ||
    first === 'join' ||
    first === 'people' ||
    first === 'profile' ||
    first === 'register' ||
    first === 'transactions'
  ) {
    return first;
  }

  return 'unknown';
}

function routeFromSegments(segments: readonly string[]): string {
  const route = segments.join('/');
  return route.length > 0 ? route.slice(0, 120) : 'home';
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function ProductAnalyticsBridge() {
  const session = useSession();
  const segments = useSegments();
  const clientSessionIdRef = useRef(createAnalyticsClientSessionId());
  const lastScreenRouteRef = useRef<string | null>(null);
  const [analyticsSessionId, setAnalyticsSessionId] = useState<string | null>(null);
  const screenName = useMemo(() => screenNameFromSegments(segments), [segments]);
  const route = useMemo(() => routeFromSegments(segments), [segments]);

  useEffect(() => {
    setCurrentPerformanceRoute(route);
    setSupportErrorContext({ route, screenName });
  }, [route, screenName]);

  useEffect(() => {
    if (!session.isSignedIn || !session.userId || !session.currentDeviceId) {
      resetProductAnalyticsSession();
      setAnalyticsSessionId(null);
      lastScreenRouteRef.current = null;
      clientSessionIdRef.current = createAnalyticsClientSessionId();
      return;
    }

    let active = true;

    async function startAnalyticsSession() {
      for (let attempt = 0; active && attempt < 3; attempt += 1) {
        try {
          const sessionId = await startProductAnalyticsSession({
            clientSessionId: clientSessionIdRef.current,
            platform: Platform.OS,
            appVersion: getCurrentAppVersion(),
            deviceId: session.currentDeviceId,
            startedAt: new Date().toISOString(),
          });

          if (!active) {
            return;
          }

          setAnalyticsSessionId(sessionId);
          if (sessionId) {
            return;
          }
        } catch {
          if (active) {
            setAnalyticsSessionId(null);
          }
        }

        if (attempt < 2) {
          await wait(1000 * (attempt + 1));
        }
      }
    }

    void startAnalyticsSession();

    return () => {
      active = false;
    };
  }, [session.currentDeviceId, session.isSignedIn, session.userId]);

  useEffect(() => {
    recordPerformanceAppStart();
  }, []);

  useEffect(() => {
    if (!analyticsSessionId || lastScreenRouteRef.current === route) {
      return;
    }

    lastScreenRouteRef.current = route;
    recordProductEventSafe({
      eventName: 'screen_viewed',
      screenName,
      metadata: { route },
    });
  }, [analyticsSessionId, route, screenName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      recordPerformanceScreenReady({ route, screenName });
    }, 0);

    return () => clearTimeout(timer);
  }, [route, screenName]);

  useEffect(() => {
    if (!analyticsSessionId) {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void flushProductAnalyticsEvents().catch(() => undefined);
      }

      if (nextState === 'background' || nextState === 'inactive') {
        void recordProductEvent({
          eventName: 'app_backgrounded',
          screenName,
          metadata: { route },
        })
          .then(() => flushProductAnalyticsEvents())
          .catch(() => undefined);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [analyticsSessionId, route, screenName]);

  return null;
}
