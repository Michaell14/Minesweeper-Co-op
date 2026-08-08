// @vitest-environment jsdom
/**
 * The footer's user icon is two different controls: signed out it is a
 * button opening the sign-in dialog, signed in it is a link to /profile.
 * What fails silently is the accessible name or the href — jsdom can't see
 * the icon, but the name is what screen readers and the smoke suite go by.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/',
}));

// The dialogs under AccountMenu have their own tests; keep this one about
// the cluster.
vi.mock('@/components/AccountMenu', () => ({
    default: () => null,
}));

vi.mock('@/app/store', () => ({
    useMinesweeperStore: (selector: (s: Record<string, unknown>) => unknown) =>
        selector({ playerJoined: false, dailyActive: false }),
}));

import Footer from './Footer';

beforeEach(() => {
    mockUseSession.mockReset();
});

afterEach(cleanup);

describe('the user icon', () => {
    it('signed out: a button that opens the sign-in dialog', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
        render(<Footer />);
        expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull();
    });

    it('signed in: a link straight to the profile', () => {
        mockUseSession.mockReturnValue({ data: { user: {} }, status: 'authenticated' });
        render(<Footer />);
        const link = screen.getByRole('link', { name: 'Profile' }) as HTMLAnchorElement;
        expect(link.getAttribute('href')).toBe('/profile');
        expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    });

    it('session still resolving: a neutral link, never a flash of "Sign in"', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'loading' });
        render(<Footer />);
        const link = screen.getByRole('link', { name: 'Account' }) as HTMLAnchorElement;
        expect(link.getAttribute('href')).toBe('/profile');
        expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
    });
});
