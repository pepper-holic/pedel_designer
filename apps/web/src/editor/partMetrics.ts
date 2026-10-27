/** Half-extent of a part's invisible body hit-box, shared by the part itself, its selection outline,
 * block regions, and collapsed-block sizing. Kept in a plain module (not CanvasPart.tsx) so non-UI
 * geometry can use it without importing a component. */
export const PART_HALF_WIDTH = 40;
export const PART_HALF_HEIGHT = 38;
