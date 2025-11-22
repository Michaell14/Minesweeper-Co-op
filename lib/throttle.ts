/**
 * Throttle function to limit the rate at which a function can fire
 * Used for hover events to prevent network spam
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    let lastFunc: ReturnType<typeof setTimeout>;
    let lastRan: number;

    return function(this: any, ...args: Parameters<T>) {
        if (!inThrottle) {
            func.apply(this, args);
            lastRan = Date.now();
            inThrottle = true;
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(this, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

/**
 * Generate a deterministic color from a string (socket ID)
 * Returns a pastel color with good visibility
 */
export function generateColorFromId(id: string): string {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Generate HSL color with:
    // - Hue: distributed across color wheel
    // - Saturation: 60-70% for vibrant but not overwhelming
    // - Lightness: 75-85% for pastel effect
    const hue = Math.abs(hash % 360);
    const saturation = 60 + (Math.abs(hash) % 10);
    const lightness = 75 + (Math.abs(hash >> 8) % 10);
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

