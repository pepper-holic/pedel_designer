/**
 * Modified Nodal Analysis matrix: rows 0..numNodes-1 are KCL equations at
 * each non-ground node; rows numNodes..size-1 are the constraint equations
 * for branch-current unknowns (voltage sources, op-amps). Ground is not a
 * variable (node index -1 is dropped by every stamp helper).
 */
export class MnaSystem {
  readonly size: number;
  readonly A: Float64Array;
  readonly z: Float64Array;

  constructor(size: number) {
    this.size = size;
    this.A = new Float64Array(size * size);
    this.z = new Float64Array(size);
  }

  private addA(row: number, col: number, value: number): void {
    if (row < 0 || col < 0) return;
    this.A[row * this.size + col] += value;
  }

  private addZ(row: number, value: number): void {
    if (row < 0) return;
    this.z[row] += value;
  }

  /**
   * Low-level entry points for multi-terminal nonlinear devices (e.g. BJT)
   * whose Jacobian isn't a simple two-terminal conductance. Prefer the
   * dedicated stampX helpers when a device fits their shape.
   */
  stampMatrixEntry(row: number, col: number, value: number): void {
    this.addA(row, col, value);
  }

  stampRhsEntry(row: number, value: number): void {
    this.addZ(row, value);
  }

  /** Stamps a linear conductance g between nodes p and n (either may be -1 for ground). */
  stampConductance(p: number, n: number, g: number): void {
    this.addA(p, p, g);
    this.addA(n, n, g);
    this.addA(p, n, -g);
    this.addA(n, p, -g);
  }

  /** Injects `current` amps into `nodeInto`, drawn from `nodeFrom` (Norton-equivalent source). */
  stampCurrentSource(nodeInto: number, nodeFrom: number, current: number): void {
    this.addZ(nodeInto, current);
    this.addZ(nodeFrom, -current);
  }

  /** Stamps an independent voltage source using its pre-assigned branch unknown. */
  stampVoltageSource(branch: number, p: number, n: number, voltage: number): void {
    this.addA(branch, p, 1);
    this.addA(branch, n, -1);
    this.addA(p, branch, 1);
    this.addA(n, branch, -1);
    this.addZ(branch, voltage);
  }

  /**
   * Stamps an ideal op-amp (nullor) using ports [inPlus, inMinus, out] and a
   * branch unknown carrying the output current: enforces V(inPlus) = V(inMinus)
   * and lets the branch current flow freely into the output node.
   */
  stampIdealOpAmp(branch: number, inPlus: number, inMinus: number, out: number): void {
    this.addA(branch, inPlus, 1);
    this.addA(branch, inMinus, -1);
    this.addA(out, branch, 1);
  }

  /** Solves Ax = z via Gaussian elimination with partial pivoting. Mutates nothing external. */
  solve(): Float64Array<ArrayBuffer> {
    const n = this.size;
    const A = Float64Array.from(this.A);
    const z = Float64Array.from(this.z);

    for (let col = 0; col < n; col++) {
      let pivotRow = col;
      let pivotMagnitude = Math.abs(A[col * n + col]);
      for (let row = col + 1; row < n; row++) {
        const magnitude = Math.abs(A[row * n + col]);
        if (magnitude > pivotMagnitude) {
          pivotMagnitude = magnitude;
          pivotRow = row;
        }
      }
      if (pivotMagnitude < 1e-15) {
        throw new Error(`Singular MNA matrix at column ${col} (check for floating nodes)`);
      }
      if (pivotRow !== col) {
        for (let k = 0; k < n; k++) {
          const tmp = A[col * n + k];
          A[col * n + k] = A[pivotRow * n + k];
          A[pivotRow * n + k] = tmp;
        }
        const tmpZ = z[col];
        z[col] = z[pivotRow];
        z[pivotRow] = tmpZ;
      }

      const pivot = A[col * n + col];
      for (let row = col + 1; row < n; row++) {
        const factor = A[row * n + col] / pivot;
        if (factor === 0) continue;
        for (let k = col; k < n; k++) {
          A[row * n + k] -= factor * A[col * n + k];
        }
        z[row] -= factor * z[col];
      }
    }

    const x = new Float64Array(n);
    for (let row = n - 1; row >= 0; row--) {
      let sum = z[row];
      for (let col = row + 1; col < n; col++) {
        sum -= A[row * n + col] * x[col];
      }
      x[row] = sum / A[row * n + row];
    }
    return x;
  }
}
