import type { Href, Router } from 'expo-router';

type PushRouter = Pick<Router, 'push'>;
type ReturnRouter = Pick<Router, 'back' | 'canGoBack' | 'dismissTo'>;

export function pushRoute(router: PushRouter, href: Href) {
  router.push(href, { dangerouslySingular: true });
}

export function returnToRoute(router: Pick<Router, 'dismissTo'>, href: Href) {
  router.dismissTo(href);
}

export function backOrReturnTo(router: ReturnRouter, fallbackHref: Href) {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  returnToRoute(router, fallbackHref);
}
