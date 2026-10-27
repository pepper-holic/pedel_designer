import { useMemo, useState } from "react";
import type { PedalPreset, PresetCategory, PresetVariant } from "../core/library/presets";
import { BLOCK_DEFS, BLOCK_CATEGORY_LABELS, BLOCK_CATEGORY_ORDER, type BlockDef } from "./blocks";
import type { UserBlock } from "./userBlocks";
import { WIRING_CATEGORY_ORDER, type WiringPreset } from "./wiring";
import { Icon } from "../ui/Icon";

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
 * Merged explorer for the two ways to start a circuit: a complete pedal preset ("특정 페달 프리셋
 * 버전") or an empty, unwired functional block you assemble by hand ("아예 비어있는 기본버전"). Both
 * collapse under one top-level toggle each, with the existing genre/category sub-grouping nested
 * underneath. Item rows show only their name - the full description used to sit inline under every
 * row, which ate most of the sidebar's width; now it only shows in the preview box at the top,
 * populated by whichever item was clicked most recently (loading/adding still happens on that same
 * click, this is purely about where the description text lives).
 */
export function LibraryExplorer({
  presets,
  wiringPresets,
  loadedPresetId,
  onLoadTemplate,
  onLoadWiring,
  onAddBlock,
  userBlocks,
  sections = ALL_SECTIONS,
}: LibraryExplorerProps) {
  const [query, setQuery] = useState("");
  // With one tab per kind, everything shown starts open; the all-in-one view keeps the old default.
  const [collapsedTop, setCollapsedTop] = useState<Set<TopSection>>(new Set(sections.length === ALL_SECTIONS.length ? ["wiring", "blocks"] : ["wiring"]));
  const [collapsedCategory, setCollapsedCategory] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PreviewItem | null>(null);
  // Which variant row to mark active. Cleared whenever a preset is loaded without one, so the
  // highlight never outlives the circuit it describes.
  const [loadedVariantId, setLoadedVariantId] = useState<string | null>(null);
  const isSearching = query.trim().length > 0;

  const filteredPresets = useMemo(() => presets.filter((p) => matchesQuery(`${p.name} ${p.description}`, query)), [presets, query]);
  const filteredBlocks = useMemo(() => BLOCK_DEFS.filter((b) => matchesQuery(`${b.label} ${b.description}`, query)), [query]);
  const filteredUserBlocks = useMemo(() => (userBlocks?.items ?? []).filter((b) => matchesQuery(`${b.label} ${b.description}`, query)), [userBlocks, query]);
  const filteredWiring = useMemo(() => wiringPresets.filter((p) => matchesQuery(`${p.name} ${p.description}`, query)), [wiringPresets, query]);

  // Every category key that currently has at least one item - used by "모두 접기/펼치기" so it
  // touches exactly the groups actually rendered, not stale keys from a category that ended up empty.
  const allCategoryKeys = useMemo(() => {
    const keys: string[] = [];
    for (const category of PRESET_CATEGORY_ORDER) if (presets.some((p) => p.category === category)) keys.push(`preset:${category}`);
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

  const toggleTop = (section: TopSection) => {
    setCollapsedTop((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };
  const toggleCategory = (key: string) => {
    setCollapsedCategory((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectPreset = (preset: PedalPreset, variant?: PresetVariant) => {
    setPreview({
      label: variant ? `${preset.name} - ${variant.label}` : preset.name,
      description: preset.description,
      archive: !!preset.archive,
    });
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

  return (
    <div className="template-list">
      <input
        type="search"
        className="template-search"
        placeholder={sections.includes("presets") ? (sections.includes("blocks") ? "프리셋/블록 검색..." : "페달·배선 검색...") : "블록 검색..."}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="템플릿 검색"
      />

      <div className="library-toolbar">
        <button type="button" className="library-collapse-all" onClick={toggleAll}>
          {isAllCollapsed ? "모두 펼치기" : "모두 접기"}
        </button>
      </div>

      {sections.includes("presets") && (
        <div className="library-section">
          <button
            type="button"
            className="template-category-header library-top-header"
            aria-expanded={isSearching || !collapsedTop.has("presets")}
            onClick={() => toggleTop("presets")}
          >
            <span className={isSearching || !collapsedTop.has("presets") ? "template-category-chevron expanded" : "template-category-chevron"}>
              <Icon name="chevron-right" size={12} />
            </span>
            페달 프리셋 (완성된 회로)
            <span className="template-category-count">{filteredPresets.length}</span>
          </button>
          {(isSearching || !collapsedTop.has("presets")) &&
            PRESET_CATEGORY_ORDER.map((category) => {
              const items = filteredPresets.filter((p) => p.category === category);
              if (items.length === 0) return null;
              const key = `preset:${category}`;
              const expanded = isSearching || !collapsedCategory.has(key);
              return (
                <div key={key} className="template-category-group">
                  <button type="button" className="template-category-header" aria-expanded={expanded} onClick={() => toggleCategory(key)}>
                    <span className={expanded ? "template-category-chevron expanded" : "template-category-chevron"}>
                      <Icon name="chevron-right" size={12} />
                    </span>
                    {category}
                    <span className="template-category-count">{items.length}</span>
                  </button>
                  {expanded && (
                    <div className="template-category-items">
                      {items.map((preset) => (
                        <div key={preset.id}>
                          <button
                            type="button"
                            className={preset.id === loadedPresetId ? "library-item-row active" : "library-item-row"}
                            onClick={() => selectPreset(preset)}
                            title={preset.name}
                          >
                            <span className="library-item-label">{preset.name}</span>
                            {preset.archive && <span className="template-archive-badge">아카이브</span>}
                          </button>
                          {/* Topology branches are always listed rather than revealed on selection -
                            they are the only way to reach the non-default branch, so hiding them
                            behind a prior click is how they stayed unreachable in the first place. */}
                          {preset.variants && (
                            <div className="library-variant-items">
                              {preset.variants.map((variant) => (
                                <button
                                  key={variant.id}
                                  type="button"
                                  className={
                                    preset.id === loadedPresetId && variant.id === loadedVariantId ? "library-variant-row active" : "library-variant-row"
                                  }
                                  onClick={() => selectPreset(preset, variant)}
                                  title={`${preset.name} - ${variant.label}`}
                                >
                                  {variant.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {sections.includes("wiring") && (
        <div className="library-section">
          <button
            type="button"
            className="template-category-header library-top-header"
            aria-expanded={isSearching || !collapsedTop.has("wiring")}
            onClick={() => toggleTop("wiring")}
          >
            <span className={isSearching || !collapsedTop.has("wiring") ? "template-category-chevron expanded" : "template-category-chevron"}>
              <Icon name="chevron-right" size={12} />
            </span>
            기타 배선 (픽업·볼륨·톤)
            <span className="template-category-count">{filteredWiring.length}</span>
          </button>
          {(isSearching || !collapsedTop.has("wiring")) &&
            WIRING_CATEGORY_ORDER.map((category) => {
              const items = filteredWiring.filter((p) => p.category === category);
              if (items.length === 0) return null;
              const key = `wiring:${category}`;
              const expanded = isSearching || !collapsedCategory.has(key);
              return (
                <div key={key} className="template-category-group">
                  <button type="button" className="template-category-header" aria-expanded={expanded} onClick={() => toggleCategory(key)}>
                    <span className={expanded ? "template-category-chevron expanded" : "template-category-chevron"}>
                      <Icon name="chevron-right" size={12} />
                    </span>
                    {category}
                    <span className="template-category-count">{items.length}</span>
                  </button>
                  {expanded && (
                    <div className="template-category-items">
                      {items.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={preset.id === loadedPresetId ? "library-item-row active" : "library-item-row"}
                          onClick={() => selectWiring(preset)}
                          title={preset.name}
                        >
                          <span className="library-item-label">{preset.name}</span>
                          {preset.archive && <span className="template-archive-badge">아카이브</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {sections.includes("blocks") && (
        <div className="library-section">
          <button
            type="button"
            className="template-category-header library-top-header"
            aria-expanded={isSearching || !collapsedTop.has("blocks")}
            onClick={() => toggleTop("blocks")}
          >
            <span className={isSearching || !collapsedTop.has("blocks") ? "template-category-chevron expanded" : "template-category-chevron"}>
              <Icon name="chevron-right" size={12} />
            </span>
            기능 블록 (조립 단위)
            <span className="template-category-count">{filteredBlocks.length + filteredUserBlocks.length}</span>
          </button>
          {(isSearching || !collapsedTop.has("blocks")) &&
            BLOCK_CATEGORY_ORDER.map((category) => {
              const items = filteredBlocks.filter((b) => b.category === category);
              if (items.length === 0 && !(category === "custom" && filteredUserBlocks.length > 0)) return null;
              const key = `block:${category}`;
              const expanded = isSearching || !collapsedCategory.has(key);
              return (
                <div key={key} className="template-category-group">
                  <button type="button" className="template-category-header" aria-expanded={expanded} onClick={() => toggleCategory(key)}>
                    <span className={expanded ? "template-category-chevron expanded" : "template-category-chevron"}>
                      <Icon name="chevron-right" size={12} />
                    </span>
                    {category === "custom" ? "내 블록" : BLOCK_CATEGORY_LABELS[category]}
                    <span className="template-category-count">{items.length + (category === "custom" ? filteredUserBlocks.length : 0)}</span>
                  </button>
                  {expanded && (
                    <div className="template-category-items">
                      {items.map((def) => (
                        <button key={def.id} type="button" className="library-item-row" onClick={() => selectBlock(def)} title={def.label}>
                          <span className="library-item-label">{def.label}</span>
                        </button>
                      ))}
                      {category === "custom" &&
                        filteredUserBlocks.map((ub) => (
                          <div key={ub.id} className="library-user-block-row">
                            <button
                              type="button"
                              className="library-item-row"
                              onClick={() => {
                                setPreview({ label: ub.label, description: ub.description });
                                userBlocks?.onAdd(ub);
                              }}
                              title={ub.label}
                            >
                              <span className="library-item-label">{ub.label}</span>
                              <span className="template-archive-badge">내 블록</span>
                            </button>
                            <button
                              type="button"
                              className="library-user-block-delete"
                              aria-label={`${ub.label} 내 블록에서 삭제`}
                              onClick={() => window.confirm(`"${ub.label}"을(를) 내 블록에서 지울까요?`) && userBlocks?.onDelete(ub.id)}
                            >
                              <Icon name="close" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {isSearching && filteredPresets.length === 0 && filteredWiring.length === 0 && filteredBlocks.length === 0 && (
        <p className="template-empty">일치하는 프리셋/블록이 없습니다.</p>
      )}

      {preview && (
        <div className="library-preview-box">
          <div className="library-preview-title">
            {preview.label}
            {preview.archive && <span className="template-archive-badge">아카이브</span>}
          </div>
          <div className="library-preview-desc">{preview.description}</div>
        </div>
      )}
    </div>
  );
}
