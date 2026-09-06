import type { PartInstance } from "./types";

/**
 * Schematic symbols drawn in the local coordinate frame of their part
 * (parent <g> already translates to part.x/part.y) so their leads land
 * exactly on the terminal dx/dy declared in partDefs.ts.
 */

const stroke = "var(--text)";

/** Keeps a stored position inside the switch's real range so a stale or hand-edited value can't
 * make the symbol read an undefined contact. Mirrors the same clamp in netlistFromGraph. */
function clampPosition(raw: number | string, positionCount: number): number {
  const value = Math.trunc(Number(raw));
  return Number.isFinite(value) && value >= 0 && value < positionCount ? value : 0;
}

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

/** Pickup: a bobbin outline with pole pieces, plus the coil winding on its hot lead - reads as
 * "coil with magnets" rather than a plain inductor, which it electrically almost is. */
function PickupSymbol() {
  return (
    <>
      <path d="M-30,0 h8 M22,0 h8" stroke={stroke} strokeWidth={1.6} fill="none" />
      <rect x={-22} y={-14} width={30} height={28} rx={3} stroke={stroke} strokeWidth={1.6} fill="none" />
      <circle cx={-14} cy={0} r={2.2} fill={stroke} />
      <circle cx={-7} cy={0} r={2.2} fill={stroke} />
      <circle cx={0} cy={0} r={2.2} fill={stroke} />
      <path d="M8,0 h2 a3,3 0 0 1 6,0 a3,3 0 0 1 6,0" stroke={stroke} strokeWidth={1.4} fill="none" />
    </>
  );
}

/** Switch lever: the blade swings between contacts, so the drawn position is the actual state -
 * the schematic tells you which way the switch is thrown without opening the inspector. */
function SwitchBlade({ x1, y1, closed }: { x1: number; y1: number; closed: boolean }) {
  return <path d={`M-14,0 L${closed ? x1 : x1 - 4},${closed ? y1 : y1 - 10}`} stroke={stroke} strokeWidth={1.8} fill="none" strokeLinecap="round" />;
}

function SpstSymbol({ closed }: { closed: boolean }) {
  return (
    <>
      <path d="M-30,0 h16 M14,0 h16" stroke={stroke} strokeWidth={1.6} fill="none" />
      <circle cx={-14} cy={0} r={2.4} fill={stroke} />
      <circle cx={14} cy={0} r={2.4} fill={stroke} />
      <SwitchBlade x1={14} y1={0} closed={closed} />
    </>
  );
}

function SpdtSymbol({ position }: { position: number }) {
  return (
    <>
      <path d="M-30,0 h16 M14,-16 h16 M14,16 h16" stroke={stroke} strokeWidth={1.6} fill="none" />
      <circle cx={-14} cy={0} r={2.4} fill={stroke} />
      <circle cx={14} cy={-16} r={2.4} fill={stroke} />
      <circle cx={14} cy={16} r={2.4} fill={stroke} />
      <path
        d={position === 1 ? "M-14,0 L14,16" : "M-14,0 L14,-16"}
        stroke={stroke}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function DpdtSymbol({ position }: { position: number }) {
  return (
    <>
      {[-20, 20].map((offset) => (
        <g key={offset} transform={`translate(0,${offset})`}>
          <path d="M-30,0 h16 M14,-12 h16 M14,12 h16" stroke={stroke} strokeWidth={1.6} fill="none" />
          <circle cx={-14} cy={0} r={2.2} fill={stroke} />
          <circle cx={14} cy={-12} r={2.2} fill={stroke} />
          <circle cx={14} cy={12} r={2.2} fill={stroke} />
          <path
            d={position === 1 ? "M-14,0 L14,12" : "M-14,0 L14,-12"}
            stroke={stroke}
            strokeWidth={1.7}
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ))}
      {/* Dashed tie bar: the two poles are ganged to one lever. */}
      <path d="M0,-14 v28" stroke={stroke} strokeWidth={1} strokeDasharray="3 3" fill="none" opacity={0.7} />
    </>
  );
}

/** Blade selector: contacts down the right-hand side with the wiper resting on the selected one,
 * or halfway between two when the detent bridges both. Drawn from the live position so the
 * schematic shows which pickups are actually selected. */
function BladeSymbol({ position, contactYs }: { position: number; contactYs: number[] }) {
  const primary = Math.floor(position / 2);
  const bridges = position % 2 === 1;
  const targetY = bridges ? (contactYs[primary] + contactYs[primary + 1]) / 2 : contactYs[primary];
  return (
    <>
      <path d="M-30,0 h16" stroke={stroke} strokeWidth={1.6} fill="none" />
      <circle cx={-14} cy={0} r={2.4} fill={stroke} />
      {contactYs.map((y) => (
        <g key={y}>
          <path d={`M14,${y} h16`} stroke={stroke} strokeWidth={1.6} fill="none" />
          <circle cx={14} cy={y} r={2.2} fill={stroke} />
        </g>
      ))}
      <path d={`M-14,0 L12,${targetY}`} stroke={stroke} strokeWidth={1.8} fill="none" strokeLinecap="round" />
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
    case "pickup":
      return <PickupSymbol />;
    case "spst":
      return <SpstSymbol closed={Number(part.params.switchPosition) === 1} />;
    case "spdt":
      return <SpdtSymbol position={Number(part.params.switchPosition) === 1 ? 1 : 0} />;
    case "dpdt":
      return <DpdtSymbol position={Number(part.params.switchPosition) === 1 ? 1 : 0} />;
    case "blade3":
      return <BladeSymbol position={clampPosition(part.params.switchPosition, 3)} contactYs={[-18, 18]} />;
    case "blade5":
      return <BladeSymbol position={clampPosition(part.params.switchPosition, 5)} contactYs={[-24, 0, 24]} />;
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
