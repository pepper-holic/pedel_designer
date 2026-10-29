import { useMemo, useState } from "react";
import type { PedalPreset, PresetCategory, PresetVariant } from "../core/library/presets";
import { BLOCK_DEFS, BLOCK_CATEGORY_LABELS, BLOCK_CATEGORY_ORDER, type BlockDef } from "./blocks";
import type { UserBlock } from "./userBlocks";
import { WIRING_CATEGORY_ORDER, type WiringPreset } from "./wiring";
import { Icon } from "../ui/Icon";
import { LibraryRow } from "./library/LibraryRow";
import { LibraryGroup } from "./library/LibraryGroup";
import { presetMotif } from "../core/library/presetMotifs";
import { KIT_FAMILY_ORDER, kitFamilyOf } from "./library/kitFamilies";
import "./library/library.css";

interface LibraryExplorerProps {
  presets: PedalPreset[];
  wiringPresets: WiringPreset[];
  loadedPresetId: string | null;
  onLoadTemplate: (preset: PedalPreset, variant?: PresetVariant) => void;
  onLoadWiring: (preset: WiringPreset) => void;
  onAddBlock: (def: BlockDef) => void;
  userBlocks?: { items: UserBlock[]; onAdd: (ub: UserBlock) => void; onDelete: (id: string) => void };
  /** Which top-level sections to show (default all) - the library panel splits them into tabs. */
  sections?: TopSection[];
  /** The search text, when the panel owns the search box; otherwise the explorer shows its own. */
  query?: string;
}

export type TopSection = "presets" | "wiring" | "blocks";
const ALL_SECTIONS: TopSection[] = ["presets", "wiring", "blocks"];
type PreviewItem = { label: string; description: string; archive?: boolean };

/** Signal-chain-ish display order, not alphabetical, so the tree reads the way a pedal builder
 * thinks about gain staging. */
const PRESET_CATEGORY_ORDER: PresetCategory[] = ["버퍼", "부스트", "오버드라이브", "디스토션", "퍼즈", "톤/EQ"];

function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true;
  return haystack.toLowerCase().includes(query.toLowerCase());
}

/**
 * Everything you can start a circuit from, as rows: a complete pedal preset or a guitar wiring
 * (loading replaces the circuit) and the library's functional blocks (adding stamps one onto it).
 * A preset modelled on a real pedal shows that pedal's name and enclosure colour ("TS9 스타일",
 * green) instead of its long technical name, so the list reads like a pedalboard; the full
 * description shows in the detail pane under the list for whatever was clicked last. Groups
 * collapse by category, and a search cuts across every group.
 */
export function LibraryExplorer({ presets, wiringPresets, loadedPresetId, onLoadTemplate, onLoadWiring, onAddBlock, userBlocks, sections = ALL_SECTIONS, query: outerQuery }: LibraryExplorerProps) {
  const [ownQuery, setOwnQuery] = useState("");
  const query = outerQuery ?? ownQuery;
  // With one tab per kind, everything shown starts open; the all-in-one view keeps the old default.
  const [collapsedTop, setCollapsedTop] = useState<Set<TopSection>>(new Set(sections.length === ALL_SECTIONS.length ? ["wiring", "blocks"] : ["wiring"]));
  const [collapsedCategory, setCollapsedCategory] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  // Which variant chip to mark active. Cleared whenever a preset is loaded without one, so the
  // highlight never outlives the circuit it describes.
  const [loadedVariantId, setLoadedVariantId] = useState<string | null>(null);
  const isSearching = query.trim().length > 0;

  const filteredPresets = useMemo(() => presets.filter((p) => matchesQuery(`${p.name} ${p.description} ${p.category}`, query)), [presets, query]);
  // Circuits read off DIY kit boards list apart from the hand-written style presets, by family.
  const filteredStyle = filteredPresets.filter((p) => !p.kit);
  const filteredKits = filteredPresets.filter((p) => p.kit);
  const filteredBlocks = useMemo(() => BLOCK_DEFS.filter((b) => matchesQuery(`${b.label} ${b.description}`, query)), [query]);
  const filteredUserBlocks = useMemo(() => (userBlocks?.items ?? []).filter((b) => matchesQuery(`${b.label} ${b.description}`, query)), [userBlocks, query]);
  const filteredWiring = useMemo(() => wiringPresets.filter((p) => matchesQuery(`${p.name} ${p.description} ${p.category}`, query)), [wiringPresets, query]);

  // Every category key that currently has at least one item - used by "모두 접기/펼치기" so it
  // touches exactly the groups actually rendered, not stale keys from a category that ended up empty.
  const allCategoryKeys = useMemo(() => {
    const keys: string[] = [];
    for (const category of PRESET_CATEGORY_ORDER) if (presets.some((p) => !p.kit && p.category === category)) keys.push(`preset:${category}`);
    for (const [family] of KIT_FAMILY_ORDER) if (presets.some((p) => p.kit && kitFamilyOf(p.kit.family) === family)) keys.push(`kit:${family}`);
    for (const category of WIRING_CATEGORY_ORDER) if (wiringPresets.some((p) => p.category === category)) keys.push(`wiring:${category}`);
    for (const category of BLOCK_CATEGORY_ORDER) if (BLOCK_DEFS.some((b) => b.category === category)) keys.push(`block:${category}`);
    return keys;
  }, [presets, wiringPresets]);
  const isAllCollapsed = sections.every((section) => collapsedTop.has(section));

  const toggleAll = () => {
    if (isAllCollapsed) {
      setCollapsedTop(new Set());
      setCollapsedCategory(new Set());
    } else {
      setCollapsedTop(new Set<TopSection>(sections));
      setCollapsedCategory(new Set(allCategoryKeys));
    }
  };
  const toggleIn = <T,>(set: (f: (prev: Set<T>) => Set<T>) => void, key: T) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const topOpen = (section: TopSection) => isSearching || !collapsedTop.has(section);
  const categoryOpen = (key: string) => isSearching || !collapsedCategory.has(key);

  const selectPreset = (preset: PedalPreset, variant?: PresetVariant) => {
    setPreview({ label: variant ? `${preset.name} - ${variant.label}` : preset.name, description: preset.description, archive: !!preset.archive });
    setLoadedVariantId(variant?.id ?? null);
    onLoadTemplate(preset, variant);
  };
  const selectWiring = (preset: WiringPreset) => {
    setPreview({ label: preset.name, description: preset.description, archive: !!preset.archive });
    setLoadedVariantId(null);
    onLoadWiring(preset);
  };
  const selectBlock = (def: BlockDef) => {
    setPreview({ label: def.label, description: def.description });
    onAddBlock(def);
  };
  const selectUserBlock = (ub: UserBlock) => {
    setPreview({ label: ub.label, description: ub.description });
    userBlocks?.onAdd(ub);
  };

  const total = (sections.includes("presets") ? filteredPresets.length : 0) + (sections.includes("wiring") ? filteredWiring.length : 0) + (sections.includes("blocks") ? filteredBlocks.length + filteredUserBlocks.length : 0);
  const nothing = isSearching && total === 0;

  return (
    <div className="library-explorer">
      {outerQuery === undefined && (
        <div className="library-search">
          <Icon name="search" size={14} />
          <input type="search" placeholder="프리셋/블록 검색..." value={ownQuery} onChange={(e) => setOwnQuery(e.target.value)} aria-label="템플릿 검색" />
        </div>
      )}
      <div className="library-scroll">
        <div className="library-toolbar">
          <span className="library-count">{isSearching ? `${total}개 일치` : `${total}개`}</span>
          <button type="button" className="library-collapse-all" onClick={toggleAll}>
            {isAllCollapsed ? "모두 펼치기" : "모두 접기"}
          </button>
        </div>

        {sections.includes("presets") && (
          <LibraryGroup top label="페달 프리셋 (완성된 회로)" count={filteredStyle.length} expanded={topOpen("presets")} onToggle={() => toggleIn(setCollapsedTop, "presets")}>
            {PRESET_CATEGORY_ORDER.map((category) => {
              const items = filteredStyle.filter((p) => p.category === category);
              if (items.length === 0) return null;
              const key = `preset:${category}`;
              return (
                <LibraryGroup key={key} label={category} count={items.length} expanded={categoryOpen(key)} onToggle={() => toggleIn(setCollapsedCategory, key)}>
                  <div className="library-list">
                    {items.map((preset) => {
                      const motif = presetMotif(preset.id);
                      return (
                        <LibraryRow
                          key={preset.id}
                          name={preset.name}
                          primary={motif ? `${motif.name} 스타일` : preset.name}
                          secondary={motif ? preset.category : undefined}
                          color={motif?.color}
                          active={preset.id === loadedPresetId}
                          badge={preset.archive ? "아카이브" : undefined}
                          verb="불러오기"
                          onClick={() => selectPreset(preset)}
                          footer={
                            // Topology branches are always listed rather than revealed on selection -
                            // they are the only way to reach the non-default branch.
                            preset.variants &&
                            preset.variants.map((variant) => (
                              <button
                                key={variant.id}
                                type="button"
                                className={preset.id === loadedPresetId && variant.id === loadedVariantId ? "library-variant-chip active" : "library-variant-chip"}
                                onClick={() => selectPreset(preset, variant)}
                                title={`${preset.name} - ${variant.label}`}
                              >
                                {variant.label}
                              </button>
                            ))
                          }
                        />
                      );
                    })}
                  </div>
                </LibraryGroup>
              );
            })}
          </LibraryGroup>
        )}

        {sections.includes("presets") && filteredKits.length > 0 && (
          <LibraryGroup top label="키트 기판 회로 (페달파츠)" count={filteredKits.length} expanded={topOpen("presets")} onToggle={() => toggleIn(setCollapsedTop, "presets")}>
            {KIT_FAMILY_ORDER.map(([family, label]) => {
              const items = filteredKits.filter((p) => kitFamilyOf(p.kit!.family) === family);
              if (items.length === 0) return null;
              const key = `kit:${family}`;
              return (
                <LibraryGroup key={key} label={label} count={items.length} expanded={categoryOpen(key)} onToggle={() => toggleIn(setCollapsedCategory, key)}>
                  <div className="library-list">
                    {items.map((preset) => (
                      <LibraryRow key={preset.id} name={preset.name} primary={`${preset.kit!.motif} 스타일`} secondary={preset.kit!.kitName} active={preset.id === loadedPresetId} badge="키트" verb="불러오기" onClick={() => selectPreset(preset)} />
                    ))}
                  </div>
                </LibraryGroup>
              );
            })}
          </LibraryGroup>
        )}

        {sections.includes("wiring") && (
          <LibraryGroup top label="기타 배선 (픽업·볼륨·톤)" count={filteredWiring.length} expanded={topOpen("wiring")} onToggle={() => toggleIn(setCollapsedTop, "wiring")}>
            {WIRING_CATEGORY_ORDER.map((category) => {
              const items = filteredWiring.filter((p) => p.category === category);
              if (items.length === 0) return null;
              const key = `wiring:${category}`;
              return (
                <LibraryGroup key={key} label={category} count={items.length} expanded={categoryOpen(key)} onToggle={() => toggleIn(setCollapsedCategory, key)}>
                  <div className="library-list">
                    {items.map((preset) => (
                      <LibraryRow key={preset.id} name={preset.name} primary={preset.name} active={preset.id === loadedPresetId} badge={preset.archive ? "아카이브" : undefined} verb="불러오기" onClick={() => selectWiring(preset)} />
                    ))}
                  </div>
                </LibraryGroup>
              );
            })}
          </LibraryGroup>
        )}

        {sections.includes("blocks") && (
          <LibraryGroup top label="기능 블록 (조립 단위)" count={filteredBlocks.length + filteredUserBlocks.length} expanded={topOpen("blocks")} onToggle={() => toggleIn(setCollapsedTop, "blocks")}>
            {BLOCK_CATEGORY_ORDER.map((category) => {
              const items = filteredBlocks.filter((b) => b.category === category);
              const mine = category === "custom" ? filteredUserBlocks : [];
              if (items.length === 0 && mine.length === 0) return null;
              const key = `block:${category}`;
              return (
                <LibraryGroup key={key} label={category === "custom" ? "내 블록" : BLOCK_CATEGORY_LABELS[category]} count={items.length + mine.length} expanded={categoryOpen(key)} onToggle={() => toggleIn(setCollapsedCategory, key)}>
                  <div className="library-list">
                    {items.map((def) => (
                      <LibraryRow key={def.id} name={def.label} primary={def.label} verb="더하기" onClick={() => selectBlock(def)} />
                    ))}
                    {mine.map((ub) => (
                      <LibraryRow
                        key={ub.id}
                        name={ub.label}
                        primary={ub.label}
                        badge="내 블록"
                        verb="더하기"
                        onClick={() => selectUserBlock(ub)}
                        aside={
                          <button
                            type="button"
                            className="library-row-delete"
                            aria-label={`${ub.label} 내 블록에서 삭제`}
                            title="내 블록에서 삭제"
                            onClick={() => window.confirm(`"${ub.label}"을(를) 내 블록에서 지울까요?`) && userBlocks?.onDelete(ub.id)}
                          >
                            <Icon name="trash" size={12} />
                          </button>
                        }
                      />
                    ))}
                  </div>
                </LibraryGroup>
              );
            })}
          </LibraryGroup>
        )}

        {nothing && <p className="template-empty">"{query}"에 맞는 프리셋/블록이 없습니다.</p>}
      </div>

      {preview && (
        <div className="library-preview-box" aria-live="polite">
          <div className="library-preview-title">
            {preview.label}
            {preview.archive && <span className="library-row-badge">아카이브</span>}
          </div>
          <div className="library-preview-desc">{preview.description}</div>
        </div>
      )}
    </div>
  );
}
