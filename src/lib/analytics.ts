/**
 * Send a Google Analytics event from client-side scripts.
 * Does nothing when analytics is disabled (no Measurement ID set).
 * Events show up in GA4 under Reports → Engagement → Events.
 */
export function track(event: string, params: Record<string, string | number | boolean> = {}) {
  window.gtag?.('event', event, params);
}
