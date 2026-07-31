import pixel from "./pixel.module.css";

/**
 * The 8-bit hand cursor class, for the handful of places outside the design
 * system that need it — board cells, and the icon buttons in the footer.
 *
 * Exported as a bare class name rather than a component because the elements
 * that want it (a 40px grid cell rendered 256 times) must stay as light as
 * possible.
 */
export const pointerClass: string = pixel.pointer;
