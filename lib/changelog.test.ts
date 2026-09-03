// @vitest-environment jsdom
/**
 * The banner's dismissal watermark, kept separate from the changelog's seen
 * watermark: a shared key would clear the star's dot on closing the strip.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    CHANGELOG,
    LATEST_ENTRY,
    dismissBanner,
    hasUnseenEntries,
    isBannerDismissed,
    markChangelogSeen,
} from './changelog';

const BANNER_KEY = 'minesweeper_banner_dismissed';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('LATEST_ENTRY', () => {
    it('is the newest entry, which is what the banner draws', () => {
        expect(LATEST_ENTRY).toBe(CHANGELOG[0]);
    });

    /* Empty fields would render a strip saying nothing. */
    it('carries the tag, title and lede the banner needs', () => {
        expect(LATEST_ENTRY?.tag).toBeTruthy();
        expect(LATEST_ENTRY?.title).toBeTruthy();
        expect(LATEST_ENTRY?.bullets[0]).toBeTruthy();
    });
});

describe('isBannerDismissed', () => {
    it('is false on a browser that has never dismissed one', () => {
        expect(isBannerDismissed()).toBe(false);
    });

    it('is true once this entry has been dismissed', () => {
        dismissBanner();
        expect(isBannerDismissed()).toBe(true);
    });

    /* Keyed on the id, not a boolean, so a new release can speak to someone who closed the last. */
    it('is false again once a newer entry lands', () => {
        localStorage.setItem(BANNER_KEY, 'some-older-entry');
        expect(isBannerDismissed()).toBe(false);
    });

    it('survives storage being unavailable', () => {
        const getItem = Storage.prototype.getItem;
        Storage.prototype.getItem = () => {
            throw new Error('blocked');
        };
        try {
            expect(isBannerDismissed()).toBe(false);
        } finally {
            Storage.prototype.getItem = getItem;
        }
    });
});

/* Dismissing is not reading. */
describe('the two watermarks are independent', () => {
    it('dismissing the banner leaves the changelog unseen', () => {
        dismissBanner();
        expect(hasUnseenEntries()).toBe(true);
    });

    it('reading the changelog leaves the banner showing', () => {
        markChangelogSeen();
        expect(isBannerDismissed()).toBe(false);
    });
});
