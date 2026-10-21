'use client';

import { Analytics } from '@vercel/analytics/next';
import { sanitizeAnalyticsEvent } from '@/lib/analytics';

export default function UsageAnalytics() {
    return <Analytics beforeSend={sanitizeAnalyticsEvent} />;
}
