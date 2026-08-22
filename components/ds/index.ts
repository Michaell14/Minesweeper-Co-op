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
export { default as Avatar } from "./Avatar";
export { default as Badge } from "./Badge";
export { default as NameWithAvatar } from "./NameWithAvatar";
export { default as Button } from "./Button";
export { default as ButtonLink } from "./ButtonLink";
export { default as Dialog, DialogClose } from "./Dialog";
export { default as Emote } from "./Emote";
export { default as Field } from "./Field";
export { default as Input } from "./Input";
export { default as Panel } from "./Panel";
export { default as Slider } from "./Slider";
// Sprite and its defs only: the art table and the rect renderer behind them are
// internals, and a caller hand-rolling one would bypass the <use> indirection
// that keeps 512 cells cheap. The /ds catalog reaches past this deliberately.
export { default as Sprite, SpriteDefs } from "./sprites";
export { default as Switch } from "./Switch";
export { default as Table } from "./Table";
export { RadioCard, RadioCardGroup } from "./RadioCard";
export { CalendarIcon, CoinIcon, GearIcon, GithubIcon, StarIcon, SwordsIcon, TrophyIcon, UserIcon, UserSignedInIcon } from "./icons";
export type { PixelIconProps } from "./icons";
export { pointerClass } from "./pointer";

export type { AvatarProps } from "./Avatar";
export type { NameWithAvatarProps } from "./NameWithAvatar";
export type { BadgeIntent, BadgeProps, BadgeSize } from "./Badge";
export type { ButtonIntent, ButtonProps, ButtonSize } from "./Button";
export type { ButtonLinkProps } from "./ButtonLink";
export type { DialogProps } from "./Dialog";
export type { EmoteProps } from "./Emote";
export type { FieldProps } from "./Field";
export type { InputProps } from "./Input";
export type { PanelProps } from "./Panel";
export type { SliderProps } from "./Slider";
export type { SpriteProps } from "./sprites";
export type { SwitchProps } from "./Switch";
export type { TableProps } from "./Table";
export type { RadioCardGroupProps, RadioCardProps } from "./RadioCard";
