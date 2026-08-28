import type { PartInstance } from "./types";

/**
 * Schematic symbols drawn in the local coordinate frame of their part
 * (parent <g> already translates to part.x/part.y) so their leads land
 * exactly on the terminal dx/dy declared in partDefs.ts.
 */

const stroke = "var(--text)";

function ResistorSymbol() {
  return <path d="M-30,0 h8 l5,-10 l10,20 l10,-20 l10,20 l10,-20 l5,10 h8" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinejoin="round" />;
}

function CapacitorSymbol() {
  return (
    <>
      <path d="M-30,0 h22 M8,0 h22" stroke={stroke} strokeWidth={1.6} fill="none" />
      <path d="M-8,-14 v28 M8,-14 v28" stroke={stroke} strokeWidth={1.6} fill="none" />
    </>
  );
}

function InductorSymbol() {
  return (
    <path
      d="M-30,0 h6 a6,6 0 0 1 12,0 a6,6 0 0 1 12,0 a6,6 0 0 1 12,0 h6"
      stroke={stroke}
      strokeWidth={1.6}
      fill="none"
    />
  );
}

function DiodeSymbol() {
  return (
    <>
      <path d="M-30,0 h22 M8,0 h22" stroke={stroke} strokeWidth={1.6} fill="none" />
      <path d="M-8,-12 v24 l16,-12 z" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
      <path d="M8,-12 v24" stroke={stroke} strokeWidth={1.6} fill="none" />
    </>
  );
}

function BjtSymbol({ polarity }: { polarity: string }) {
  const arrowIn = polarity === "pnp";
  return (
    <>
      <circle cx={0} cy={0} r={24} stroke={stroke} strokeWidth={1.4} fill="none" />
      <path d="M-8,-14 v28" stroke={stroke} strokeWidth={1.6} fill="none" />
      <path d="M-8,-8 L14,-20 M-8,8 L14,22" stroke={stroke} strokeWidth={1.6} fill="none" />
      {arrowIn ? (
        <path d="M-2,4 l-8,4 l3,-8" stroke={stroke} strokeWidth={1.4} fill="none" strokeLinejoin="round" />
      ) : (
        <path d="M14,-20 l-7,-1 M14,-20 l-1,7" stroke={stroke} strokeWidth={1.4} fill="none" strokeLinejoin="round" />
      )}
    </>
  );
}

function JfetSymbol() {
  return (
    <>
      <circle cx={0} cy={0} r={24} stroke={stroke} strokeWidth={1.4} fill="none" />
      <path d="M-8,-16 v32" stroke={stroke} strokeWidth={1.6} fill="none" />
      <path d="M-8,-14 h22 v-6 M-8,14 h22 v6" stroke={stroke} strokeWidth={1.6} fill="none" />
      <path d="M-16,0 h8 M-20,-4 l-4,4 l4,4" stroke={stroke} strokeWidth={1.4} fill="none" strokeLinejoin="round" />
    </>
  );
}

function OpAmpSymbol() {
  return (
    <>
      <path d="M-24,-24 L-24,24 L24,0 Z" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
      <text x="-19" y="-9" fontSize={11} fontFamily="var(--font-mono)" fill={stroke}>
        +
      </text>
      <text x="-19" y="15" fontSize={11} fontFamily="var(--font-mono)" fill={stroke}>
        −
      </text>
    </>
  );
}

function VsourceSymbol() {
  return (
    <>
      <circle cx={0} cy={0} r={26} stroke={stroke} strokeWidth={1.4} fill="none" />
      <path d="M-13,0 q6.5,-14 13,0 t13,0" stroke={stroke} strokeWidth={1.4} fill="none" />
    </>
  );
}

function GroundSymbol() {
  return <path d="M0,-20 v10 M-14,-10 h28 M-8,-3 h16 M-3,4 h6" stroke={stroke} strokeWidth={1.6} fill="none" />;
}

function PotentiometerSymbol() {
  return (
    <>
      <path d="M-30,0 h8 l5,-10 l10,20 l10,-20 l10,20 l10,-20 l5,10 h8" stroke={stroke} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
      <path d="M0,-24 l-4,10 h8 z" stroke={stroke} strokeWidth={1.4} fill={stroke} strokeLinejoin="round" />
      <path d="M0,-14 v-4" stroke={stroke} strokeWidth={1.4} fill="none" />
    </>
  );
}

/** Renders the schematic symbol for a placed part, in its own local (0,0)-centered coordinate frame. */
export function PartSymbol({ part }: { part: PartInstance }) {
  switch (part.type) {
    case "resistor":
      return <ResistorSymbol />;
    case "capacitor":
      return <CapacitorSymbol />;
    case "inductor":
      return <InductorSymbol />;
    case "diode":
      return <DiodeSymbol />;
    case "bjt":
      return <BjtSymbol polarity={String(part.params.polarity ?? "npn")} />;
    case "jfet":
      return <JfetSymbol />;
    case "opamp":
      return <OpAmpSymbol />;
    case "vsource":
      return <VsourceSymbol />;
    case "ground":
      return <GroundSymbol />;
    case "potentiometer":
      return <PotentiometerSymbol />;
  }
}
