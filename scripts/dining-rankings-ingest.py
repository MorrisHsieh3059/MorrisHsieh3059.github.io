#!/usr/bin/env python3
"""Write official list JSON under components/dining/rankings/lists/.

Official list JSON under lists/ is what gets committed and fed to
`dining-rankings.py build`. Files under rankings/sources/ are local ingest
inputs (gitignored); they are optional if lists/ is already up to date.

  python3 scripts/dining-rankings-ingest.py
  python3 scripts/dining-rankings.py build
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LISTS = ROOT / "components" / "dining" / "rankings" / "lists"
SOURCES = ROOT / "components" / "dining" / "rankings" / "sources"
TOOLS = Path("/Users/morris/.cursor/projects/Users-morris-morrishsieh3059-github-io/agent-tools")

RESTAURANTS_ARCHIVE = TOOLS / "10994a7c-a892-4a12-b71e-5af07950cdfa.txt"
BARS_ARCHIVE = TOOLS / "dda394e6-ebb8-4ec1-a153-77ea37174b7f.txt"
BURGERS_PEARL = TOOLS / "7cd56c8b-f1f4-433a-8b84-8fecec4b92c4.txt"
STEAKS_PEARL = TOOLS / "a39597a5-30ee-494a-8bb4-2026eea6f3a2.txt"
REST_2021_51 = TOOLS / "ad3c461e-5db0-4f5f-9daa-58941abeba0e.txt"
REST_2022_51 = TOOLS / "7d02387f-19f3-4cdb-9473-438b31222a73.txt"
NA_BARS_PEARL = {
    2022: TOOLS / "c10e76f9-3e93-4a07-8ee3-1f80fe6853ce.txt",
    2023: TOOLS / "635f7ff6-2ffe-4691-8411-6e3b4ef2e4f1.txt",
    2024: TOOLS / "9a526694-b063-4d0c-8ee9-55e3893d09f9.txt",
    2025: TOOLS / "1b8c1bf0-9817-4fa1-afb0-c4fc510ef474.txt",
}

ATLAS: dict[str, str] = {}
MISSING: list[str] = []


def write_list(slug: str, region: str, year: int, source: str, entries: list[dict]) -> None:
    for e in entries:
        if e.get("city"):
            e["city"] = tidy_city(e["city"])
    fill_cities(entries, ATLAS)
    LISTS.mkdir(parents=True, exist_ok=True)
    key = f"{slug}-{region.lower().replace(' ', '-')}-{year}.json"
    path = LISTS / key
    doc = {
        "list": slug,
        "region": region,
        "year": year,
        "source": source,
        "entries": entries,
    }
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    bare = [e for e in entries if not e.get("city")]
    tag = f"  {path.name} ({len(entries)})"
    if bare:
        tag += f"  missing city: {len(bare)}"
        for e in bare:
            MISSING.append(f"{path.name} #{e.get('rank')} {e['name']}")
    print(tag)


def fold(name: str) -> str:
    s = re.sub(r"[^a-z0-9& ]+", " ", name.lower())
    return re.sub(r"\s+", " ", s.replace(" and ", " ")).strip()


def tidy_city(city: str) -> str:
    c = re.sub(r"\s+", " ", (city or "").strip())
    c = re.sub(r"[–-]\s*(NEW ENTRY|RE-ENTRY)", "", c).strip(" –")
    parts = [p.strip() for p in c.split(",") if p.strip()]
    if not parts:
        return ""
    head = re.split(r"\d", parts[0], maxsplit=1)[0].strip(" ,–-")
    tail = re.split(r"\d", parts[1], maxsplit=1)[0].strip() if len(parts) > 1 else ""
    if head in {"New York City", "New York", "NYC"} or (head == "New York" and tail in {"NY", "USA", "United States"}):
        return "New York, NY"
    if head in {"Washington DC", "Washington D.C.", "Washington, DC"} or (
        head == "Washington" and tail in {"DC", "D.C.", "USA", "United States"}
    ):
        return "Washington, DC"
    if tail in {"NY"}:
        return tidy_city(head)
    return head


def rows(*items: tuple) -> list[dict]:
    out = []
    for item in items:
        if len(item) == 2:
            rank, name = item
            out.append({"rank": rank, "name": name})
        else:
            rank, name, city = item
            out.append({"rank": rank, "name": name, "city": tidy_city(city)})
    return out


def parse_50best_archive(path: Path, title: str, years: set[int] | None = None) -> dict[int, list[dict]]:
    text = path.read_text()
    parts = re.split(rf"^# {re.escape(title)} (\d{{4}})\s*$", text, flags=re.M)
    out: dict[int, list[dict]] = {}
    for year_s, body in zip(parts[1::2], parts[2::2]):
        year = int(year_s)
        if years is not None and year not in years:
            continue
        found = re.findall(r"^(\d+)\n\n## (.+)\n\n(.+)\n", body, flags=re.M)
        out[year] = [
            {"rank": int(r), "name": n.strip(), "city": tidy_city(city)}
            for r, n, city in found
        ]
    return out


def city_atlas() -> dict[str, str]:
    idx: dict[str, str] = {}
    for path, title in (
        (RESTAURANTS_ARCHIVE, "The World's 50 Best Restaurants"),
        (BARS_ARCHIVE, "The World's 50 Best Bars"),
    ):
        if not path.exists():
            continue
        for entries in parse_50best_archive(path, title).values():
            for e in entries:
                idx[fold(e["name"])] = e["city"]
    return idx


def fill_cities(entries: list[dict], atlas: dict[str, str], default: str | None = None) -> list[dict]:
    for e in entries:
        if e.get("city"):
            continue
        city = atlas.get(fold(e["name"])) or default
        if city:
            e["city"] = city
    return entries


def name_hit(a: str, b: str) -> bool:
    fa, fb = fold(a), fold(b)
    return bool(fa and fb) and (fa == fb or fa in fb or fb in fa)


def apply_cities(entries: list[dict], pairs: list[tuple[int | None, str, str]]) -> None:
    unused = list(pairs)
    for e in entries:
        if e.get("city"):
            continue
        rank = e.get("rank")
        name = e["name"]
        pick = next(
            (i for i, (r, n, _) in enumerate(unused) if r == rank and name_hit(name, n)),
            None,
        )
        if pick is None:
            same_rank = [i for i, (r, _, _) in enumerate(unused) if r == rank]
            pick = same_rank[0] if len(same_rank) == 1 else None
        if pick is None:
            pick = next((i for i, (_, n, _) in enumerate(unused) if name_hit(name, n)), None)
        if pick is None:
            continue
        _, _, city = unused.pop(pick)
        if city:
            e["city"] = tidy_city(city)


def parse_md_table(path: Path) -> list[tuple[int | None, str, str]]:
    pairs = []
    for line in path.read_text().splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if not cells or not cells[0].isdigit():
            continue
        pairs.append((int(cells[0]), cells[1], cells[2]))
    return pairs


def parse_tsv(path: Path) -> list[tuple[int | None, str, str]]:
    pairs = []
    for line in path.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        rank_s, name, city = line.split("\t", 2)
        pairs.append((int(rank_s), name, city))
    return pairs


def parse_pizza_ranking(path: Path) -> list[tuple[int | None, str, str]]:
    pairs = []
    for line in path.read_text().splitlines():
        m = re.match(r"^(\d+)\s+(.+?)–\s+(.+)$", line)
        if not m:
            continue
        loc = m.group(3).strip()
        city = loc.split(",")[0].strip()
        if "–" in city:
            city = city.split("–")[-1].strip()
        pairs.append((int(m.group(1)), m.group(2).strip(), city))
    return pairs


def parse_pearl(path: Path) -> list[tuple[int | None, str, str]]:
    if not path.exists():
        return []
    found = re.findall(r"^### (.+)\n\n#(\d+)([^,\n]+),", path.read_text(), flags=re.M)
    return [(int(rank), name.strip(), city.strip()) for name, rank, city in found]


def apply_story_cities(text: str, entries: list[dict]) -> None:
    for e in entries:
        if e.get("city") or not e.get("rank"):
            continue
        m = re.search(rf"No\.{e['rank']}\s+", text)
        if not m:
            continue
        rest = re.split(r"No\.\d+", text[m.end():], maxsplit=1)[0]
        rest = rest.split("@", 1)[0]
        rest = re.split(r"Image:", rest, maxsplit=1)[0]
        rest = re.sub(r"\s*[–-]\s*(?:NEW ENTRY|RE-ENTRY)\s*", " ", rest)
        rest = re.sub(r"Sustainable Restaurant Award \d+", " ", rest)
        rest = re.sub(r"\s+", " ", rest).strip(" ,–-")
        name = e["name"]
        city = ""
        if rest.lower().startswith(name.lower()):
            city = rest[len(name):].strip(" ,–-")
        else:
            # glued NameCity@  or  Name, City, Country
            comma = re.match(rf"{re.escape(name)},\s*([^,]+)", rest, flags=re.I)
            if comma:
                city = comma.group(1)
        city = re.split(r"\s+[a-z]", city, maxsplit=1)[0].strip(" ,–-")
        city = tidy_city(city)
        if city:
            e["city"] = city


def ingest_nyt() -> None:
    text = (SOURCES / "nyt-100.md").read_text()
    by_year: dict[int, list[dict]] = {2023: [], 2024: [], 2025: [], 2026: []}
    for line in text.splitlines():
        if not line.startswith("|") or line.startswith("| Restaurant") or line.startswith("| ---"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        name = re.sub(r"\*\*", "", cells[0]).strip()
        for year, raw in zip((2023, 2024, 2025, 2026), cells[1:]):
            if raw in {"—", "-", ""}:
                continue
            if raw.lower().startswith("listed"):
                by_year[year].append({"name": name, "city": "New York, NY"})
            else:
                by_year[year].append({"rank": int(raw), "name": name, "city": "New York, NY"})
    src = "Morris NYT 100 Best table (official ranks; 2025 top 10 ranked, rest listed unranked)"
    for year, entries in by_year.items():
        entries.sort(key=lambda e: (e.get("rank") is None, e.get("rank") or 0, e["name"]))
        write_list("nyt-100-best-restaurants", "New York", year, src, entries)


def ingest_world_restaurants() -> None:
    parsed = parse_50best_archive(
        RESTAURANTS_ARCHIVE, "The World's 50 Best Restaurants", {2021, 2022, 2023, 2024}
    )
    extra_2021 = rows(
        (51, "Nihonryori RyuGin"), (52, "Uliassi"), (53, "Nerua"), (54, "St. Hubertus"),
        (55, "Chef's Table at Brooklyn Fare"), (56, "Sud 777"), (57, "Brae"),
        (58, "Alchemist"), (59, "Schloss Schauenstein"), (60, "Mikla"), (61, "D.O.M."),
        (62, "Mingles"), (63, "Sorn"), (64, "Core by Clare Smyth"),
        (65, "Dinner by Heston Blumenthal"), (66, "The Jane"), (67, "Oteque"),
        (68, "Alcalde"), (69, "De Librije"), (70, "Alinea"), (71, "Vea"), (72, "Le Du"),
        (73, "Il Ristorante Luca Fantin"), (74, "Quique Dacosta"), (75, "Sazenka"),
        (76, "La Cime"), (77, "Willem Hiele"), (78, "Brat"), (79, "Aponiente"),
        (80, "El Chato"), (81, "La Colombe"), (82, "Indian Accent"), (83, "Epicure"),
        (84, "Le Clarence"), (85, "Lasai"), (86, "Restaurant David Toutain"),
        (87, "Ikoyi"), (88, "Belon"), (89, "Amass"), (90, "Mil"),
        (91, "La Grenouillère"), (92, "Fyn"), (93, "Gaa"), (94, "Arzak"),
        (95, "Kjolle"), (96, "Astrid y Gastón"), (97, "Attica"), (98, "Alo"),
        (99, "L'Effervescence"), (100, "Amber"),
    )
    extra_2022 = rows(
        (51, "Alcalde"), (52, "Sud 777"), (53, "D.O.M."), (54, "Lyle's"),
        (55, "Azurmendi"), (56, "La Colombe"), (57, "Trèsind Studio"),
        (58, "Alléno Paris au Pavillon Ledoyen"), (59, "Sazenka"), (60, "Rosetta"),
        (61, "La Grenouillère"), (62, "Ernst"), (63, "Chef's Table at Brooklyn Fare"),
        (64, "Fu He Hui"), (65, "Le Du"), (66, "Sühring"), (67, "Evvai"),
        (68, "Kjolle"), (69, "Cosme"), (70, "Zén"), (71, "Mingles"),
        (72, "Atelier Crenn"), (73, "Kol"), (74, "Blue Hill at Stone Barns"),
        (75, "Samrub Samrub Thai"), (76, "Neighborhood"), (77, "Table by Bruno Verjus"),
        (78, "Lasai"), (79, "Estela"), (80, "AM par Alexandre Mazzia"), (81, "Brat"),
        (82, "Sézanne"), (83, "El Chato"), (84, "Gimlet at Cavendish House"),
        (85, "Raan Jay Fai"), (86, "Mikla"), (87, "Orfali Bros Bistro"),
        (88, "Mishiguene"), (89, "Máximo Bistrot"), (90, "Wolfgat"), (91, "Oriole"),
        (92, "Indian Accent"), (93, "Hertog Jan at Botanic Sanctuary"),
        (94, "Burnt Ends"), (95, "Meta"), (96, "Maní"), (97, "Benu"),
        (98, "Tantris"), (99, "Flocons de Sel"), (100, "Wing"),
    )
    src_prev = "https://www.theworlds50best.com/list/1-50/previous-lists"
    if REST_2021_51.exists():
        apply_cities(extra_2021, [
            (int(r), n.strip(), c.strip())
            for r, n, c in re.findall(r"No\.(\d+)\s+(.+?),\s+([^,@\n]+?),\s+", REST_2021_51.read_text())
        ])
    if REST_2022_51.exists():
        apply_story_cities(REST_2022_51.read_text(), extra_2022)
    write_list("50-best-restaurants", "World", 2021, src_prev + " + PR 51-100", parsed[2021] + extra_2021)
    write_list("50-best-restaurants", "World", 2022, src_prev + " + PR 51-100", parsed[2022] + extra_2022)
    write_list("50-best-restaurants", "World", 2023, src_prev, parsed[2023])
    write_list("50-best-restaurants", "World", 2024, src_prev, parsed[2024])
    top50 = rows(
        (1, "Maido"), (2, "Asador Etxebarri"), (3, "Quintonil"), (4, "DiverXO"),
        (5, "Alchemist"), (6, "Gaggan"), (7, "Sézanne"), (8, "Table by Bruno Verjus"),
        (9, "Kjolle"), (10, "Don Julio"), (11, "Wing"), (12, "Atomix"),
        (13, "Potong"), (14, "Plénitude"), (15, "Ikoyi"), (16, "Lido 84"),
        (17, "Sorn"), (18, "Reale"), (19, "The Chairman"),
        (20, "Atelier Moessmer Norbert Niederkofler"), (21, "Narisawa"),
        (22, "Sühring"), (23, "Boragó"), (24, "Elkano"), (25, "Odette"),
        (26, "Mérito"), (27, "Trèsind Studio"), (28, "Lasai"), (29, "Mingles"),
        (30, "Le Du"), (31, "Le Calandre"), (32, "Piazza Duomo"),
        (33, "Steirereck"), (34, "Enigma"), (35, "Nusara"), (36, "Florilège"),
        (37, "Orfali Bros Bistro"), (38, "Frantzén"), (39, "Mayta"),
        (40, "Septime"), (41, "Kadeau"), (42, "Belcanto"), (43, "Uliassi"),
        (44, "La Cime"), (45, "Arpège"), (46, "Rosetta"), (47, "Vyn"),
        (48, "Celele"), (49, "Kol"), (50, "Restaurant Jan"),
    )
    rest = rows(
        (51, "Alcalde"), (52, "Schloss Schauenstein"), (53, "Den"), (54, "El Chato"),
        (55, "La Colombe"), (56, "Jordnær"), (57, "Onjium"),
        (58, "Restaurant Tim Raue"), (59, "Nobelhart & Schmutzig"), (60, "Pujol"),
        (61, "Nuema"), (62, "Willem Hiele"), (63, "Bozar"), (64, "Fu He Hui"),
        (65, "Quique Dacosta"), (66, "Saint Peter"), (67, "Arca"), (68, "Masque"),
        (69, "Hiša Franko"), (70, "Tuju"), (71, "Sazenka"),
        (72, "Chef Tam's Seasons"), (73, "Tantris"), (74, "Mountain"), (75, "Mil"),
        (76, "Leo"), (77, "Le Doyenné"), (78, "Cocina Hermanos Torres"),
        (79, "Coda"), (80, "SingleThread"), (81, "Oteque"), (82, "Fyn"),
        (83, "A Casa do Porco"), (84, "Aponiente"), (85, "Txispa"),
        (86, "The Clove Club"), (87, "Mugaritz"), (88, "Salsify at the Roundhouse"),
        (89, "Huniik"), (90, "Le Bernardin"), (91, "Koan"), (92, "Al Gatto Verde"),
        (93, "Burnt Ends"), (94, "Meet the Bund"), (95, "Evvai"),
        (96, "Atelier Crenn"), (97, "Labyrinth"), (98, "César"),
        (99, "Amisfield Restaurant"), (100, "Neolokal"),
    )
    world_2025 = top50 + rest
    apply_cities(world_2025, parse_tsv(SOURCES / "50-best-restaurants-world-2025.tsv"))
    write_list(
        "50-best-restaurants", "World", 2025,
        "https://www.theworlds50best.com/list/1-50",
        world_2025,
    )


def ingest_na_restaurants() -> None:
    na_2025 = rows(
            (1, "Atomix"), (2, "Mon Lapin"), (3, "Restaurant Pearl Morissette"),
            (4, "Smyth"), (5, "Tanière3"), (6, "Dakar NOLA"), (7, "Kalaya"),
            (8, "SingleThread"), (9, "Le Bernardin"), (10, "Le Veau d'Or"),
            (11, "Quetzal"), (12, "Baan Lao"), (13, "Benu"), (14, "Californios"),
            (15, "The Four Horsemen"), (16, "Friday Saturday Sunday"),
            (17, "Moon Rabbit"), (18, "Via Carota"), (19, "Chubby Fish"),
            (20, "Locust"), (21, "Saison"), (22, "Montréal Plaza"), (23, "Kono"),
            (24, "Aska"), (25, "Lazy Bear"), (26, "Kato"), (27, "Kann"),
            (28, "Published on Main"), (29, "Le Violon"), (30, "Emeril's"),
            (31, "Kasama"), (32, "Royal Sushi & Izakaya"), (33, "Saga"),
            (34, "Albi"), (35, "Jungsik"), (36, "Corima"), (37, "Dōgon"),
            (38, "César"), (39, "Café Carmellini"), (40, "Penny"),
            (41, "Buzo Osteria Italiana"), (42, "Holbox"), (43, "Alma"),
            (44, "Mhel"), (45, "Alma Fonda Fina"), (46, "Atelier Crenn"),
            (47, "Providence"), (48, "Quince"), (49, "Stush in the Bush"),
            (50, "Beba"),
        )
    apply_cities(na_2025, parse_md_table(SOURCES / "50-best-restaurants-north-america-2025.md"))
    write_list("50-best-restaurants", "North America", 2025,
        "https://www.prnewswire.com/news-releases/atomix-in-new-york-city-is-named-no1-in-the-inaugural-list-of-north-americas-50-best-restaurants-2025-302568001.html",
        na_2025)
    na_2026 = rows(
            (1, "Smyth"), (2, "Eight"), (3, "Restaurant Pearl Morissette"),
            (4, "Dakar NOLA"), (5, "Mon Lapin"), (6, "Albi"), (7, "Atomix"),
            (8, "Quetzal"), (9, "Tanière3"), (10, "César"), (11, "Kalaya"),
            (12, "Le Veau d'Or"), (13, "Le Bernardin"), (14, "Kabawa"),
            (15, "Le Violon"), (16, "SingleThread"), (17, "Published on Main"),
            (18, "Jungsik"), (19, "Penny"), (20, "Emeril's"), (21, "Chubby Fish"),
            (22, "Saison"), (23, "Aska"), (24, "Moon Rabbit"), (25, "Edulis"),
            (26, "Holbox"), (27, "Beba"), (28, "Mhel"), (29, "Avize"),
            (30, "Acamaya"), (31, "Addison by William Bradley"), (32, "Providence"),
            (33, "Benu"), (34, "Sabayon"), (35, "AnnaLena"), (36, "Corima"),
            (37, "Dōgon by Kwame Onwuachi"), (38, "Torrisi"),
            (39, "Tatiana by Kwame Onwuachi"), (40, "Friday Saturday Sunday"),
            (41, "Semma"), (42, "Pascual"), (43, "Gramercy Tavern"),
            (44, "Atelier Crenn"), (45, "Sons & Daughters"), (46, "Somni"),
            (47, "Wild Blue"), (48, "The Pine"), (49, "Kato"), (50, "Diane's Place"),
        )
    apply_cities(na_2026, parse_md_table(SOURCES / "50-best-restaurants-north-america-2026.md"))
    write_list("50-best-restaurants", "North America", 2026,
        "https://www.prnewswire.com/news-releases/smyth-in-chicago-is-named-no1-in-the-list-of-north-americas-50-best-restaurants-2026-302785274.html",
        na_2026)


def ingest_world_bars() -> None:
    parsed = parse_50best_archive(
        BARS_ARCHIVE, "The World's 50 Best Bars", {2020, 2021, 2022, 2023, 2024}
    )
    src = "https://www.theworlds50best.com/bars/list/1-50/previous-lists"
    for year in (2020, 2021, 2022, 2023, 2024):
        write_list("50-best-bars", "World", year, src, parsed[year])
    top50 = rows(
        (1, "Bar Leone"), (2, "Handshake Speakeasy"), (3, "Sips"), (4, "Paradiso"),
        (5, "Tayēr + Elementary"), (6, "Connaught Bar"), (7, "Moebius Milano"),
        (8, "Line"), (9, "Jigger & Pony"), (10, "Tres Monos"), (11, "Alquímico"),
        (12, "Superbueno"), (13, "Lady Bee"), (14, "Himkok"), (15, "Bar Us"),
        (16, "Zest"), (17, "Bar Nouveau"), (18, "Bar Benfiddich"),
        (19, "Caretaker's Cottage"), (20, "The Cambridge Public House"),
        (21, "Satan's Whiskers"), (22, "Locale Firenze"), (23, "Tlecān"),
        (24, "Tan Tan"), (25, "Mirror Bar"), (26, "CoChinChina"),
        (27, "Baba au Rum"), (28, "Nouvelle Vague"), (29, "Hope & Sesame"),
        (30, "Danico"), (31, "Scarfes Bar"), (32, "Svanen"),
        (33, "Sastrería Martinez"), (34, "Panda & Sons"), (35, "Röda Huset"),
        (36, "Mimi Kakushi"), (37, "Salmon Guru"), (38, "Coa"),
        (39, "Sip & Guzzle"), (40, "Drink Kong"), (41, "Double Chicken Please"),
        (42, "Maybe Sammy"), (43, "1930"), (44, "Jewel of the South"),
        (45, "Virtù"), (46, "Overstory"), (47, "The Bar in Front of the Bar"),
        (48, "The Bellwood"), (49, "BKK Social Club"), (50, "Nutmeg & Clove"),
    )
    rest = rows(
        (51, "Angelita"), (52, "Licorería Limantour"), (53, "Bar Cham"),
        (54, "Bar Mauro"), (55, "Bar Pompette"), (56, "Argo"), (57, "Wax On"),
        (58, "Freni e Frizioni"), (59, "Schmuck"), (60, "LPM Dubai"),
        (61, "Exímia"), (62, "Barro Negro"), (63, "L'Antiquario"),
        (64, "True Laurel"), (65, "The SG Club"), (66, "Bird"),
        (67, "Smoke & Bitters"), (68, "La Sala de Laura"), (69, "Hero Bar"),
        (70, "Gokan"), (71, "El Gallo Altanero"), (72, "Attaboy"),
        (73, "A Bar with Shapes For a Name"), (74, "Vender"), (75, "Martiny's"),
        (76, "Tjoget"), (77, "Arca"), (78, "Baltra Bar"), (79, "Kwãnt Mayfair"),
        (80, "Three Sheets Soho"), (81, "Mamba Negra"), (82, "Café La Trova"),
        (83, "Dr. Stravinsky"), (84, "Native"), (85, "Boadas"),
        (86, "The Savory Project"), (87, "Victor Audio Bar"),
        (88, "Dry Wave Cocktail Studio"), (89, "Foco"), (90, "Florería Atlántico"),
        (91, "Byrdi"), (92, "Opium"), (93, "Mírate"), (94, "Bar Trench"),
        (95, "Employees Only"), (96, "Lair"), (97, "Kumiko"),
        (98, "Jerry Thomas Speakeasy"), (99, "Gucci Giardino"), (100, "Bar Carmen"),
    )
    world_2025_bars = top50 + rest
    apply_cities(world_2025_bars, parse_md_table(SOURCES / "50-best-bars-world-2025.md"))
    write_list(
        "50-best-bars", "World", 2025,
        "https://www.theworlds50best.com/stories/News/the-worlds-50-best-bars-2025-the-list-revealed.html + PR 51-100",
        world_2025_bars,
    )


def ingest_na_europe_bars() -> None:
    def out(year: int, source: str, entries: list[dict], region: str = "North America") -> None:
        pearl = NA_BARS_PEARL.get(year) if region == "North America" else None
        if pearl:
            apply_cities(entries, parse_pearl(pearl))
        known = {
            "service bar": "Washington, DC",
            "raised by wolves": "San Diego",
            "genever": "Los Angeles",
            "milk room": "Chicago",
            "platform 18": "Phoenix",
            "milady s": "New York, NY",
            "miladys": "New York, NY",
        }
        for e in entries:
            if not e.get("city"):
                hit = known.get(fold(e["name"]))
                if hit:
                    e["city"] = hit
        if year == 2026 and region == "North America":
            apply_cities(entries, parse_tsv(SOURCES / "50-best-bars-north-america-2026.tsv"))
        if region == "Europe":
            apply_cities(entries, parse_md_table(SOURCES / "50-best-bars-europe-2026.md"))
        write_list("50-best-bars", region, year, source, entries)

    out(2022,
        "https://drinksint.com/attaboy-named-best-bar-in-north-america/",
        rows(
            (1, "Attaboy"), (2, "Handshake Speakeasy"), (3, "Licorería Limantour"),
            (4, "Katana Kitten"), (5, "Kumiko"), (6, "Café La Trova"),
            (7, "Baltra Bar"), (8, "Dante"), (9, "Thunderbolt"),
            (10, "Civil Liberties"), (11, "Zapote Bar"), (12, "La Factoría"),
            (13, "Kaito del Valle"), (14, "Sweet Liberty"), (15, "Café de Nadie"),
            (16, "Hanky Panky"), (17, "Double Chicken Please"), (18, "Service Bar"),
            (19, "Raised by Wolves"), (20, "Sabina Sabe"), (21, "El Gallo Altanero"),
            (22, "Selva"), (23, "Amor y Amargo"), (24, "Jewel of the South"),
            (25, "The Keefer Bar"), (26, "Dear Irving"), (27, "Overstory"),
            (28, "Herbs & Rye"), (29, "El Pequeño Bar"), (30, "Employees Only"),
            (31, "The Dead Rabbit"), (32, "Broken Shaker"), (33, "Friends and Family"),
            (34, "Death & Co (Los Angeles)"), (35, "Mace"),
            (36, "Death & Co (Denver)"), (37, "Arca"), (38, "Mother"), (39, "ABV"),
            (40, "El Floridita"), (41, "Bar Raval"), (42, "Bar Leather Apron"),
            (43, "Clover Club"), (44, "Bitter & Twisted"), (45, "Cloakroom"),
            (46, "Julep"), (47, "Bar Mordecai"), (48, "Teardrop Lounge"),
            (49, "Bar Kismet"),             (50, "Genever"),
        ))
    out(2023,
        "https://cocktailsandbars.com/north-americas-50-best-bars-2023/",
        rows(
            (1, "Double Chicken Please"), (2, "Handshake Speakeasy"),
            (3, "Katana Kitten"), (4, "Licorería Limantour"),
            (5, "Jewel of the South"), (6, "Dante"), (7, "Overstory"),
            (8, "Kumiko"), (9, "Café La Trova"), (10, "Thunderbolt"),
            (11, "Zapote Bar"), (12, "Civil Liberties"), (13, "Attaboy"),
            (14, "Employees Only"), (15, "Bar Pompette"), (16, "Baltra Bar"),
            (17, "Rayo"), (18, "Mace"), (19, "Botanist Bar"), (20, "Hanky Panky"),
            (21, "El Gallo Altanero"), (22, "Sabina Sabe"), (23, "Arca"),
            (24, "La Factoría"), (25, "Café de Nadie"), (26, "Kaito del Valle"),
            (27, "Herbs & Rye"), (28, "Pacific Cocktail Haven"), (29, "Martiny's"),
            (30, "Death & Co"), (31, "Selva"), (32, "Atwater Cocktail Club"),
            (33, "Service Bar"), (34, "Sweet Liberty"), (35, "Cloakroom"),
            (36, "Cure"), (37, "Mother"), (38, "Milk Room"), (39, "Maison Premiere"),
            (40, "Aruba Day Drink"), (41, "Bar Leather Apron"), (42, "Yacht Club"),
            (43, "Bar Mordecai"), (44, "The Dead Rabbit"), (45, "Allegory"),
            (46, "Clover Club"), (47, "Brujas"), (48, "Platform 18"),
            (49, "Youngblood"),             (50, "Milady's"),
        ))
    out(2024,
        "https://www.theworlds50best.com/stories/News/north-americas-50-best-bars-2024-list-in-pictures.html",
        rows(
            (1, "Handshake Speakeasy"), (2, "Superbueno"), (3, "Overstory"),
            (4, "Martiny's"), (5, "Rayo"), (6, "Jewel of the South"),
            (7, "Double Chicken Please"), (8, "Thunderbolt"),
            (9, "Licorería Limantour"), (10, "Tlecān"), (11, "Zapote Bar"),
            (12, "Katana Kitten"), (13, "Café La Trova"), (14, "El Gallo Altanero"),
            (15, "Employees Only"), (16, "Aruba Day Drink"), (17, "Café de Nadie"),
            (18, "La Factoría"), (19, "Kumiko"), (20, "Dante"),
            (21, "Civil Liberties"), (22, "Service Bar"), (23, "Allegory"),
            (24, "Botanist Bar"), (25, "Herbs & Rye"), (26, "Baltra Bar"),
            (27, "Bekeb"), (28, "Kaito del Valle"), (29, "Bar Pompette"),
            (30, "True Laurel"), (31, "Attaboy"), (32, "Meadowlark"),
            (33, "The Dead Rabbit"), (34, "Selva"), (35, "Library by the Sea"),
            (36, "Century Grand"), (37, "Arca"), (38, "Pacific Cocktail Haven"),
            (39, "Cloakroom"), (40, "Bar Mordecai"), (41, "Maison Premiere"),
            (42, "Hanky Panky"), (43, "Angel's Share"), (44, "Milady's"),
            (45, "Brujas"), (46, "Mírate"), (47, "Cure"), (48, "Best Intentions"),
            (49, "The Keefer Bar"),             (50, "Atwater Cocktail Club"),
        ))
    out(2025,
        "https://www.barandrestaurant.com/people/north-americas-50-best-bars-2025-revealed",
        rows(
            (1, "Handshake Speakeasy"), (2, "Superbueno"), (3, "Tlecān"),
            (4, "Jewel of the South"), (5, "Sip & Guzzle"), (6, "Overstory"),
            (7, "Bar Pompette"), (8, "El Gallo Altanero"),
            (9, "Licorería Limantour"), (10, "Kumiko"), (11, "Clemente Bar"),
            (12, "Mírate"), (13, "Café La Trova"), (14, "Bar Mauro"),
            (15, "Martiny's"), (16, "Pacific Cocktail Haven"), (17, "True Laurel"),
            (18, "Employees Only"), (19, "Double Chicken Please"), (20, "Baltra Bar"),
            (21, "Civil Liberties"), (22, "Aruba Day Drink"), (23, "Service Bar"),
            (24, "Thunderbolt"), (25, "Best Intentions"), (26, "Botanist Bar"),
            (27, "Arca"), (28, "The Keefer Bar"), (29, "Selva"),
            (30, "Library by the Sea"), (31, "Cloakroom"), (32, "La Factoría"),
            (33, "Maison Premiere"), (34, "Bijou Drinkery Room"),
            (35, "Hanky Panky"), (36, "Atwater Cocktail Club"), (37, "Bar Mordecai"),
            (38, "Meadowlark"), (39, "Bisous"), (40, "Kaito del Valle"),
            (41, "Yacht Club"), (42, "Katana Kitten"), (43, "Angel's Share"),
            (44, "Mother"), (45, "Allegory"), (46, "Dante"), (47, "Café de Nadie"),
            (48, "Silver Lyan"), (49, "Bekeb"),             (50, "Cure"),
        ))
    out(2026,
        "https://www.theworlds50best.com/bars/best-in-north-america/lists/1-50",
        rows(
            (1, "Sip & Guzzle"), (2, "Bar Mauro"), (3, "Bar Snack"), (4, "Schmuck"),
            (5, "Tlecān"), (6, "Jewel of the South"), (7, "The Keefer Bar"),
            (8, "Bar Pompette"), (9, "Superbueno"), (10, "El Gallo Altanero"),
            (11, "Kumiko"), (12, "Handshake Speakeasy"), (13, "Form + Matter"),
            (14, "True Laurel"), (15, "Clemente Bar"), (16, "Best Intentions"),
            (17, "June on Cambie"), (18, "Mecenas"), (19, "Library Bar"),
            (20, "Licorería Limantour"), (21, "Cure"), (22, "Mother"),
            (23, "Martiny's"), (24, "Bekeb"), (25, "Kaito del Valle"),
            (26, "La Factoría"), (27, "Gus' Sip & Dip"), (28, "Mírate"),
            (29, "Civil Works"), (30, "Bisous"), (31, "Angel's Share"),
            (32, "Prophecy"), (33, "Overstory"), (34, "Press Club"),
            (35, "Double Chicken Please"), (36, "Bar Madonna"), (37, "Attaboy"),
            (38, "Botanist Bar"), (39, "Service Bar"), (40, "Maison Premiere"),
            (41, "Pacific Cocktail Haven"), (42, "Café La Trova"), (43, "Selva"),
            (44, "Daisy Margarita Bar"), (45, "Employees Only"), (46, "Viceversa"),
            (47, "Bandista"), (48, "Baltra Bar"), (49, "Library by the Sea"),
            (50, "Bon Vivants"), (51, "Aruba Day Drink"), (52, "Katana Kitten"),
            (53, "Humboldt Bar"), (54, "Civil Liberties"), (55, "Silver Lyan"),
            (56, "Cloakroom"), (57, "Allegory"), (58, "Dante"), (59, "Bagheera"),
            (60, "Café de Nadie"), (61, "Arca"), (62, "Atwater Cocktail Club"),
            (63, "Scotch Lodge"), (64, "Meo"), (65, "Meadowlark"),
            (66, "Seed Library"), (67, "Yacht Club"), (68, "Vandell"),
            (69, "Cry Baby Gallery"), (70, "Bar Kaiju"), (71, "The Portrait Bar"),
            (72, "Laowai"), (73, "Identidad"), (74, "Suite 115"), (75, "Bar Bello"),
            (76, "Nine Bar"), (77, "Shinji's"), (78, "Proof"), (79, "Missy's"),
            (80, "Queen Mary"), (81, "Bar Leather Apron"), (82, "No Vacancy"),
            (83, "Father Forgive Me"), (84, "Julep"), (85, "Ticonderoga Club"),
            (86, "The Wig Shop"), (87, "Citrus & Cane"), (88, "Hecate Bar"),
            (89, "Roquette"), (90, "Slice Of Life"),
            (91, "Mount Pleasant Vintage & Provisions"), (92, "Thunderbolt"),
            (93, "Realm of 52 Remedies"), (94, "Bar Mordecai"), (95, "Zapote Bar"),
            (96, "Nickel City"), (97, "The Coldroom"), (98, "Shelter"),
            (99, "Door No.4"),             (100, "Trick Dog"),
        ))
    out(2026,
        "https://www.prnewswire.com/news-releases/line-in-athens-is-no1-as-the-inaugural-list-of-europes-50-best-bars-2026-is-revealed-302815104.html",
        rows(
            (1, "Line"), (2, "The Bar in Front of the Bar"), (3, "Sips"),
            (4, "Himkok"), (5, "Bar Nouveau"), (6, "Moebius Milano"),
            (7, "The Cambridge Public House"), (8, "Mirror Bar"), (9, "Paradiso"),
            (10, "Connaught Bar"), (11, "Satan's Whiskers"),
            (12, "Tayēr + Elementary"), (13, "Barro Negro"), (14, "Baba au Rum"),
            (15, "Svanen"), (16, "Nouvelle Vague"), (17, "Wax On"),
            (18, "Camparino in Galleria"), (19, "Danico"), (20, "Panda & Sons"),
            (21, "Locale Firenze"), (22, "1930"), (23, "Waltz"), (24, "Bird"),
            (25, "Alma Prague"), (26, "Aldea"), (27, "Harry's Bar Paris"),
            (28, "L'Antiquario"), (29, "Gucci Giardino"), (30, "The Clumsies"),
            (31, "Freni e Frizioni"), (32, "Drink Kong"), (33, "Gorilla"),
            (34, "De Vie"), (35, "14 De La Rosa"), (36, "Boadas"), (37, "Tjoget"),
            (38, "Forbína Bar"), (39, "Tag"), (40, "Kwãnt Mayfair"),
            (41, "Three Sheets (Soho)"), (42, "Super Lyan"), (43, "Röda Huset"),
            (44, "Late Bloomers"), (45, "Angelita"), (46, "Salmon Guru"),
            (47, "Scarfes Bar"), (48, "Foco"), (49, "Rita"),             (50, "Dunlin"),
        ), "Europe")


def ingest_pizza_history() -> None:
    """50 Top Pizza World / Europe / North America from 2020 (complete official lists)."""
    from dining_pizza_history import pizza_lists

    for region, year, source, entries in pizza_lists():
        write_list("50-best-pizza", region, year, source, rows(*entries))


def ingest_pizza() -> None:
    """Current-year 50 Top Pizza lists. History (from 2020) is ingest_pizza_history()."""
    europe = rows(
            (1, "Napoli on the Road"), (2, "Baldoria"), (3, "IMperfetto"),
            (4, "50 Kalò"), (5, "Sartoria Panatieri"), (6, "Pizza Zulu"),
            (7, "nNea"), (8, "Sapori Italiani U Taliana"), (9, "Forno d'Oro"),
            (10, "Via Toledo"), (11, "Fratelli Figurato"), (12, "Surt"),
            (13, "Stile Napoletano"), (14, "Oura"), (15, "La Piola Pizza"),
            (16, "Demaio"), (17, "Balmesina"), (18, "Zielona Górka"),
            (19, "Matto Napoletano"), (20, "Franko's Pizza & Bar"),
            (21, "Pietra"), (22, "MaMeMi"), (23, "Oobatz"), (24, "Roco"),
            (25, "Forza"), (26, "DA NOI"), (27, "450°C"), (28, "L'Antica Pizzeria"),
            (29, "La Pizza è Bella"), (30, "Pizza Nuova"), (31, "Buon Appetito"),
            (32, "Arte Bianca"), (33, "Ciao a Tutti"), (34, "Pop's Pizza"),
            (35, "La Manifattura"), (36, "FILO D'OLIO"), (37, "Majstor i Margarita"),
            (38, "NAPIZZA"), (39, "Gasparic"), (40, "Belli di Mamma"),
            (41, "Calvello's"), (42, "Fimmina"), (43, "ALBA"), (44, "450 Gradi"),
            (45, "Margherita Pizzeria"), (46, "Villa Severino"), (47, "Paneólio"),
            (48, "Connie's Pizza"), (49, "UNO Pizza"), (50, "Bottega Ceccarelli"),
            (51, "ZANO"), (52, "Mamma Pizza"), (53, "MOZZ."), (54, "O'Panuozzo"),
            (55, "Paesano Pizza"), (56, "Napul'è"), (57, "Gemello"),
            (58, "Acqua e Farina"), (59, "'naPizzà"), (60, "Bella Napoli"),
        )
    apply_cities(europe, parse_pizza_ranking(SOURCES / "50-best-pizza-europe-2026.md"))
    write_list("50-best-pizza", "Europe", 2026,
        "https://www.50toppizza.it/50-top-pizza-europa-2026-napoli-on-the-road-in-london-is-the-best-pizzeria-in-europe-for-2026/",
        europe)
    usa = rows(
            (1, "Una Pizza Napoletana"), (2, "Pizzeria Sei"),
            (2, "Tony's Pizza Napoletana"), (3, "Razza"), (4, "Truly Pizza"),
            (5, "Francesco Martucci"), (6, "Don Antonio"), (7, "Jay's"),
            (8, "Ribalta"), (8, "Robert's"), (9, "Leña"),
            (10, "Ken's Artisan Pizza"), (11, "La Leggenda"), (11, "'O Munaciello"),
            (12, "Valentina's"), (13, "Stretch Pizza"), (14, "Audace"),
            (15, "Pasquale's"), (15, "Pizza Secret"), (16, "Pizzeria Beddia"),
            (17, "Ops"), (18, "Partenope Ristorante"),
            (19, "Mission Pizza Napoletana"), (20, "Inferno Pizzeria Napoletana"),
            (21, "Kesté"), (22, "Flour House"), (23, "Il Forno"),
            (24, "Fabrica Pizza"), (25, "Nardò"), (26, "GRANA"),
            (27, "Pizza Delicious"), (28, "Coals"), (29, "Craft 64"),
            (30, "Sho Pizza Bar"), (31, "Bricco"), (32, "Salsa"),
            (33, "Antico Pizza"), (34, "Zeneli"), (35, "Posto"),
            (36, "Andrew Bellucci's Pizzeria"), (37, "A Modo Mio"),
            (38, "Tribute Pizza"), (39, "Pasquale Jones"), (40, "Pizzeria Florian"),
            (41, "Penelope Pizza"), (42, "Pizza Baby"), (43, "Coda di Volpe"),
            (44, "Angeli's Pizzeria"), (45, "Lincoln Winebar"), (46, "Hapa Pizza"),
            (47, "Si Cara"), (48, "Nostrana"), (49, "Quattro"),
            (50, "Lucky Dough Pizza"),
        )
    apply_cities(usa, parse_pizza_ranking(SOURCES / "50-best-pizza-usa-2026.md"))
    write_list("50-best-pizza", "North America", 2026,
        "https://www.50toppizza.it/50-top-pizza-usa-2026-una-pizza-napoletana-in-new-york-is-the-best-pizzeria-in-the-usa-for-2026/",
        usa)
    world = rows(
            (1, "I Masanielli – Francesco Martucci"), (1, "Una Pizza Napoletana"),
            (2, "The Pizza Bar on 38th"), (3, "Leggera Pizza Napoletana"),
            (4, "Confine"), (4, "Diego Vitagliano Pizzeria"),
            (5, "Napoli on the Road"), (6, "Seu Pizza Illuminati"), (7, "I Tigli"),
            (8, "Baldoria"), (9, "Pizzeria Sei"), (10, "Tony's Pizza Napoletana"),
            (11, "Cambia-Menti di Ciccio Vitiello"), (12, "50 Kalò"),
            (13, "RistoPizza by Napoli sta ca"), (14, "Jay's"), (15, "Dry Milano"),
            (16, "La Cascina dei Sapori"), (17, "La Notizia"),
            (18, "Fiata by Salvatore Fiata"), (19, "Ribalta"),
            (20, "Sartoria Panatieri"), (20, "Via Toledo"), (21, "Ti Amo"),
            (22, "Massilia"), (23, "Sestogusto"), (24, "Allería"),
            (25, "50 Kalò London"), (26, "Robert's"), (27, "IMperfetto"),
            (28, "Crosta"), (28, "SHOP225"), (29, "Don Antonio"),
            (30, "I Masanielli – Sasà Martucci"), (31, "Ferro e Farinha"),
            (32, "Pizzeria Da Lioniello"), (33, "180 Grammi Pizzeria Romana"),
            (34, "Clementina"), (35, "da Susy"), (36, "A Pizza da Mooca"),
            (36, "QT Pizza Bar"), (37, "Le Grotticelle"),
            (38, "BOB Alchimia a Spicchi"), (39, "La Bolla"), (40, "I Vesuviani"),
            (41, "Flama"), (42, "Pizza Zulu"), (43, "Ken's Artisan Pizza"),
            (44, "Apogeo"), (45, "Bro."), (46, "La Fenice"), (47, "nNea"),
            (48, "Truly Pizza"), (49, "a mano"),
            (49, "Dante's Pizzeria by Enis Baçova"), (50, "Unica Pizzeria"),
            (51, "Bottega"), (52, "Palazzo Petrucci Pizzeria"), (53, "Denis"),
            (54, "Fratelli Figurato"), (55, "La Leggenda"), (55, "'O Munaciello"),
            (56, "Il Segreto di Pulcinella"), (57, "Spacca Napoli"),
            (58, "Pepe in Grani"), (59, "Sapori Italiani U Taliana"),
            (60, "Portarossa"), (61, "Forno d'Oro"), (62, "Raf Bonetta"),
            (63, "La Clásica"), (64, "Pizzeria Beddia"), (65, "Re | Mi"),
            (66, "Pizzeria Braceria CESARI!!"), (67, "Margherí"), (68, "Modus"),
            (69, "Razza"), (70, "La Balmesina"), (70, "La Piola Pizza"),
            (71, "Giangi"), (72, "Surt"), (73, "Stile Napoletano"),
            (74, "L'industrie Pizzeria"), (75, "'O Scugnizzo"), (76, "Demaio"),
            (77, "'O Fiore Mio"), (78, "L'Incanto"), (79, "Franko's Pizza & Bar"),
            (80, "Saccharum"), (81, "Pizza Culture"), (82, "Little Pyg"),
            (83, "Slice & Pie"), (84, "Luca!"), (85, "Giovanni Santarpia"),
            (86, "Meunier"), (87, "I Borboni"), (88, "Gigi Pipa"),
            (89, "Avenida Calò"), (90, "I Fontana"), (91, "Grigoris"),
            (92, "Matto Napoletano"), (93, "48h Pizza e Gnocchi Bar"),
            (94, "Zielona Górka"), (95, "ANTO"), (96, "Veridiana"),
            (97, "da PONE"), (98, "Babette"), (99, "Taglio"), (100, "Pizzammore"),
        )
    apply_cities(world, parse_pizza_ranking(SOURCES / "50-best-pizza-world-2025.md"))
    write_list("50-best-pizza", "World", 2025,
        "https://www.50toppizza.it/50-top-pizza-world-2025-una-pizza-napoletana-by-anthony-mangieri-in-new-york-and-i-masanielli-by-francesco-martucci-in-caserta-these-are-the-best-pizzerias-in-the-world/",
        world)


def ingest_steaks() -> None:
    steaks = rows(
            (1, "La Cúpula"), (2, "Margaret"), (3, "Laia Erretegia"),
            (4, "I Due Cippi"), (5, "Lana"), (6, "Casa Julián"), (7, "Ibai"),
            (8, "AG"), (9, "Burnt Ends"), (10, "Bodega El Capricho"),
            (11, "Firedoor"), (12, "The Eighty Six"), (13, "Hawksmoor"),
            (14, "Aalia"), (15, "Asador Bastian"), (16, "Arkhé"), (17, "Brat"),
            (18, "Fireside"), (19, "Gillis"), (20, "Agnes"), (21, "Cote"),
            (22, "Fogón"), (23, "Carcasse"), (24, "Tributo"), (25, "Miller & Lux"),
            (26, "Born & Bred"), (27, "Gran Torino"), (28, "Hanu"),
            (29, "Steer Dining Room"), (30, "Nikuya Tanaka"),
            (31, "Victor Churchill"), (32, "Elisa"), (33, "The Grill"),
            (34, "La Tête D'or"), (35, "Lutyens Grill"), (36, "Porteño"),
            (37, "Asador Nicolás"), (38, "Rockpool"), (39, "La Braseria"),
            (40, "Daniel's"), (41, "Gwen"), (42, "Blok"), (43, "Capa"),
            (44, "Amaren"), (45, "The Devonshire"), (46, "Char"),
            (47, "Madre Rojas"), (48, "The Gidley"), (49, "Niku Steakhouse"),
            (50, "Beefbar"), (51, "Jacobs & Co."), (52, "Vuur"),
            (53, "Clover Grill"), (54, "Elena"), (55, "Chelsea Grill"),
            (56, "Anahi"), (57, "Los 33"), (58, "Jeffrey's"), (59, "20 Chapel"),
            (60, "11 Woodfire"), (61, "Magma"), (62, "Gimlet"), (63, "Linny's"),
            (64, "Butcherstable"), (65, "Prime + Proper"), (66, "Grill Royal"),
            (67, "American Cut"), (68, "Keens Steakhouse"), (69, "Sperling & Co."),
            (70, "Txula Steak"), (71, "Bazaar Meat"), (72, "Brutus Tavern"),
            (73, "Swift & Sons"), (74, "Maven"), (75, "Regina Bistecca"),
            (76, "Firewood"), (77, "SK Steak & Oyster"), (78, "Carna"),
            (79, "Matilda 159"), (80, "The Steak House"), (81, "Meatmaiden"),
            (82, "Happening"), (83, "Shatōburian"), (84, "Gage & Tollner"),
            (85, "Shell House"), (86, "Beef & Glory"), (87, "Gallaghers"),
            (88, "Bisteca"), (89, "The Grand Bar & Grill"), (90, "Sagardi"),
            (91, "Fat Rabbit"), (92, "Carnal Steakhouse"),
            (93, "The Cut Bar & Grill"), (94, "Soichiro"), (95, "Grill Americano"),
            (96, "Zoilo"), (97, "Bistecca"), (98, "The Blockman"),
            (99, "The Guinea Grill"), (100, "Izzy's Steaks & Chops"),
            (101, "Brado"),
        )
    apply_cities(steaks, parse_pearl(STEAKS_PEARL))
    for e in steaks:
        if e["rank"] == 101 and not e.get("city"):
            e["city"] = "Barcelona"
    write_list("101-best-steakhouse", "World", 2026,
        "https://robbreport.com.my/savour/food/world-best-steakhouses-2026/",
        steaks)


def ingest_burgers() -> None:
    text = BURGERS_PEARL.read_text()
    found = {int(r): n.strip() for n, r in re.findall(r"^### (.+)\n\n#(\d+)", text, flags=re.M)}
    found[7] = "Hawksmoor St Pancras"
    found[72] = "Peckish"
    # Pearl/Timeout leave #99 unpublished in the dumps we have — do not invent it.
    pearl_cities = {r: c for r, _, c in parse_pearl(BURGERS_PEARL)}
    pearl_cities[7] = "London"
    pearl_cities[72] = "London"
    entries = [
        {"rank": r, "name": found[r], "city": tidy_city(pearl_cities[r])}
        if r in pearl_cities
        else {"rank": r, "name": found[r]}
        for r in sorted(found)
    ]
    write_list(
        "101-best-burgers", "World", 2026,
        "https://joinpearl.co/lists/2026-worlds-101-best-burgers + Timeout UK (7, 72)",
        entries,
    )


def ingest_steaks_history() -> None:
    """World's 101 Best Steak Restaurants, 2020–2025.

    2022–2025 are the official 1–101 graphics from worldbeststeaks.com/press-releases-2025.
    2020–2021 only publish a verified top 10 (site + Wikipedia); do not invent 11–101.
    """
    src = "https://www.worldbeststeaks.com/press-releases-2025"
    write_list("101-best-steakhouse", "World", 2020,
        "https://www.worldbeststeaks.com/ (Wayback 2020-08-09 top 10)",
        rows(
            (1, "Firedoor", "Sydney"), (2, "El Capricho", "Jiménez de Jamuz"),
            (3, "Parrilla Don Julio", "Buenos Aires"), (4, "Hawksmoor", "London"),
            (5, "Asador Etxebarri", "Axpe"), (6, "CUT", "Beverly Hills"),
            (7, "Butcher and Singer", "Philadelphia"), (8, "Gibsons Italia", "Chicago"),
            (9, "Porter House", "New York"), (10, "Beast", "London"),
        ))
    write_list("101-best-steakhouse", "World", 2021,
        "https://en.wikipedia.org/wiki/World%27s_101_Best_Steak_Restaurants",
        rows(
            (1, "Firedoor", "Sydney"), (2, "Parrilla Don Julio", "Buenos Aires"),
            (3, "Hawksmoor", "London"), (4, "Asador Etxebarri", "Axpe"),
            (5, "El Capricho", "Jiménez de Jamuz"), (6, "Butcher and Singer", "Philadelphia"),
            (7, "Gibsons Italia", "Chicago"), (8, "Porter House", "New York"),
            (9, "Keens", "New York"), (10, "CUT", "Beverly Hills"),
        ))
    write_list("101-best-steakhouse", "World", 2022, src, rows(
            (1, "Hawksmoor", "London"), (2, "Parrilla Don Julio", "Buenos Aires"),
            (3, "Firedoor", "Sydney"), (4, "Keens", "New York"),
            (5, "Gibsons Italia", "Chicago"), (6, "CUT", "Beverly Hills"),
            (7, "Bavette's Steakhouse", "Las Vegas"), (8, "Carcasse", "Koksijde"),
            (9, "El Capricho", "Jiménez de Jamuz"), (10, "Nick & Stef's", "Los Angeles"),
            (11, "Restaurang AG", "Stockholm"), (12, "Rockpool Bar and Grill", "Sydney"),
            (13, "Butcher and Singer", "Philadelphia"), (14, "Prime + Proper", "Detroit"),
            (15, "Porter House", "New York"), (16, "Guard and Grace", "Denver"),
            (17, "Chophouse", "Sydney"), (18, "F.X. Buckley", "Dublin"),
            (19, "COTE", "New York"), (20, "Beef & Glory", "Vienna"),
            (21, "Bistecca", "Singapore"), (22, "Beast", "London"),
            (23, "Casa Julián de Tolosa", "Tolosa"), (24, "Dstrikt", "Vienna"),
            (25, "Goodman", "London"), (26, "Knife", "Dallas"),
            (27, "Trattoria Dall'Oste", "Florence"), (28, "Baltaire", "Los Angeles"),
            (29, "Braceria Bifulco", "Naples"), (30, "American Cut Tribeca", "New York"),
            (31, "Gallaghers", "New York"), (32, "Mr Porter", "Amsterdam"),
            (33, "Grill Royal", "Berlin"), (34, "Kingsleys", "Sydney"),
            (35, "Porter & Rye", "Glasgow"), (36, "Anahi", "Paris"),
            (37, "Le Boeuf Volant", "Paris"), (38, "Prime Steak Club", "Mexico City"),
            (39, "George Prime Steak", "Munich"), (40, "La Maison de l'Aubrac", "Paris"),
            (41, "La Cabrera", "Buenos Aires"), (42, "Flat Iron", "London"),
            (43, "George Prime Steak", "Prague"), (44, "Maven", "Antwerp"),
            (45, "Antica Macelleria Cecchini", "Panzano"), (46, "The Grill", "Munich"),
            (47, "Guinea Grill", "London"), (48, "Beefbar", "Monte Carlo"),
            (49, "Zelman Meats", "London"), (50, "Sala de Corte", "Lisbon"),
            (51, "Peter Luger", "New York"), (52, "A Figueira Rubaiyat", "São Paulo"),
            (53, "Rowley's", "London"), (54, "Brick Steakhouse", "Guadalajara"),
            (55, "800°C", "Moscow"), (56, "Swift & Sons", "Chicago"),
            (57, "Holsteins Steakhouse", "Guadalajara"), (58, "Bazaar Meat", "Las Vegas"),
            (59, "Aragawa", "Tokyo"), (60, "La Brigada", "Buenos Aires"),
            (61, "Parador La Huella", "José Ignacio"), (62, "The Blacklock", "London"),
            (63, "Williams Butcher Table", "Zurich"), (64, "Barclay Prime", "Philadelphia"),
            (65, "Jervois Steak House", "Auckland"), (66, "Clover Grill", "Paris"),
            (67, "Wolfgang's", "New York"), (68, "NV-80", "Cape Town"),
            (69, "Meat & Liquor", "New Plymouth"), (70, "Les Oreilles et la Queue", "Paris"),
            (71, "Rib'n Reef", "Montreal"), (72, "Retour", "Copenhagen"),
            (73, "L'Argot", "Lyon"), (74, "APL", "Los Angeles"),
            (75, "Marco Pierre White", "Dublin"), (76, "Beef", "Kyiv"),
            (77, "Butcher & Vine", "Melbourne"), (78, "Butcher & Grill", "Cape Town"),
            (79, "Ojo de Agua", "Frankfurt"), (80, "Stripsteak", "Miami Beach"),
            (81, "Gwen", "Los Angeles"), (82, "The Coal Shed", "London"),
            (83, "Napa Grill", "Zurich"), (84, "Prime 68", "Dubai"),
            (85, "Leña", "Marbella"), (86, "The Meat Co.", "Dubai"),
            (87, "Amaren", "Bilbao"), (88, "Midtown Grill", "Amsterdam"),
            (89, "Catch Steak", "New York"), (90, "Marcelleria", "Melbourne"),
            (91, "Osteria di Nandone", "Scarperia"), (92, "Braceria Elvetica", "Lugano"),
            (93, "Griffins", "Stockholm"), (94, "Bowery Meat Co.", "New York"),
            (95, "Sparks", "New York"), (96, "Beef", "Geneva"),
            (97, "Entrecote", "Melbourne"), (98, "Bateau", "Seattle"),
            (99, "Jean-Georges", "Las Vegas"), (100, "Asina Luna", "Milan"),
            (101, "Wadakin", "Osaka"),
        ))
    write_list("101-best-steakhouse", "World", 2023, src, rows(
            (1, "Parrilla Don Julio", "Buenos Aires"), (2, "Hawksmoor", "London"),
            (3, "American Cut Tribeca", "New York"), (4, "Carcasse", "Koksijde"),
            (5, "El Capricho", "Jiménez de Jamuz"), (6, "F.X. Buckley", "Dublin"),
            (7, "I Due Cippi", "Saturnia"), (8, "Rockpool Bar and Grill", "Sydney"),
            (9, "Lana", "Madrid"), (10, "Bazaar Meat", "Las Vegas"),
            (11, "Restaurang AG", "Stockholm"), (12, "CUT at 45 Park Lane", "London"),
            (13, "COTE", "New York"), (14, "Amaren", "Bilbao"),
            (15, "Guard and Grace", "Denver"), (16, "Porter House", "New York"),
            (17, "Gibsons Italia", "Chicago"), (18, "Bavette's Steakhouse", "Las Vegas"),
            (19, "Beef & Glory", "Vienna"), (20, "Gallaghers", "New York"),
            (21, "Casa Julián de Tolosa", "Tolosa"), (22, "Prime + Proper", "Detroit"),
            (23, "Bistecca", "Singapore"), (24, "Trattoria Dall'Oste", "Florence"),
            (25, "Knife", "Dallas"), (26, "Nick & Stef's", "Los Angeles"),
            (27, "Keens", "New York"), (28, "Piatao", "Madrid"),
            (29, "Dstrikt", "Vienna"), (30, "George Prime Steak", "Munich"),
            (31, "Kingsleys", "Sydney"), (32, "Bistecca", "Sydney"),
            (33, "Maven", "Antwerp"), (34, "Sala de Corte", "Lisbon"),
            (35, "Klaw", "Miami"), (36, "Elisa", "Vancouver"),
            (37, "Beast", "London"), (38, "Peter Luger", "New York"),
            (39, "Le Petit Beefbar", "London"), (40, "Porteño", "Sydney"),
            (41, "Goodman", "London"), (42, "La Braseria", "Osio Sotto"),
            (43, "The Gidley", "Sydney"), (44, "Anahi", "Paris"),
            (45, "Regina Bistecca", "Florence"), (46, "800°C", "Moscow"),
            (47, "Butcher and Singer", "Philadelphia"), (48, "La Cabrera", "Buenos Aires"),
            (49, "Beef", "Geneva"), (50, "A Figueira Rubaiyat", "São Paulo"),
            (51, "Steer Dining Room", "Melbourne"), (52, "The Blacklock", "London"),
            (53, "Gwen", "Los Angeles"), (54, "Williams Butcher Table", "Zurich"),
            (55, "Porter & Rye", "Glasgow"), (56, "Swift & Sons", "Chicago"),
            (57, "Barclay Prime", "Philadelphia"), (58, "Napa Grill", "Zurich"),
            (59, "Le Boeuf Volant", "Paris"), (60, "Grill Royal", "Berlin"),
            (61, "Temper", "London"), (62, "Rowley's", "London"),
            (63, "Mr Porter", "Amsterdam"), (64, "Brick Steakhouse", "Guadalajara"),
            (65, "Jervois Steak House", "Auckland"), (66, "Asina Luna", "Milan"),
            (67, "Guinea Grill", "London"), (68, "NV-80", "Cape Town"),
            (69, "Meat & Liquor", "New Plymouth"), (70, "Pasture", "Cardiff"),
            (71, "The Grill", "Munich"), (72, "Braceria Elvetica", "Lugano"),
            (73, "La Maison de l'Aubrac", "Paris"), (74, "Steakhouse", "Seoul"),
            (75, "Baltaire", "Los Angeles"), (76, "Sparks", "New York"),
            (77, "Butcher & Vine", "Melbourne"), (78, "Bifrò", "Turin"),
            (79, "Tributo", "Quito"), (80, "Stripsteak", "Miami Beach"),
            (81, "Rib'n Reef", "Montreal"), (82, "Retour", "Copenhagen"),
            (83, "Fife Lane", "Mount Maunganui"), (84, "Niku Steakhouse", "San Francisco"),
            (85, "Butcher's Block", "Singapore"), (86, "Beef", "Kyiv"),
            (87, "Clover Grill", "Paris"), (88, "Midtown Grill", "Amsterdam"),
            (89, "Catch Steak", "New York"), (90, "Marcelleria", "Melbourne"),
            (91, "Zelman Meats", "London"), (92, "Bull & Bell", "Griffith"),
            (93, "Griffins", "Stockholm"), (94, "Bowery Meat Co.", "New York"),
            (95, "El Santuari", "Les Masies de Voltregà"), (96, "Butcher & Grill", "Cape Town"),
            (97, "Entrecote", "Melbourne"), (98, "Bateau", "Seattle"),
            (99, "Jean-Georges", "Las Vegas"), (100, "The Meat Co.", "Dubai"),
            (101, "Gillis", "Gent"),
        ))
    write_list("101-best-steakhouse", "World", 2024, src, rows(
            (1, "Parrilla Don Julio", "Buenos Aires"), (2, "Bodega El Capricho", "Jiménez de Jamuz"),
            (3, "Margaret", "Sydney"), (4, "COTE", "New York"),
            (5, "Carcasse", "Koksijde"), (6, "I Due Cippi", "Saturnia"),
            (7, "Laia Erretegia", "Hondarribia"), (8, "Rockpool Bar & Grill", "Sydney"),
            (9, "Restaurang AG", "Stockholm"), (10, "CUT at 45 Park Lane", "London"),
            (11, "Victor Churchill", "Melbourne"), (12, "Hawksmoor", "Dublin"),
            (13, "Casa Julián de Tolosa", "Tolosa"), (14, "Asador Bastian", "Chicago"),
            (15, "Los 33", "Madrid"), (16, "Amaren", "Bilbao"),
            (17, "Steer Dining Room", "Melbourne"), (18, "Lana", "Madrid"),
            (19, "Regina Bistecca", "Florence"), (20, "Elisa", "Vancouver"),
            (21, "Niku Steakhouse", "San Francisco"), (22, "Beefbar", "New York"),
            (23, "Capa", "Copenhagen"), (24, "The Gidley", "Sydney"),
            (25, "Jeffrey's", "Austin"), (26, "Prime Steak Club", "Mexico City"),
            (27, "Dorian", "London"), (28, "Aragawa", "London"),
            (29, "La Braseria", "Osio Sotto"), (30, "Beef & Glory", "Vienna"),
            (31, "Gillis", "Gent"), (32, "Holsteins", "Monterrey"),
            (33, "Tributo", "Quito"), (34, "American Cut", "New York"),
            (35, "Anahi", "Paris"), (36, "Fogón", "Buenos Aires"),
            (37, "Bifrò", "Turin"), (38, "Bistecca", "Singapore"),
            (39, "Bazaar Meat", "Chicago"), (40, "Keens", "New York"),
            (41, "Beast", "London"), (42, "Klaw", "Miami"),
            (43, "Trattoria Dall'Oste", "Florence"), (44, "Gwen", "Los Angeles"),
            (45, "Bistecca", "Sydney"), (46, "Clover Grill", "Paris"),
            (47, "Guard and Grace", "Denver"), (48, "Pasture", "Cardiff"),
            (49, "Maven", "Antwerp"), (50, "F.X. Buckley", "Dublin"),
            (51, "Williams Butcherstable", "Zurich"), (52, "Knife", "Dallas"),
            (53, "Sala de Corte", "Lisbon"), (54, "Grill im Künstlerhaus", "Munich"),
            (55, "Goodman", "London"), (56, "Baltaire", "Los Angeles"),
            (57, "Napa Grill", "Zurich"), (58, "Asina Luna", "Milan"),
            (59, "Piatao", "Madrid"), (60, "Prime + Proper", "Detroit"),
            (61, "Gallaghers", "New York"), (62, "Swift & Sons", "Chicago"),
            (63, "George Prime Steak", "Munich"), (64, "La Cabrera", "Buenos Aires"),
            (65, "Asador Nicolás", "Tolosa"), (66, "Nick & Stef's", "Los Angeles"),
            (67, "Bavette's Steakhouse", "Chicago"), (68, "Beef", "Kyiv"),
            (69, "Fife Lane", "Mount Maunganui"), (70, "Fireside", "Hong Kong"),
            (71, "Porteño", "Sydney"), (72, "Elena", "Buenos Aires"),
            (73, "Jacobs & Co.", "Toronto"), (74, "Lutyens Grill", "London"),
            (75, "GT Prime", "Chicago"), (76, "Temper", "London"),
            (77, "Porter House", "New York"), (78, "Brick Steakhouse", "Guadalajara"),
            (79, "Le Boeuf Volant", "Paris"), (80, "Gibsons Italia", "Chicago"),
            (81, "Varrone", "Milan"), (82, "Porter & Rye", "Glasgow"),
            (83, "Grill Royal", "Berlin"), (84, "Peter Luger", "New York"),
            (85, "Minetta Tavern", "New York"), (86, "Entrecote", "Melbourne"),
            (87, "Dstrikt", "Vienna"), (88, "Vuur", "Stellenbosch"),
            (89, "Kingsleys", "Sydney"), (90, "Beef", "Geneva"),
            (91, "A Figueira Rubaiyat", "São Paulo"), (92, "The Meat Co.", "Dubai"),
            (93, "Grill", "Hamburg"), (94, "Gimlet", "Melbourne"),
            (95, "Taberna Pedraza", "Madrid"), (96, "Griffins", "Stockholm"),
            (97, "Guinea Grill", "London"), (98, "Grill Americano", "Melbourne"),
            (99, "NV-80", "Cape Town"), (100, "The Grand Bar & Grill", "Helsinki"),
            (101, "The Steak House", "Hong Kong"),
        ))
    write_list("101-best-steakhouse", "World", 2025, src, rows(
            (1, "Parrilla Don Julio", "Buenos Aires"), (2, "Margaret", "Sydney"),
            (3, "Laia Erretegia", "Hondarribia"), (4, "I Due Cippi", "Saturnia"),
            (5, "Burnt Ends", "Singapore"), (6, "Bodega El Capricho", "Jiménez de Jamuz"),
            (7, "Casa Julián", "Tolosa"), (8, "Lana", "Madrid"),
            (9, "AG", "Stockholm"), (10, "COTE", "New York"),
            (11, "Ibai", "London"), (12, "Rockpool Bar & Grill", "Sydney"),
            (13, "Asador Bastian", "Chicago"), (14, "The International", "Sydney"),
            (15, "Born & Bred", "Seoul"), (16, "Firedoor", "Sydney"),
            (17, "La Tête d'Or", "New York"), (18, "Victor Churchill", "Melbourne"),
            (19, "Carcasse", "Koksijde"), (20, "Porteño", "Sydney"),
            (21, "Capa", "Copenhagen"), (22, "Gillis", "Gent"),
            (23, "Hawksmoor", "London"), (24, "Brat", "London"),
            (25, "La Braseria", "Osio Sotto"), (26, "Elisa", "Vancouver"),
            (27, "Nikuya Tanaka", "Tokyo"), (28, "Los 33", "Madrid"),
            (29, "Regina Bistecca", "Florence"), (30, "Tributo", "Quito"),
            (31, "Amaren", "Bilbao"), (32, "The Gidley", "Sydney"),
            (33, "Beefbar", "Monaco"), (34, "Anahi", "Paris"),
            (35, "Fogón", "Buenos Aires"), (36, "Aalia", "Sydney"),
            (37, "Steer Dining Room", "Melbourne"), (38, "11 Woodfire", "Dubai"),
            (39, "Lutyens Grill", "London"), (40, "Miyoshi", "Kyoto"),
            (41, "Aragawa", "London"), (42, "Clover Grill", "Paris"),
            (43, "Gwen", "Los Angeles"), (44, "4 Charles Prime Rib", "New York"),
            (45, "Gimlet", "Melbourne"), (46, "Kitan-in", "Osaka"),
            (47, "Knife", "Dallas"), (48, "Asador Nicolás", "Tolosa"),
            (49, "Niku Steakhouse", "San Francisco"), (50, "Fireside", "Hong Kong"),
            (51, "Shell House", "Sydney"), (52, "Jeffrey's", "Austin"),
            (53, "Bistecca", "Singapore"), (54, "Koki", "Hanoi"),
            (55, "Blok", "Pontyclun"), (56, "Elena", "Buenos Aires"),
            (57, "Matilda 159 Domain", "Melbourne"), (58, "Keens", "New York"),
            (59, "CUT by Wolfgang Puck", "Singapore"), (60, "The Bazaar", "New York"),
            (61, "Char", "Tenerife"), (62, "The Cut Bar & Grill", "Sydney"),
            (63, "Minetta Tavern", "New York"), (64, "Grill Royal", "Berlin"),
            (65, "Beef & Glory", "Vienna"), (66, "Shatōburian", "Singapore"),
            (67, "Holsteins", "Monterrey"), (68, "Firewood", "George Town"),
            (69, "Prime + Proper", "Detroit"), (70, "The Devonshire", "London"),
            (71, "Swift & Sons", "Chicago"), (72, "The Grand Bar & Grill", "Helsinki"),
            (73, "Gallaghers", "New York"), (74, "Maven", "Antwerp"),
            (75, "American Cut", "New York"), (76, "Jacobs & Co.", "Toronto"),
            (77, "Bavette's", "Chicago"), (78, "Izzy's", "San Francisco"),
            (79, "Beef", "Kyiv"), (80, "The Steak House", "Hong Kong"),
            (81, "Sala de Corte", "Lisbon"), (82, "Williams Butchers Table", "Zurich"),
            (83, "Niku Kappō Jō", "Tokyo"), (84, "Nuri Steakhouse", "Dallas"),
            (85, "Porter & Rye", "Glasgow"), (86, "Okadamae", "Tokyo"),
            (87, "Vuur", "Stellenbosch"), (88, "Gage & Tollner", "New York"),
            (89, "Guinea Grill", "London"), (90, "Meatguy", "Jakarta"),
            (91, "Meatmaiden", "Melbourne"), (92, "Grill Americano", "Melbourne"),
            (93, "20 Chapel", "Sydney"), (94, "Fife Lane", "Mount Maunganui"),
            (95, "Hermanos", "Buenos Aires"), (96, "Fukutatei The Ukai", "Osaka"),
            (97, "The Blockman", "Johannesburg"), (98, "Sugita", "Tokyo"),
            (99, "Bistecca", "Sydney"), (100, "Wagyumafia Steakhouse", "Tokyo"),
            (101, "Brutus Tavern", "Athens"),
        ))


def ingest_burgers_history() -> None:
    """World's 101 Best Burger Places started in 2026. 2025 was World's 25 Best Burgers."""
    write_list(
        "101-best-burgers", "World", 2025,
        "https://www.timeout.com/news/the-surprising-european-city-home-to-the-worlds-best-burger-091725",
        rows(
            (1, "Hundred Burgers", "Valencia"), (2, "Bleecker Burger", "London"),
            (3, "Black Bear Burger", "London"), (4, "Popl Burger", "Copenhagen"),
            (5, "Funky Chicken Food Truck", "Stockholm"), (6, "Gasoline Grill", "Copenhagen"),
            (7, "La Birra Bar", "Buenos Aires"), (8, "Hawksmoor", "London"),
            (9, "Burger & Beyond", "London"), (10, "Next Door", "Sydney"),
            (11, "Dove", "London"), (12, "The Gidley", "Sydney"),
            (13, "Sip & Guzzle", "New York"), (14, "Charrd", "Melbourne"),
            (15, "Nowon", "New York"), (16, "All or Nothing Burger", "Alicante"),
            (17, "Gui's Burger", "Ashiya"), (18, "11 Woodfire", "Dubai"),
            (19, "The Loyalist", "Chicago"), (20, "Salt Shed", "Brighton"),
            (21, "Red Hook Tavern", "New York"), (22, "Reburger", "Florence"),
            (23, "4 Charles Prime Rib", "New York"), (24, "Amboy", "Los Angeles"),
            (25, "Heard", "London"),
        ),
    )


def main() -> int:
    global ATLAS
    print("writing list files")
    ATLAS = city_atlas()
    ingest_nyt()
    ingest_world_restaurants()
    ingest_na_restaurants()
    ingest_world_bars()
    ingest_na_europe_bars()
    ingest_pizza()
    ingest_pizza_history()
    ingest_steaks()
    ingest_steaks_history()
    ingest_burgers()
    ingest_burgers_history()
    if MISSING:
        print(f"\n{len(MISSING)} entries still missing city:")
        for line in MISSING:
            print(f"  {line}")
    else:
        print("all entries have city")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
