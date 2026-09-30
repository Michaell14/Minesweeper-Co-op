/** Rate-limits a function. Used on hover events to keep them off the wire. */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
    let inThrottle: boolean;
    let lastFunc: ReturnType<typeof setTimeout>;
    let lastRan: number;

    const throttled = function(this: any, ...args: Parameters<T>) {
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

    throttled.cancel = () => {
        clearTimeout(lastFunc);
        inThrottle = false;
    };
    return throttled;
}
