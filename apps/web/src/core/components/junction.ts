/** Shared p-n junction helpers used by both the diode and BJT models. */

/** Voltage above which exp() starts growing too fast for the linearization to jump to safely. */
export function criticalVoltage(is: number, vt: number): number {
  return vt * Math.log(vt / (Math.SQRT2 * is));
}

/**
 * Standard SPICE junction voltage limiting: instead of accepting the raw
 * Newton-predicted junction voltage (which can imply an astronomically large
 * current and blow up the next iteration), damp large forward-voltage jumps
 * logarithmically so the iteration climbs toward the real operating point
 * over a few steps instead of overshooting or oscillating.
 */
export function limitVoltage(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vcrit;
  }
  return vnew;
}
