// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ButtonLink from './ButtonLink';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('next/link', () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props} href={href} onClick={(event) => {
            event.preventDefault();
            navigate(href);
            props.onClick?.(event);
        }}>{children}</a>
    ),
}));

test('ordinary navigation keeps client routing, while session-changing links leave navigation to the browser', () => {
    const nativeClick = vi.fn();
    render(<div onClick={(event) => {
        // Prevent jsdom navigation after checking whether the link intercepted
        // it. In a browser this unhandled activation loads a fresh document.
        if ((event.target as HTMLElement).textContent === 'Join room') nativeClick(event.defaultPrevented);
        event.preventDefault();
    }}>
        <ButtonLink href="/daily">Daily challenge</ButtonLink>
        <ButtonLink href="/?room=Calm-Otter" reloadDocument>Join room</ButtonLink>
    </div>);

    fireEvent.click(screen.getByRole('link', { name: 'Daily challenge' }));
    expect(navigate).toHaveBeenCalledWith('/daily');
    navigate.mockClear();

    const join = screen.getByRole('link', { name: 'Join room' });
    expect(join.getAttribute('href')).toBe('/?room=Calm-Otter');
    fireEvent.click(join);
    expect(navigate).not.toHaveBeenCalled();
    expect(nativeClick).toHaveBeenCalledWith(false);
});
