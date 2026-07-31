/**
 * The design system.
 *
 * Import from `@/components/ds` — never from a file inside it. Everything here
 * is driven by the tokens in app/tokens.css, so an alternate palette moves all
 * of it at once and no component carries a colour of its own.
 *
 * Two border treatments, and the distinction is deliberate (see
 * pixel.module.css): controls are notched, regions are boxed.
 */
export { default as Badge } from "./Badge";
export { default as Button } from "./Button";
export { default as Dialog, DialogClose } from "./Dialog";
export { default as Field } from "./Field";
export { default as Input } from "./Input";
export { default as Panel } from "./Panel";
export { default as Switch } from "./Switch";
export { default as Table } from "./Table";
export { RadioCard, RadioCardGroup } from "./RadioCard";
export { CoinIcon, GithubIcon, PaletteIcon, TrophyIcon } from "./icons";
export type { PixelIconProps } from "./icons";
export { pointerClass } from "./pointer";

export type { BadgeIntent, BadgeProps } from "./Badge";
export type { ButtonIntent, ButtonProps, ButtonSize } from "./Button";
export type { DialogProps } from "./Dialog";
export type { FieldProps } from "./Field";
export type { InputProps } from "./Input";
export type { PanelProps } from "./Panel";
export type { SwitchProps } from "./Switch";
export type { TableProps } from "./Table";
export type { RadioCardGroupProps, RadioCardProps } from "./RadioCard";
