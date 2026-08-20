"""Historical 50 Top Pizza lists (World / Europe / North America).

World combined ranking starts in 2022. USA skipped 2020 (COVID).
Europe 2020 is the first complete Europe 50. Call from dining-rankings-ingest.py.
"""
from __future__ import annotations

import re

CITY_EN = {
    "amsterdam": "Amsterdam",
    "anversa": "Antwerp",
    "antwerp": "Antwerp",
    "arezzo": "Arezzo",
    "athens": "Athens",
    "atene": "Athens",
    "auckland": "Auckland",
    "barcelona": "Barcelona",
    "barcellona": "Barcelona",
    "beijing": "Beijing",
    "belgio": "Belgium",
    "belgrado": "Belgrade",
    "belgrade": "Belgrade",
    "berlino": "Berlin",
    "berlin": "Berlin",
    "bilbao": "Bilbao",
    "brooklyn": "New York, NY",
    "bruxelles": "Brussels",
    "brussels": "Brussels",
    "bucarest": "Bucharest",
    "bucharest": "Bucharest",
    "budapest": "Budapest",
    "buenos aires": "Buenos Aires",
    "cairo": "Cairo",
    "caserta": "Caserta",
    "chicago": "Chicago",
    "città del messico": "Mexico City",
    "copenhagen": "Copenhagen",
    "copenaghen": "Copenhagen",
    "dublino": "Dublin",
    "dublin": "Dublin",
    "dubai": "Dubai",
    "etterbeek": "Etterbeek",
    "falkenberg": "Falkenberg",
    "firenze": "Florence",
    "fürth": "Fürth",
    "furth": "Fürth",
    "galway": "Galway",
    "geneva": "Geneva",
    "gent": "Ghent",
    "ghent": "Ghent",
    "ginevra": "Geneva",
    "glasgow": "Glasgow",
    "helsinki": "Helsinki",
    "hong kong": "Hong Kong",
    "kiev": "Kyiv",
    "lisbon": "Lisbon",
    "lisbona": "Lisbon",
    "londra": "London",
    "london": "London",
    "los angeles": "Los Angeles",
    "lubliana": "Ljubljana",
    "lubiana": "Ljubljana",
    "ljubljana": "Ljubljana",
    "lugano": "Lugano",
    "madrid": "Madrid",
    "manchester": "Manchester",
    "melbourne": "Melbourne",
    "messina": "Messina",
    "miami": "Miami",
    "milano": "Milan",
    "milan": "Milan",
    "monaco di baviera": "Munich",
    "mosca": "Moscow",
    "moscow": "Moscow",
    "munich": "Munich",
    "napoli": "Naples",
    "naples": "Naples",
    "new york": "New York, NY",
    "oslo": "Oslo",
    "palermo": "Palermo",
    "parigi": "Paris",
    "paris": "Paris",
    "pechino": "Beijing",
    "phoenix": "Phoenix",
    "portland": "Portland",
    "praga": "Prague",
    "prague": "Prague",
    "roma": "Rome",
    "rome": "Rome",
    "san francisco": "San Francisco",
    "san paolo": "São Paulo",
    "são paulo": "São Paulo",
    "seoul": "Seoul",
    "sydney": "Sydney",
    "tallinn": "Tallinn",
    "tokyo": "Tokyo",
    "varsavia": "Warsaw",
    "vienna": "Vienna",
    "warsaw": "Warsaw",
    "washington": "Washington, DC",
    "zurigo": "Zurich",
    "zurich": "Zurich",
    "zürich": "Zurich",
    "zagabria": "Zagreb",
    "zagreb": "Zagreb",
}


def city_en(city: str) -> str:
    c = re.sub(r"\s*\([^)]*\)\s*", " ", city or "").strip()
    c = re.sub(r"\s+", " ", c).strip(" ,")
    return CITY_EN.get(c.lower(), c)


def tsv(blob: str) -> list[tuple[int, str, str]]:
    out = []
    for line in blob.strip().splitlines():
        rank_s, name, city = line.split("\t")
        out.append((int(rank_s), name.strip(), city_en(city.strip())))
    return out


# Official 50toppizza.it ranking pages unless noted.
EUROPE_2020 = (
    "https://www.50toppizza.it/50-top-europe-2020/",
    tsv("""
1	50 Kalò di Ciro Salvo Pizzeria London	London
2	Via Toledo Enopizzeria	Vienna
3	Bijou	Paris
4	Bæst	Copenhagen
5	La Pizza è Bella	Brussels
6	Malafemmena	Berlin
7	Lilla Napoli	Falkenberg
8	nNea	Amsterdam
9	Pizzeria Luca	Copenhagen
10	Fratelli Figurato	Madrid
11	Kytaly	Geneva
12	La Bottega Siciliana	Moscow
13	L'Antica Pizzeria	London
14	Daroco Bourse	Paris
15	Pizzeria Luca	Helsinki
16	Cirillo's	Dublin
17	60 Secondi Pizza Napoletana	Munich
18	Oi Vita Pizzeria	London
19	Faggio Pizzeria	Paris
20	Vinoteket	Oslo
21	The Dough Bros	Galway
22	Forno d'Oro	Lisbon
23	'O Ver St. James's	London
24	Araldo Arte del Gusto	Madrid
25	Vicoli di Napoli	London
26	Guillaume Grasso La vera Pizza Napoletana	Paris
27	Dalmata	Paris
28	MadreLievito Llacuna	Barcelona
29	Peppe Pizzeria	Paris
30	La Piola Pizza	Brussels
31	Acqua & Farina	Lugano
32	La Balmesina	Barcelona
33	Double Zero Neapolitan Pizza	Manchester
34	Positano	Kyiv
35	Sodo Pizza	London
36	Oro di Napoli	Santa Cruz de Tenerife
37	Paesano Pizza	Glasgow
38	450°C	Turku
39	NAPLES Authentic Neapolitan Pizza	Fürth
40	Pizza Nuova	Prague
41	450 Gradi	Lidingö
42	De Superette Pizza	Ghent
43	Scrocchiarella	Moscow
44	Belli di Mamma	Budapest
45	Majstor I Margarita	Belgrade
46	Pizza 22 cm	Moscow
47	Animaletto Pizza Bar	Bucharest
48	Nonna Pizzeria	Warsaw
49	Ave Pizza	Warsaw
50	Kaja Pizza Köök	Tallinn
"""),
)

EUROPE_2021 = (
    "https://www.50toppizza.it/50-top-europe-2021-peppe-pizzeria-in-paris-has-been-named-this-years-best-european-pizzeria/",
    tsv("""
1	Peppe Pizzeria	Paris
2	Via Toledo Enopizzeria	Vienna
3	Fratelli Figurato	Madrid
4	50 Kalò di Ciro Salvo Pizzeria London	London
5	Bæst	Copenhagen
6	nNea	Amsterdam
7	Lilla Napoli	Falkenberg
8	La Piola Pizza	Brussels
9	Naples Authentic Neapolitan Pizza	Fürth
10	Kytaly	Geneva
11	Sartoria Panatieri	Barcelona
12	Pizzeria Luca	Copenhagen
13	Pizza 22 CM	Moscow
14	Malafemmena	Berlin
15	Napoli on The Road	London
16	Dalmata	Paris
17	Ti Spiseri&Bar	Sandnes
18	Pizzeria Luca	Helsinki
19	La Pizza è Bella Gourmet	Etterbeek
20	Forno d'Oro	Lisbon
21	L'Antica Pizzeria	London
22	Futura Neapolitan Pizza	Berlin
23	Faggio Pizzeria	Paris
24	'O ver	London
25	Guillaume Grasso La Vera Pizza Napoletana	Paris
26	San Gennaro	Zurich
27	The Dough Bros	Galway
28	La Bottega Siciliana	Moscow
29	La Balmesina	Barcelona
30	Ciao a Tutti	Warsaw
31	60 Secondi Pizza Napoletana	Munich
32	Surt	Copenhagen
33	Bijou	Paris
34	Positano	Kyiv
35	Verace	Ljubljana
36	450°C	Turku
37	Pizza Nuova	Prague
38	Oro di Napoli	Santa Cruz de Tenerife
39	Paesano Pizza	Glasgow
40	450 Gradi	Lidingö
41	Roostiq	Madrid
42	Belli di Mamma	Budapest
43	Majstor I Margarita	Belgrade
44	Animaletto Pizza Bar	Bucharest
45	R14	Saint Petersburg
46	Kaja Pizza Köök	Tallinn
47	Franko's Pizza & Bar	Zagreb
48	Cupola	Athens
49	Basilicò	Bratislava
50	Street Pizza	Riga
"""),
)

EUROPE_2022 = (
    "https://www.50toppizza.it/50-top-pizza-europe-2022-peppe-pizzeria-in-paris-has-been-named-the-best-pizzeria-in-europe/",
    tsv("""
1	Peppe Pizzeria	Paris
2	Fratelli Figurato	Madrid
3	50 Kalò London	London
4	Bæst	Copenhagen
5	Sartoria Panatieri	Barcelona
6	Via Toledo Enopizzeria	Vienna
7	Pizza Zulù	Fürth
8	La Piola Pizza	Brussels
9	Kytaly	Geneva
10	La Balmesina	Barcelona
11	nNea	Amsterdam
12	La Pizza è Bella Gourmet	Brussels
13	Napoli on The Road	London
14	Malafemmena	Berlin
15	Pizzeria Luca	Copenhagen
16	Forno d'Oro	Lisbon
17	400° Laboratorio	Paris
18	L'Antica Pizzeria	London
19	The Dough Bros	Galway
20	San Gennaro	Zurich
21	'O Ver	London
22	Forza	Helsinki
23	Guillaume Grasso	Paris
24	Surt	Copenhagen
25	Futura Neapolitan Pizza	Berlin
26	Pizzeria Luca	Helsinki
27	60 Secondi Pizza Napoletana	Munich
28	Ostro.	Gdańsk
29	450°C	Turku
30	Ciao a Tutti	Warsaw
31	Verace	Nova Gorica
32	Marcella	Brussels
33	Belli di Mamma	Budapest
34	De Superette	Ghent
35	Majstor I Margarita	Belgrade
36	Oro di Napoli	Santa Cruz de Tenerife
37	Pietra	Belgrade
38	Cinquecento	London
39	Casa Nostra	Munich
40	IMperfetto	Puteaux
41	Matto Napoletano	Skopje
42	Demaio	Bilbao
43	Pop's Pizza	Ljubljana
44	Kaja Pizza Köök	Tallinn
45	Franko's Pizza & Bar	Zagreb
46	Street Pizza	Riga
47	Zielona Górka	Pabianice
48	Animaletto Pizza Bar	Bucharest
49	Arte Bianca	Aljezur
50	Pizzeria MaMeMi	Copenhagen
"""),
)

EUROPE_2023 = (
    "https://www.50toppizza.it/50-top-pizza-europa-2023-sartoria-panatieri-has-been-named-the-best-pizzeria-in-europe/",
    tsv("""
1	Sartoria Panatieri	Barcelona
2	Bæst	Copenhagen
3	50 Kalò	London
4	Via Toledo Enopizzeria	Vienna
5	Pizza Zulù	Fürth
6	Fratelli Figurato	Madrid
7	Forza	Helsinki
8	Napoli on the Road	London
9	nNea	Amsterdam
10	La Balmesina	Barcelona
11	IMperfetto	Puteaux
12	La Pizza è Bella Gourmet	Brussels
13	Baldoria	Madrid
14	Kytaly	Geneva
15	La Piola Pizza	Brussels
16	Forno d'Oro	Lisbon
17	Demaio	Bilbao
18	L'Antica Pizzeria	London
19	Malafemmena	Berlin
20	Surt	Copenhagen
21	Guillaume Grasso	Paris
22	'O Ver	London
23	Pizzeria Luca	Copenhagen
24	San Gennaro	Zurich
25	Matto Napoletano	Skopje
26	Belli di Mamma	Budapest
27	Little Pyg	Dublin
28	Odori	Athens
29	Piazza Sorrento	Krefeld
30	La Manifattura	Paris
31	Pizzeria Luca	Helsinki
32	Mr. Pizza	Dortmund
33	Majstor I Margarita	Belgrade
34	Ostro.	Gdańsk
35	450°C	Turku
36	Cloud Factory	Esch-sur-Alzette
37	Animaletto Pizza Bar	Bucharest
38	Ciao a Tutti	Warsaw
39	Pietra	Belgrade
40	Pop's Pizza	Ljubljana
41	Oro di Napoli	Santa Cruz de Tenerife
42	Arte Bianca	Sagres
43	Franko's Pizza & Bar	Zagreb
44	Dalmata	Paris
45	Infraganti Pizza Bar	Alicante
46	Zielona Górka	Pabianice
47	Sapori Italiani U Taliana	Bratislava
48	PEPPO'S – Pizzeria Contemporanea	Riga
49	Pizza Nuova	Prague
50	Kaja Pizza Köök	Tallinn
"""),
)

EUROPE_2024 = (
    "https://www.50toppizza.it/50-top-pizza-europa-2024-napoli-on-the-road-in-london-has-been-named-the-best-pizzeria-in-europe-for-2024/",
    tsv("""
1	Napoli on the Road	London
2	Sartoria Panatieri	Barcelona
3	Via Toledo Enopizzeria	Vienna
4	50 Kalò	London
5	Baldoria	Madrid
6	Pizza Zulu	Fürth
7	IMperfetto	Puteaux
8	nNea	Amsterdam
9	La Balmesina	Barcelona
10	Fratelli Figurato	Madrid
11	La Pizza è Bella	Antwerp
12	Forno d'Oro	Lisbon
13	Surt	Copenhagen
14	Franko's Pizza & Bar	Zagreb
15	Little Pyg	Dublin
16	Matto Napoletano	Skopje
17	Demaio	Bilbao
18	Stile Napoletano	Chester
19	La Piola Pizza	Brussels
20	Zielona Górka	Pabianice
21	Guillaume Grasso	Paris
22	450°C	Turku
23	MaMeMi	Copenhagen
24	Forza	Helsinki
24	Malafemmena	Berlin
25	450 Gradi	Lidingö
25	Odori	Athens
26	L'Antica Pizzeria	London
27	PEPPO's	Riga
28	Ciao a Tutti	Warsaw
29	'O ver	London
30	Pop's Pizza	Ljubljana
31	La Manifattura	Paris
32	Pietra	Belgrade
33	Arte Bianca	Sagres
34	Pizza Nuova	Prague
35	Belli di Mamma	Budapest
36	Sapori Italiani U Taliana	Bratislava
37	Futura Neapolitan Pizza	Berlin
37	Majstor I Margarita	Belgrade
38	Gasparic	Girona
39	Margherita Pizzeria	Tallinn
40	Dalmata	Paris
41	Infraganti	Alicante
42	da PONE	Zurich
43	081 Pizzeria	London
43	Kytaly	Geneva
44	MOZZ.	Ankara
45	Lupita Pizzaria	Lisbon
46	'naPizzà	Brussels
47	Iovine's	Paris
48	Villa Severino	Helsinki
49	ZANO	Iași
50	Papi Mannheim	Mannheim
"""),
)

EUROPE_2025 = (
    "https://www.50toppizza.it/50-top-pizza-europa-2025-napoli-on-the-road-in-london-is-the-best-pizzeria-in-europe/",
    tsv("""
1	Napoli on the Road	London
2	Baldoria	Madrid
3	Sartoria Panatieri	Barcelona
3	Via Toledo	Vienna
4	50 Kalò	London
5	IMperfetto	Puteaux
6	Pizza Zulu	Fürth
7	nNea	Amsterdam
8	Fratelli Figurato	Madrid
9	Sapori Italiani U Taliana	Bratislava
10	Forno d'Oro	Lisbon
11	La Balmesina	Barcelona
11	La Piola Pizza	Brussels
12	Surt	Copenhagen
13	Stile Napoletano	Chester
14	Demaio	Bilbao
15	Franko's Pizza & Bar	Zagreb
16	Little Pyg	Dublin
17	Matto Napoletano	Skopje
18	Zielona Górka	Pabianice
19	da PONE	Zurich
20	Babette	Stockholm
21	La Pizza è Bella	Antwerp
22	Forza	Helsinki
23	MaMeMi	Copenhagen
24	450°C	Turku
25	L'Antica Pizzeria	London
26	Pietra	Belgrade
27	Pizza Nuova	Prague
28	Ciao a Tutti	Warsaw
29	Oobatz	Paris
30	Pop's Pizza	Ljubljana
31	Buon Appetito	Burgess Hill
32	Arte Bianca	Sagres
33	Roco	Paris
34	Majstor i Margarita	Belgrade
35	NAPIZZA	Nuremberg
36	Infraganti	Alicante
37	La Manifattura	Paris
38	Calvello's	Munich
39	Fimmina	Paris
40	Gasparic	Girona
41	Belli di Mamma	Budapest
42	Margherita Pizzeria	Tallinn
43	Kytaly	Geneva
44	'naPizzà	Brussels
45	Villa Severino	Helsinki
46	ZANO	Iași
47	Mamma Pizza	Oslo
48	Bottega Ceccarelli	Braunschweig
49	Filo D'olio	Istanbul
50	O'Panuozzo	Utrecht
"""),
)

USA_2021 = (
    "https://www.50toppizza.it/50-top-pizza-usa-2021-tonys-pizza-napoletana-is-the-best-pizzeria-in-the-united-states-of-america/",
    tsv("""
1	Tony's Pizza Napoletana	San Francisco
2	Una Pizza Napoletana	Atlantic Highlands
3	Spacca Napoli Pizzeria	Chicago
4	Ribalta NYC	New York
5	Razza Pizza Artigianale	Jersey City
6	Pizzeria Bianco	Phoenix
7	Kesté Fulton	New York
8	Ken's Artisan Pizza	Portland
9	Pizzeria Mozza	Los Angeles
10	Bonci	Chicago
11	Bungalow by Middle Brow	Chicago
12	Del Popolo	San Francisco
13	Song' E Napule	New York
14	Lucali	New York
15	Roberta's	New York
16	Ops	New York
17	Pasquale Jones	New York
18	Forno Rosso	Chicago
19	Doppio Zero	San Francisco
20	Pizzeria Locale	Boulder
21	Pizzeria Vetri	Philadelphia
22	Basil & Barley Pizzeria Napoletana	Colorado Springs
23	Forcella	New York
24	Apizza Scholls	Portland
25	Partenope Ristorante	Dallas
26	Il Forno	San Antonio
27	Angelina's Pizzeria Napoletana	Irvine
28	Jay's Artisan Pizzeria	Kenmore
29	Mission Pizza Napoletana	Winston-Salem
30	Inferno Pizzeria Napoletana	Darnestown
31	Coda di Volpe	Chicago
32	A 16	San Francisco
33	San Matteo – Pizzeria e Cucina	New York
34	Brick Fire Tavern	Honolulu
35	Flour House	San Luis Obispo
36	Il Lazzarone	Kansas City
37	Pasquale's Pizzeria	South Kingstown
38	Pizzeria 22	Seattle
39	Il Pizzaiolo	Mt. Lebanon
40	Craft 64	Scottsdale
41	Pizzicletta	Flagstaff
42	Stanzione 87	Miami
43	Coals Artisan Pizza	Louisville
44	Flour + Water Pizzeria	San Francisco
45	Pizzana	Los Angeles
46	Tribute Pizza	San Diego
47	Il Ritrovo	Sheboygan
48	Dellarocco's	New York
49	Patsy's Pizzeria	New York
50	Robert's Pizza and Dough Company	Chicago
"""),
)

USA_2022 = (
    "https://www.50toppizza.it/50-top-pizza-usa-2022-the-pizzeria-una-pizza-napoletana-in-new-york-has-been-named-the-best-pizzeria-in-the-usa/",
    tsv("""
1	Una Pizza Napoletana	New York
2	Tony's Pizza Napoletana	San Francisco
3	Ribalta NYC	New York
4	Razza Pizza Artigianale	Jersey City
5	'O Munaciello	Miami
6	Spacca Napoli Pizzeria	Chicago
7	Song' E Napule	New York
8	La Leggenda Pizzeria	Miami
9	Pizzana	Los Angeles
10	Kesté Fulton	New York
11	Ken's Artisan Pizza	Portland
12	Pizzeria Bianco	Phoenix
13	Jay's Artisan Pizzeria	Kenmore
14	Ops	New York
15	Doppio Zero	San Francisco
16	Lovely's Fifty Fifty	Portland
17	Partenope Ristorante	Dallas
18	Apizza Scholls	Portland
19	Flour House	San Luis Obispo
20	Forcella	New York
21	Pizzeria Mozza	Los Angeles
22	Roberta's	New York
23	Pizzeria Beddia	Philadelphia
24	Mission Pizza Napoletana	Winston-Salem
25	Inferno Pizzeria Napoletana	Darnestown
26	A 16	San Francisco
27	San Matteo – Pizzeria e Cucina	New York
28	Brick Fire Tavern	Honolulu
29	Del Popolo	San Francisco
30	Pasquale Jones	New York
31	Forno Rosso	Chicago
32	Il Forno	San Antonio
33	Pasquale's Pizzeria	South Kingstown
34	Stanzione 87	Miami
35	Coals Artisan Pizza	Louisville
36	Flour + Water Pizzeria	San Francisco
37	Robert's Pizza and Dough Company	Chicago
38	Pomo	Scottsdale
39	Bufalina Due	Austin
40	Nostrana	Portland
41	Basil & Barley Pizzeria Napoletana	Colorado Springs
42	Angelina's Pizzeria Napoletana	Irvine
43	Scottie's Pizza Parlor	Portland
44	Cart-Driver RiNo	Denver
45	Bricco Coal Fired Pizza	Haddon Township
46	Roostica Wood-Fire Pizzeria	Key West
47	Diavola	Indianapolis
48	Spark Pizza	Redmond
49	Fabrica Pizza	Tampa
50	Craft 64	Scottsdale
"""),
)

USA_2023 = (
    "https://www.50toppizza.it/50-top-pizza-usa-2023-una-pizza-napoletana-has-been-named-the-best-pizzeria-in-the-united-states-of-america/",
    tsv("""
1	Una Pizza Napoletana	New York
2	Razza Pizza Artigianale	Jersey City
3	Ken's Artisan Pizza	Portland
4	Tony's Pizza Napoletana	San Francisco
5	Pizzeria Bianco	Phoenix
6	Ribalta	New York
7	'O Munaciello	Miami
8	Jay's Artisan Pizzeria	Kenmore
9	Song' E Napule	New York
10	Kesté	New York
11	La Leggenda Pizzeria	Miami
12	Pasquale's Pizzeria Napoletana	South Kingstown
13	Ops	Brooklyn
14	Spacca Napoli Pizzeria	Chicago
15	Fabrica Pizza	Tampa
16	Partenope Ristorante	Dallas
17	Pizza Secret	New York
18	Pizza Rock	Las Vegas
19	Pizzeria Sei	Los Angeles
20	Apizza Scholls	Portland
21	Flour House	San Luis Obispo
22	Mission Pizza Napoletana	Winston-Salem
23	Inferno Pizzeria Napoletana	Darnestown
24	Il Forno	San Antonio
25	Coals Artisan Pizza	Louisville
26	Nardò Italian Restaurant	Huntington Beach
27	Robert's Pizza and Dough Company	Chicago
28	Bricco Coal Fired Pizza	Haddon Township
29	Nostrana	Portland
30	Craft 64	Scottsdale
31	Spark Pizza	Redmond
32	San Matteo – Pizzeria e Cucina	New York
33	A 16	San Francisco
34	Salsa	New York
35	Antico Pizza Napoletana	Atlanta
36	Tribute Pizza	San Diego
37	Don Antonio	New York
38	Zeneli	New Haven
39	Pizza Delicious	New Orleans
40	PizzElla	Miami Beach
41	Slice & Pie	Washington
42	Pasquale Jones	New York
43	Basil & Barley Pizzeria Napoletana	Colorado Springs
44	Pomo	Scottsdale
45	Oven & Tap	Bentonville
46	Angelina's Pizzeria Napoletana	Irvine
47	Posto	Somerville
48	A Modo Mio	Arlington
49	Yellow Moto Pizzeria	San Francisco
50	786 Degrees	Los Angeles
"""),
)

USA_2024 = (
    "https://www.50toppizza.it/50-top-pizza-usa-2024-una-pizza-napoletana-in-new-york-has-been-reconfirmed-the-best-pizzeria-in-the-united-states/",
    tsv("""
1	Una Pizza Napoletana	New York
2	Tony's Pizza Napoletana	San Francisco
3	Pizzeria Beddia	Philadelphia
4	Ribalta	New York
5	Ken's Artisan Pizza	Portland
6	Jay's	Kenmore
7	Don Antonio	New York
8	Pizzeria Sei	Los Angeles
9	La Leggenda	Miami
10	Robert's	Chicago
11	'O Munaciello	Miami
12	Partenope Ristorante	Dallas
13	Razza Pizza Artigianale	Jersey City
14	Pasquale's	South Kingstown
15	Song' E Napule	New York
16	Kesté	New York
17	Ops	New York
18	Fabrica Pizza	Tampa
19	Pizza Secret	New York
20	Flour House	San Luis Obispo
21	Mission Pizza Napoletana	Winston-Salem
22	Inferno Pizzeria Napoletana	Darnestown
23	Spacca Napoli Pizzeria	Chicago
24	Il Forno	San Antonio
25	Coals Artisan Pizza	Louisville
26	Nardò	Huntington Beach
27	GRANA	Portland
28	Pizza Rock	Las Vegas
29	Bricco Coal Fired Pizza	Haddon Township
30	Nostrana	Portland
31	Valentina's	Madison
32	Craft 64	Scottsdale
33	Spark Pizza	Redmond
34	Salsa	New York
35	Antico Pizza Napoletana	Atlanta
36	Tribute Pizza	San Diego
37	Zeneli	New Haven
38	Pizza Delicious	New Orleans
39	Pasquale Jones	New York
40	Pomo	Scottsdale
41	Posto	Somerville
42	Truly Pizza	Dana Point
43	Pizza Baby	Charlotte
44	Pizzeria Florian	East Aurora
45	DØUBLE ZERØ PIE & PUB	Las Vegas
46	Penelope Pizza	Tucson
47	Coda di Volpe	Chicago
48	Si Cara	Cambridge
49	Marco's Coal Fired	Denver
50	San Matteo	New York
50	Angeli's Pizzeria	Baltimore
"""),
)

USA_2025 = (
    "https://www.50toppizza.it/50-top-pizza-usa-2025-una-pizza-napoletana-in-new-york-is-confirmed-as-the-best-pizzeria-in-the-usa/",
    tsv("""
1	Una Pizza Napoletana	New York
2	Pizzeria Sei	Los Angeles
3	Tony's Pizza Napoletana	San Francisco
4	Jay's	Kenmore
5	Ribalta	New York
6	Robert's	Chicago
7	Don Antonio	New York
8	Ken's Artisan Pizza	Portland
9	Truly Pizza	Dana Point
10	La Leggenda	Miami
10	'O Munaciello	Miami
11	Pizzeria Beddia	Philadelphia
12	Razza	Jersey City
13	Pasquale's	South Kingstown
14	Kesté	New York
15	Ops	New York
16	Pizza Secret	New York
17	Partenope Ristorante	Dallas
18	MPN – Mission Pizza Napoletana	Winston-Salem
19	Flour House	San Luis Obispo
20	Fabrica Pizza	Tampa
21	Inferno Pizzeria Napoletana	Darnestown
22	Il Forno	San Antonio
23	Coals	Louisville
24	Nardò	Huntington Beach
25	GRANA	Portland
26	Craft 64	Scottsdale
27	Valentina's	Madison
28	Bricco	Haddon Township
29	Nostrana	Portland
30	Antico Pizza	Atlanta
31	Pizza Delicious	New Orleans
32	A Modo Mio	Arlington
32	Salsa	New York
33	Pizza Rock	Las Vegas
34	Tribute Pizza	San Diego
35	Zeneli	New Haven
36	Posto	Somerville
37	Audace	New York
38	Leña	Cleveland
39	Pizzeria Florian	East Aurora
40	Pasquale Jones	New York
41	Pizza Baby	Charlotte
42	Penelope Pizza	Tucson
43	DØUBLE ZERØ PIE & PUB	Las Vegas
44	Coda di Volpe	Chicago
45	Angeli's Pizzeria	Baltimore
46	Lincoln Winebar	Mount Vernon
47	Hapa Pizza	Beaverton
48	Stretch Pizza	New York
49	Si Cara	Cambridge
50	Rose Pizzeria	Berkeley
"""),
)


WORLD_2022 = (
    "https://www.50toppizza.it/50-top-pizza-world-2022-i-masanielli-di-francesco-martucci-e-una-pizza-napoletana-di-anthony-mangieri-trionfano-ex-aequo-come-migliori-pizzerie-del-mondo/",
    tsv("""
1	I Masanielli – Francesco Martucci	Caserta
1	Una Pizza Napoletana	New York
3	Peppe Pizzeria	Paris
4	50 Kalò	Naples
5	10 Diego Vitagliano Pizzeria	Naples
6	I Tigli	San Bonifacio
7	Francesco & Salvatore Salvo	Naples
8	Seu Pizza Illuminati	Rome
9	La Notizia 94	Naples
10	Tony's Pizza Napoletana	San Francisco
11	Ribalta NYC	New York
12	Fratelli Figurato	Madrid
13	48h Pizza e Gnocchi Bar	Melbourne
14	Bottega	Beijing
15	50 Kalò London	London
16	The Pizza Bar on 38th	Tokyo
17	180g Pizzeria Romana	Rome
18	Dry Milano	Milan
19	Cambia-Menti di Ciccio Vitiello	Caserta
20	Bæst	Copenhagen
21	Sartoria Panatieri	Barcelona
22	I Masanielli – Sasà Martucci	Caserta
23	Pizzeria Peppe – Napoli sta' ca'	Tokyo
24	Le Grotticelle	Caggiano
25	Qvinto	Rome
26	Pepe in Grani	Caiazzo
27	Razza Pizza Artigianale	Jersey City
28	'O Munaciello	Miami
29	Carlo Sammarco Pizzeria 2.0	Frattamaggiore
30	Spacca Napoli Pizzeria	Chicago
31	Song' E Napule	New York
32	Via Toledo Enopizzeria	Vienna
33	'O Scugnizzo	Arezzo
34	Pizza Zulù	Fürth
35	La Piola Pizza	Brussels
36	La Leggenda Pizzeria	Miami
37	Pizzana	Los Angeles
38	Crosta	Milan
39	Kesté Fulton	New York
40	Pupillo Pura Pizza	Frosinone
41	Apogeo	Pietrasanta
42	La Cascina dei Sapori	Rezzato
43	Peppina	Bangkok
44	Patrick Ricci – Terra, Grani, Esplorazioni	San Mauro Torinese
45	Pizza Massilia	Bangkok
46	Pizzeria Panetteria Bosco	Tempio Pausania
47	400 Gradi	Lecce
48	Denis	Milan
49	Pizzeria Da Lioniello	Succivo
50	Ti Amo	Buenos Aires
51	Kytaly	Geneva
52	La Balmesina	Barcelona
53	Pizza Strada	Tokyo
54	nNea	Amsterdam
55	Enosteria Lipen	Triuggio
56	Officine del Cibo	Sarzana
57	Ken's Artisan Pizza	Portland
58	Pizzeria Bianco	Phoenix
59	L'Orso	Messina
60	Sbanco	Rome
61	La Pizza è Bella Gourmet	Brussels
62	Fiata by Salvatore Fiata	Hong Kong
63	Napoli on The Road	London
64	Frumento	Acireale
65	Dante's Pizzeria Napoletana	Auckland
66	La Braciera	Palermo
67	Malafemmena	Berlin
68	Pizzeria Luca	Copenhagen
69	Forno d'Oro	Lisbon
70	400° Laboratorio	Paris
71	Jay's Artisan Pizzeria	Kenmore
72	Fandango	Potenza
73	Pizzeria Mazzie	Bangkok
74	Il Vecchio e il Mare	Florence
75	Pizzeria Le Parùle	Ercolano
76	Ops	New York
77	A Pizza da Mooca	São Paulo
78	L'Antica Pizzeria	London
79	The Dough Bros	Galway
80	San Gennaro	Zurich
81	Giovanni Santarpia	Florence
82	Spacca Napoli	Seoul
83	Leggera Pizza Napoletana	São Paulo
84	Giangi Pizza e Ricerca	Arielli
85	'O Ver	London
86	Forza	Helsinki
87	BOB Alchimia a Spicchi	Montepaone
88	Guillaume Grasso	Paris
89	Doppio Zero	San Francisco
90	BACI Trattoria & Bar	Hong Kong
91	I Borboni Pizzeria	Pontecagnano Faiano
92	CIAK – In The Kitchen	Hong Kong
93	Sant'Isidoro – Pizza & Bolle	Rome
94	Al Taglio	Sydney
95	Surt	Copenhagen
96	'O Fiore Mio	Faenza
97	Pizzeria e Braceria L'Insieme	Tokyo
98	Futura Neapolitan Pizza	Berlin
99	QT Pizza Bar	São Paulo
100	What the Crust	Cairo
"""),
)

WORLD_2023 = (
    "https://www.50toppizza.it/50-top-pizza-world-2023-i-masanielli-di-francesco-martucci-e-10-diego-vitagliano-pizzeria-sono-le-migliori-pizzerie-del-mondo/",
    tsv("""
1	10 Diego Vitagliano Pizzeria	Naples
1	I Masanielli – Francesco Martucci	Caserta
2	Una Pizza Napoletana	New York
3	Sartoria Panatieri	Barcelona
4	The Pizza Bar on 38th	Tokyo
5	I Tigli	San Bonifacio
6	Seu Pizza Illuminati	Rome
7	50 Kalò	Naples
8	Bottega	Beijing
9	180g Pizzeria Romana	Rome
10	I Masanielli – Sasà Martucci	Caserta
11	Razza Pizza Artigianale	Jersey City
12	Francesco & Salvatore Salvo	Naples
13	Bæst	Copenhagen
14	50 Kalò	London
15	Dry Milano	Milan
16	Cambia-Menti di Ciccio Vitiello	Caserta
17	Via Toledo Enopizzeria	Vienna
18	Ken's Artisan Pizza	Portland
19	Tony's Pizza Napoletana	San Francisco
20	La Notizia 94	Naples
21	Pizzeria Bianco	Phoenix
22	Ribalta	New York
23	Pizzeria Peppe – Napoli sta' ca'	Tokyo
24	Confine	Milan
25	'O Munaciello	Miami
26	Le Grotticelle	Caggiano
27	Carlo Sammarco Pizzeria 2.0	Aversa
28	Jay's Artisan Pizzeria	Kenmore
29	Pepe in Grani	Caiazzo
30	La Cascina dei Sapori	Rezzato
31	Apogeo	Pietrasanta
32	Pizza Zulù	Fürth
33	Song' E Napule	New York
34	Denis	Milan
35	BOB Alchimia a Spicchi	Montepaone Lido
36	Allegrìo	Rome
37	Pizzeria Da Lioniello	Succivo
38	Ti Amo	Buenos Aires
39	400 Gradi	Lecce
40	Pupillo Pura Pizza	Frosinone
41	48h Pizza e Gnocchi Bar	Melbourne
42	Fratelli Figurato	Madrid
43	Fiata by Salvatore Fiata	Hong Kong
44	Via Toledo Enopizzeria	Dubai
45	Forza	Helsinki
46	Napoli on the Road	London
47	Dante's Pizzeria Napoletana	Auckland
48	nNea	Amsterdam
49	Pizza Massilia	Bangkok
50	La Balmesina	Barcelona
51	QT Pizza Bar	São Paulo
52	Pizzeria Mazzie	Bangkok
53	IMperfetto	Puteaux
54	Crosta Pizzeria	Makati
55	'O Scugnizzo	Arezzo
56	Renato Bosco Pizzeria	San Martino Buon Albergo
57	Frumento	Acireale
58	Sbanco	Rome
59	Fandango	Potenza
60	Pizzeria Le Parùle	Ercolano
61	Giovanni Santarpia	Florence
62	La Pizza è Bella Gourmet	Brussels
63	Al Taglio	Sydney
64	Baldoria	Madrid
65	Giangi Pizza e Ricerca	Arielli
66	Pizzeria Panetteria Bosco	Tempio Pausania
67	Modus	Milan
68	Clementina	Fiumicino
69	La Bolla	Caserta
70	Palazzo Petrucci Pizzeria	Naples
71	'O Fiore Mio	Faenza
72	Kesté	New York
73	La Leggenda Pizzeria	Miami
74	Sant'Isidoro – Pizza & Bolle	Rome
75	I Borboni Pizzeria	Pontecagnano Faiano
76	Pasquale's Pizzeria Napoletana	South Kingstown
77	Kytaly	Geneva
78	Maiori	Cagliari
79	La Piola Pizza	Brussels
80	Forno d'Oro	Lisbon
81	Demaio	Bilbao
82	Pizza Strada	Tokyo
83	Pizzeria Chicco	Colle di Val d'Elsa
84	What the Crust	Cairo
85	A Pizza da Mooca	São Paulo
86	L'Antica Pizzeria	London
87	Malafemmena	Berlin
88	Pizza Studio Tamaki Roppongi	Tokyo
89	Surt	Copenhagen
90	Il Caffè	Dubai
91	Guillaume Grasso	Paris
92	Ops	New York
93	Spacca Napoli Pizzeria	Chicago
94	'O Ver	London
95	Pizzeria Luca	Copenhagen
96	a mano	Makati
97	Fabrica Pizza	Tampa
98	San Gennaro	Zurich
99	Matto Napoletano	Skopje
100	Leggera Pizza Napoletana	São Paulo
"""),
)

WORLD_2024 = (
    "https://www.50toppizza.it/50-top-pizza-world-2024-una-pizza-napoletana-di-anthony-mangieri-a-new-york-e-la-migliore-pizzeria-del-mondo-nel-2024/",
    tsv("""
1	Una Pizza Napoletana	New York
2	Diego Vitagliano Pizzeria	Naples
2	I Masanielli – Francesco Martucci	Caserta
3	The Pizza Bar on 38th	Tokyo
4	Confine	Milan
5	Napoli on the Road	London
6	Tony's Pizza Napoletana	San Francisco
7	I Tigli	San Bonifacio
8	Sartoria Panatieri	Barcelona
9	50 Kalò	Naples
10	Seu Pizza Illuminati	Rome
11	Leggera Pizza Napoletana	São Paulo
12	Crosta Pizzeria	Makati
13	Pizzeria Beddia	Philadelphia
14	Via Toledo Enopizzeria	Vienna
15	RistoPizza	Tokyo
16	I Masanielli – Sasà Martucci	Caserta
17	Dry Milano	Milan
18	La Notizia	Naples
19	Ribalta	New York
20	Salvo	Naples
21	Pizzeria Da Lioniello	Succivo
22	Fiata by Salvatore Fiata	Hong Kong
23	50 Kalò	London
24	Cambia-Menti di Ciccio Vitiello	Caserta
25	Pepe in Grani	Caiazzo
26	Baldoria	Madrid
27	Ken's Artisan Pizza	Portland
28	Jay's	Kenmore
29	180 Grammi Pizzeria Romana	Rome
30	Don Antonio	New York
31	Le Grotticelle	Caggiano
32	La Cascina dei Sapori	Rezzato
33	Pizzeria Sei	Los Angeles
34	Pizza Zulu	Fürth
35	Clementina	Fiumicino
36	Sestogusto	Turin
37	La Bolla	Caserta
38	QT Pizza Bar	São Paulo
39	BOB Alchimia a Spicchi	Montepaone Lido
40	Ti Amo	Adrogué
41	Apogeo	Pietrasanta
42	I Vesuviani	Pomigliano d'Arco
43	IMperfetto	Puteaux
44	48h Pizza e Gnocchi Bar	Melbourne
44	Al Taglio	Sydney
45	La Leggenda	Miami
46	Dante's Pizzeria Napoletana	Auckland
47	nNea	Amsterdam
48	Raf Bonetta	Pozzuoli
49	Massilia	Bangkok
50	Robert's	Chicago
51	La Balmesina	Barcelona
52	Denis	Milan
53	A Pizza da Mooca	São Paulo
54	Pizzeria Braceria CESARI!!	Nagoya
55	'O Munaciello	Miami
56	Palazzo Petrucci Pizzeria	Naples
57	Bottega	Beijing
58	Allería	Providencia
59	Pizzeria Mazzie	Bangkok
60	Fratelli Figurato	Madrid
61	Sbanco	Rome
62	Carlo Sammarco Pizzeria	Aversa
63	Le Parùle	Ercolano
64	400 Gradi	Lecce
65	Modus	Milan
66	Spacca Napoli	Seoul
67	Ardente	Mexico City
68	La Pizza è Bella	Antwerp
69	La Fenice	Pistoia
70	a mano	Makati
71	Re | Mi	Sassari
72	'O Scugnizzo	Arezzo
73	Forno d'Oro	Lisbon
74	Partenope Ristorante	Dallas
75	Pupillo Pura Pizza	Frosinone
76	Surt	Copenhagen
77	'O Fiore Mio	Faenza
78	Franko's Pizza & Bar	Zagreb
79	Little Pyg	Dublin
80	L'industrie Pizzeria	New York
81	Matto Napoletano	Skopje
82	Giangi	Arielli
83	Giovanni Santarpia	Florence
84	Meunier	Corciano
85	Saccharum	Altavilla Milicia
86	Da Susy	Gurugram
87	Unica Pizzeria	São Paulo
88	Imilla Alzada	La Paz
89	Ferro e Farinha	Rio de Janeiro
90	Atte. Pizzeria Napoletana	Buenos Aires
91	San Martino – Pizza & Bolle	Rome
92	I Borboni	Pontecagnano Faiano
93	Demaio	Bilbao
94	Stile Napoletano	Chester
95	La Piola Pizza	Brussels
96	Pizza Culture	Calgary
97	Zielona Górka	Pabianice
98	Slice & Pie	Washington
99	Taglio	Mineola
100	Pizzeria Prima Strada	Victoria
"""),
)


def pizza_lists() -> list[tuple[str, int, str, list[tuple[int, str, str]]]]:
    """region, year, source, entries. USA lists are stored as North America."""
    out: list[tuple[str, int, str, list[tuple[int, str, str]]]] = []
    for year, pack in (
        (2020, EUROPE_2020),
        (2021, EUROPE_2021),
        (2022, EUROPE_2022),
        (2023, EUROPE_2023),
        (2024, EUROPE_2024),
        (2025, EUROPE_2025),
    ):
        src, entries = pack
        out.append(("Europe", year, src, entries))
    for year, pack in (
        (2021, USA_2021),
        (2022, USA_2022),
        (2023, USA_2023),
        (2024, USA_2024),
        (2025, USA_2025),
    ):
        src, entries = pack
        out.append(("North America", year, src, entries))
    for year, pack in (
        (2022, WORLD_2022),
        (2023, WORLD_2023),
        (2024, WORLD_2024),
    ):
        src, entries = pack
        out.append(("World", year, src, entries))
    return out
