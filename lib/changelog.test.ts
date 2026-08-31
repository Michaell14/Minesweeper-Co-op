// @vitest-environment jsdom
/**
 * The announcement banner's dismissal watermark, and its separation from the
 * changelog's own seen-watermark. Both failures are silent: a shared key would
 * clear the star's unseen dot for someone who only closed a strip they never
 * read, and a missing key brings the banner back on every single load.
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

    /*
     * The banner's copy comes from these three fields. Empty ones would render
     * a strip saying nothing.
     */
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

    /*
     * The whole point of keying on the id rather than a boolean: a release
     * has to be able to speak to someone who closed the last one.
     */
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

/*
 * Dismissing is not reading. Sharing one key would mean closing the strip
 * silently cleared the badge on the changelog icon.
 */
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
