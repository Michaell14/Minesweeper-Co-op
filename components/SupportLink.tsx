import React from 'react';
import { CoffeeIcon } from '@/components/ds';
import { SUPPORT_URL } from '@/lib/site';

export interface SupportLinkProps {
    /** Type size and ink — the link reads as part of whatever text it sits in. */
    className?: string;
    iconSize?: number;
}

/**
 * The tip-jar link. A plain anchor that leaves the site in a new tab, so a
 * game in progress is never navigated away from. One component for every
 * placement: the wording and the destination stay the same wherever it shows.
 */
export default function SupportLink({ className = 'text-pixel-sm', iconSize = 20 }: SupportLinkProps) {
    return (
        <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 underline ${className}`}>
            <CoffeeIcon size={iconSize} />
            Buy me a coffee
        </a>
    );
}
