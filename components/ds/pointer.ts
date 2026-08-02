import pixel from "./pixel.module.css";

/**
 * The 8-bit hand cursor class, for the places outside the design system that
 * need it — board cells and the footer's icon buttons. A bare class name rather
 * than a component, because a cell rendered 256 times must stay light.
 */
export const pointerClass: string = pixel.pointer;
