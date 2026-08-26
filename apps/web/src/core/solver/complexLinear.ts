export interface ComplexVector {
  re: Float64Array;
  im: Float64Array;
}

/** Complex a/b, both given as (re, im) pairs. */
function cdiv(ar: number, ai: number, br: number, bi: number): [number, number] {
  const denom = br * br + bi * bi;
  return [(ar * br + ai * bi) / denom, (ai * br - ar * bi) / denom];
}

/** Solves the complex linear system Ax = z via Gaussian elimination with partial pivoting (by magnitude). */
export function solveComplexLinear(
  reAIn: Float64Array,
  imAIn: Float64Array,
  reZIn: Float64Array,
  imZIn: Float64Array,
  n: number,
): ComplexVector {
  const reA = Float64Array.from(reAIn);
  const imA = Float64Array.from(imAIn);
  const reZ = Float64Array.from(reZIn);
  const imZ = Float64Array.from(imZIn);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotMag = Math.hypot(reA[col * n + col], imA[col * n + col]);
    for (let row = col + 1; row < n; row++) {
      const mag = Math.hypot(reA[row * n + col], imA[row * n + col]);
      if (mag > pivotMag) {
        pivotMag = mag;
        pivotRow = row;
      }
    }
    if (pivotMag < 1e-15) throw new Error(`Singular complex MNA matrix at column ${col}`);
    if (pivotRow !== col) {
      for (let k = 0; k < n; k++) {
        [reA[col * n + k], reA[pivotRow * n + k]] = [reA[pivotRow * n + k], reA[col * n + k]];
        [imA[col * n + k], imA[pivotRow * n + k]] = [imA[pivotRow * n + k], imA[col * n + k]];
      }
      [reZ[col], reZ[pivotRow]] = [reZ[pivotRow], reZ[col]];
      [imZ[col], imZ[pivotRow]] = [imZ[pivotRow], imZ[col]];
    }

    const pr = reA[col * n + col];
    const pi = imA[col * n + col];
    for (let row = col + 1; row < n; row++) {
      const ar = reA[row * n + col];
      const ai = imA[row * n + col];
      if (ar === 0 && ai === 0) continue;
      const [fr, fi] = cdiv(ar, ai, pr, pi);
      for (let k = col; k < n; k++) {
        const cr = reA[col * n + k];
        const ci = imA[col * n + k];
        reA[row * n + k] -= fr * cr - fi * ci;
        imA[row * n + k] -= fr * ci + fi * cr;
      }
      const zr = reZ[col];
      const zi = imZ[col];
      reZ[row] -= fr * zr - fi * zi;
      imZ[row] -= fr * zi + fi * zr;
    }
  }

  const xre = new Float64Array(n);
  const xim = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sr = reZ[row];
    let si = imZ[row];
    for (let col = row + 1; col < n; col++) {
      const ar = reA[row * n + col];
      const ai = imA[row * n + col];
      sr -= ar * xre[col] - ai * xim[col];
      si -= ai * xre[col] + ar * xim[col];
    }
    const [xr, xi] = cdiv(sr, si, reA[row * n + row], imA[row * n + row]);
    xre[row] = xr;
    xim[row] = xi;
  }
  return { re: xre, im: xim };
}
