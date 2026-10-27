import { createContext, useContext } from "react";

/** Lets something inside the bottom dock ask for room - a freshly generated board wants to be seen
 * whole, not through a 250px slot. */
export const DockContext = createContext<{ expand: () => void }>({ expand: () => {} });

export const useDock = () => useContext(DockContext);
