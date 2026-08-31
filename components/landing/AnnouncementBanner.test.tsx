// @vitest-environment jsdom
/**
 * The strip above the title. It shipped once with copy hardcoded to a release
 * four weeks and five entries old, and with a dismissal that lasted until the
 * next reload — both silent, both what these cover.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AnnouncementBanner from './AnnouncementBanner';
import { LATEST_ENTRY } from '@/lib/changelog';

const BANNER_KEY = 'minesweeper_banner_dismissed';
const NAME = /what's new/i;

beforeEach(() => localStorage.clear());
afterEach(() => {
    cleanup();
    localStorage.clear();
});

const strip = () => screen.queryByRole('region', { name: NAME });

describe('AnnouncementBanner', () => {
    it('draws the newest changelog entry rather than hardcoded copy', () => {
        render(<AnnouncementBanner />);
        const text = strip()?.textContent ?? '';
        expect(text).toContain(LATEST_ENTRY!.title);
        expect(text).toContain(LATEST_ENTRY!.bullets[0]);
    });

    it('links to the changelog', () => {
        render(<AnnouncementBanner />);
        expect(
            screen.getByRole('link', { name: /see what's new/i }).getAttribute('href'),
        ).toBe('/changelog');
    });

    it('stays gone after dismissal, across a remount', () => {
        render(<AnnouncementBanner />);
        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
        expect(strip()).toBeNull();

        cleanup();
        render(<AnnouncementBanner />);
        expect(strip()).toBeNull();
    });

    it('comes back when a newer entry lands', () => {
        localStorage.setItem(BANNER_KEY, 'some-older-entry');
        render(<AnnouncementBanner />);
        expect(strip()).toBeTruthy();
    });
});
