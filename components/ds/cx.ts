/**
 * Join class names, dropping anything falsy. Deliberately not a dependency —
 * nothing here needs conditional-object syntax, so this is the whole requirement.
 */
export const cx = (...parts: Array<string | false | null | undefined>): string =>
    parts.filter(Boolean).join(" ");
