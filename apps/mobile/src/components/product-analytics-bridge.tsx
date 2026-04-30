import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useSegments } from 'expo-router';

import type { AnalyticsScreenName } from '@happy-circles/shared';

import {
  createAnalyticsClientSessionId,
  recordProductEventSafe,
  resetProductAnalyticsSession,
  startProductAnalyticsSession,
} from '@/lib/analytics-client';
import { getCurrentAppVersion } from '@/lib/device-trust';
import { useSession } from '@/providers/session-provider';

function screenNameFromSegments(segments: readonly string[]): AnalyticsScreenName {
  const visibleSegments = segments.filter((segment) => !segment.startsWith('('));
  const [first, second] = visibleSegments;

  if (!first || first === 'index') {
    return 'home';
  }

  if (first === 'advanced' && second === 'audit') {
    return 'advanced_audit';
  }

  if (first === 'balance' && second === 'analytics') {
    return 'balance_analytics';
  }

  if (first === 'balance') {
    return 'balance_overview';
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

export function ProductAnalyticsBridge() {
  const session = useSession();
  const segments = useSegments();
  const clientSessionIdRef = useRef(createAnalyticsClientSessionId());
  const lastScreenRouteRef = useRef<string | null>(null);
  const [analyticsSessionId, setAnalyticsSessionId] = useState<string | null>(null);
  const screenName = useMemo(() => screenNameFromSegments(segments), [segments]);
  const route = useMemo(() => routeFromSegments(segments), [segments]);

  useEffect(() => {
    if (!session.isSignedIn || !session.userId || !session.currentDeviceId) {
      resetProductAnalyticsSession();
      setAnalyticsSessionId(null);
      lastScreenRouteRef.current = null;
      clientSessionIdRef.current = createAnalyticsClientSessionId();
      return;
    }

    let active = true;
    void startProductAnalyticsSession({
      clientSessionId: clientSessionIdRef.current,
      platform: Platform.OS,
      appVersion: getCurrentAppVersion(),
      deviceId: session.currentDeviceId,
      startedAt: new Date().toISOString(),
    })
      .then((sessionId) => {
        if (active) {
          setAnalyticsSessionId(sessionId);
        }
      })
      .catch((error) => {
        console.warn(
          'Failed to start product analytics session',
          error instanceof Error ? error.message : String(error),
        );
      });

    return () => {
      active = false;
    };
  }, [session.currentDeviceId, session.isSignedIn, session.userId]);

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
    if (!analyticsSessionId) {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        recordProductEventSafe({
          eventName: 'app_backgrounded',
          screenName,
          metadata: { route },
        });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [analyticsSessionId, route, screenName]);

  return null;
}
