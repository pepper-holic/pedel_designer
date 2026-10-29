export type LibraryTab = "presets" | "blocks" | "parts";

/** The library's three tabs: what each holds and how its search box is labelled. */
export const LIBRARY_TABS: { id: LibraryTab; label: string; hint: string; placeholder: string }[] = [
  { id: "presets", label: "프리셋", hint: "완성된 페달 회로와 기타 배선 - 불러오면 지금 회로를 바꿉니다", placeholder: "페달·배선 검색..." },
  { id: "blocks", label: "블록", hint: "미리 배선된 기능 단위 - 지금 회로에 더합니다", placeholder: "블록 검색..." },
  { id: "parts", label: "부품", hint: "저항·커패시터·트랜지스터 같은 낱개 소자", placeholder: "부품 검색..." },
];
