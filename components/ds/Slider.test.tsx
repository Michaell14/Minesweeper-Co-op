// @vitest-environment jsdom
/**
 * The Slider is a real <input type="range">, so what can silently break is the
 * accessible name and the number round-trip — jsdom can't see the paint.
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Slider from './Slider';

afterEach(cleanup);

describe('Slider', () => {
    it('is a range input reachable by its accessible name', () => {
        render(<Slider value={50} onChange={vi.fn()} aria-label="Sound volume" />);
        const slider = screen.getByRole('slider', { name: 'Sound volume' }) as HTMLInputElement;
        expect(slider.type).toBe('range');
        expect(slider.value).toBe('50');
    });

    it('reports changes as numbers, not strings', () => {
        const onChange = vi.fn();
        render(<Slider value={50} onChange={onChange} aria-label="Sound volume" />);
        fireEvent.change(screen.getByRole('slider', { name: 'Sound volume' }), {
            target: { value: '75' },
        });
        expect(onChange).toHaveBeenCalledWith(75);
    });

    it('passes min/max/step through to the native input', () => {
        render(
            <Slider
                value={40}
                onChange={vi.fn()}
                min={0}
                max={100}
                step={5}
                aria-label="Sound volume"
            />,
        );
        const slider = screen.getByRole('slider', { name: 'Sound volume' }) as HTMLInputElement;
        expect(slider.min).toBe('0');
        expect(slider.max).toBe('100');
        expect(slider.step).toBe('5');
    });
});
