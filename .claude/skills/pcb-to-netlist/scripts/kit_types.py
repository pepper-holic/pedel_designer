"""Rough effect-family guess for a kit from its name, description and shop category.

The first matching rule wins, so the more specific families come first. "unknown" is fine: the
index is for browsing, and a human (or the next session) fixes the odd miss by hand.
"""

import re

AMP_PACK_WORDS = ("앰프팩", "amp pack", "amp diy pack")
# Shop categories for tube-amp kits. Pedal parts packs are cross-listed there too (an "amp in a box"
# drive next to the amp it imitates), so a category alone only marks non-pedal products as amps.
AMP_CATEGORIES = {"061", "072", "078", "079", "080", "084", "094", "098"}

RULES: list[tuple[str, tuple[str, ...]]] = [
    ("cabinet", ("캐비넷", "캐비닛", "cabinet", "cab ")),
    ("filter", ("wah", "와우", "envelope", "엔벨롭", "엔벨로프", "mutron", "fx-25", "auto wah", "filter", "필터")),
    ("reverb", ("reverb", "verb", "리버브")),
    ("delay", ("delay", "echo", "tape", "딜레이", "에코", "pt2399")),
    ("modulation", ("chorus", "phaser", "flanger", "vibe", "tremolo", "trem", "코러스", "페이저", "플랜저", "트레몰로", "rotary", "univibe")),
    ("pitch", ("octa", "octave", "옥타", "pitch")),
    ("compressor", ("komp", "comp", "컴프", "governor", "dynamica", "sustainer")),
    ("noise-gate", ("noise", "gate", "노이즈")),
    ("preamp", ("preamp", "pre ", " pre", "프리앰프", "di ", "bbdi", "sansamp", "앰프시뮬", "amp sim")),
    ("eq", (" eq", "eq ", "이퀄", "인헨서", "enhancer", "mid blaster", "enhancer", "maximizer", "mazimizer")),
    ("buffer-boost", ("buffer", "버퍼", "트레블 부스터", "treble booster", "boost", "부스트", "level", "clean", "lift", "booster")),
    ("fuzz", ("fuzz", "퍼즈", "face", "buzz", "ranger", "레인지마스터", "rangemaster", "buzzrite", "tone bender", "톤밴더", "muff", "머플러", "bender", "tb ")),
    ("distortion", ("dist", "디스토션", "하이게인", "앰프톤", "부기", "boogie", "wreck", "랫", "rat 기반", "프로코", "ds-1", "jtm45", "크런치박스", "crunch box", "muff", "빅머프", "머프", "rat", "riot", "heavy", "metal", "plexi", "marshall", "friedman", "mary", "diesel", "revv", "slash")),
    ("overdrive", ("drive", "od", "overdrive", "오버드라이브", "808", "screamer", "blues", "klon", "kantata", "timothy", "timmy", "zen", "green", "tone", "cake", "bb cream")),
    ("overdrive-ko", ("드라이브", "트랜스페어런트", "튜브 스크리머", "튜브스크리머", "ts808", "ts9", "덤블", "dumble", "dod 250", "250 그레이", "블루스 브레이커", "블루스브레이커", "듀엘리스트", "클린부스터", "핫케익")),
    ("utility", ("a/b", "aby", "ab box", "splitter", "스플리터", "mute", "tuner", "switch", "loop", "midi", "파워", "power", "트루바이패스", "3pdt", "스위치")),
]


NOISE_WORDS = re.compile(r"parts?\s*pack|풀키트|부품팩|\(.*?\)|[@＠]|new ", re.I)


def _matches(word: str, hay: str) -> bool:
    w = word.strip()
    if w.isascii():
        return re.search(rf"(?<![a-z0-9]){re.escape(w)}(?![a-z0-9])", hay) is not None
    return w in hay


def kit_type(name: str, about: str, categories: list[str]) -> str:
    """`about` is the one-line pedal description the seller writes first ("... 오버드라이브 페달입니다.")."""
    low = name.lower()
    if any(w in low for w in AMP_PACK_WORDS) or (AMP_CATEGORIES.intersection(categories) and "parts pack" not in low and "풀키트" not in low):
        return "amp"
    for hay in (NOISE_WORDS.sub(" ", name.lower()), about.lower()):
        for family, words in RULES:
            if any(_matches(w, hay) for w in words):
                return "overdrive" if family == "overdrive-ko" else family
    return "unknown"


KIT_WORDS = ("parts pack", "풀키트", "amp pack", "앰프팩", "diy pack", "부품팩")


def item_kind(name: str, categories: list[str]) -> str:
    """kit (parts pack / full kit / amp pack), pcb (bare board), sticker, or hardware (everything else)."""
    low = name.lower()
    if any(w in low for w in KIT_WORDS):
        return "kit"
    if name.startswith(("Ⓢ", "🆂")):
        return "sticker"
    if "065" in categories or "pcb" in low:
        return "pcb"
    return "hardware"


def board_key(name: str) -> str:
    """Name reduced so a bare PCB ("03 PANCAKE") and its kit ("@ 03 Pancake Parts pack") compare equal."""
    return re.sub(r"[^0-9a-z가-힣]", "", NOISE_WORDS.sub(" ", name.lower()).replace("pcb", ""))
