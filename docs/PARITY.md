# Raport zgodności z Citadel V3 (oryginał Streamlit)

Porównanie wykonane 2026-10-17 na identycznych danych demo (`server/seed.ts`), oryginał na PostgreSQL 16 z kolacją ICU `pl-PL`,
nowa aplikacja na PGlite. Zrzuty: `tests/e2e/screenshots/reference` (oryginał) i `tests/e2e/screenshots/new`
(`scripts/capture-reference.ts`), wynik pikselowy: `scripts/compare-pixels.ts` (piksel zgodny = każdy kanał RGB różni się ≤ 40),
przegląd wizualny: arkusze porównawcze `scripts/contact-sheets.ts` (oryginał | nowa, obok siebie).

## Ekrany

| Ekran | Zgodność pikseli | Przegląd wizualny | Uwagi |
| :--- | ---: | :--- | :--- |
| 00 Logowanie | 99.0% | zgodny | — |
| 01 Koło · Tabela Zbiorcza | 93.4% | zgodny | wartości kart i wszystkie komórki tabeli identyczne |
| 02 Koło · Profile & Wykresy | 93.6% | zgodny | wykres salda: te same osie i linia |
| 03 Koło · Celestia (ranking) | 92.9% | zgodny | indeks, klasy, ranking identyczne |
| 03b Koło · Celestia (rejestr terminów) | 91.9% | zgodny | podgląd okna zbiórki identyczny |
| 04 Koło · Wpłaty Członków | 94.0% | zgodny | pole daty: natywny format przeglądarki |
| 05 Koło · Ręczne Naliczenia | 94.2% | zgodny | jw. |
| 06 Koło · Kasa Koła & Wydatki | 92.9% | zgodny | — |
| 07 Koło · Korekta Salda Osoby | 94.2% | zgodny | jw. |
| 08 Koło · Zarządzaj Członkami | 93.8% | zgodny | jw. |
| 09 Koło · Kalkulator | 92.1% | zgodny | wynik symulacji i rozbicie naliczeń identyczne |
| 10 Koło · Wpłaty do zaakceptowania | 93.9% | zgodny | — |
| 11 Koło · Zarządzaj Strukturą | 93.2% | zgodny | łącznie z etykietą „(nan)” oryginału |
| 12 Koło · Logi Audytowe | 91.7% | zgodny | znaczniki czasu zależą od chwili zasilenia bazy |
| 13 Koło · Panel Centauri | 92.0% | zgodny | czasy logowań zależą od chwili przebiegu |
| 20 Statystyki Regionu | 94.7% | zgodny | — |
| 21 Statystyki Kraju | 93.1% | zgodny | — |
| 21b Kraj · Porównanie KDI | 89.9% | zgodny | ten sam wykres Plotly; różnica to wygładzanie czcionek osi |
| 30 Kraj · motyw Ciemny | 91.1% | zgodny | w oryginale widoczna podpowiedź przycisku (hover przy zrzucie) |
| 31 Koło · motyw Ciemny | 95.0% | zgodny | — |
| 32 Koło · motyw Jasny | 93.9% | zgodny | — |
| 33 Celestia · motyw Jasny | 93.7% | zgodny | — |
| 40 Skarbnik koła · Tabela | 93.8% | zgodny | — |
| 41 Skarbnik koła · Wpłaty | 94.0% | zgodny | — |

Średnia: **93.4%**. Pozostała różnica pikseli pochodzi z renderowania czcionek (antyaliasing) i natywnych pól daty
(`17.10.2026` zamiast `2026/10/17`); przegląd każdej pary nie wykazał różnic układu, danych ani kolorów.

## Treść (`scripts/compare-text.ts`)

| Sesja | Słowa oryginału | Brakujące w nowej aplikacji |
| :--- | ---: | :--- |
| Skarbnik koła | 658 | 0 |
| Administrator | 832 | 4: ukryte źródło TeX strzałki „→” (`\rightarrow`, niewidoczne) oraz 3 znaczniki czasu audytu |

## Działanie

* Silniki obliczeń: test różnicowy 400 losowych członków z oryginalnym kodem Python — wyniki identyczne (`tests/parity`).
* Testy API: 12, testy jednostkowe: 32, E2E Playwright: 21 (wszystkie zakładki, role, motywy, operacje zapisu, wygaszanie sesji).

## Zgodność funkcjonalna — test różnicowy na danych rzeczywistych (`npm run ops:diff`)

Ten sam scenariusz wykonany przez interfejs **obu** aplikacji, każda na własnej identycznej kopii zrzutu produkcyjnego.
Po scenariuszu porównywana jest cała zawartość obu baz (13 tabel łącznie z dziennikiem audytu, z identyfikatorami
rekordów; znaczniki czasu tylko „ustawiony / pusty”, losowe klucze idempotencji i skróty haseł zamaskowane) oraz komunikaty,
wyniki kalkulatora i dane wykresów pokazane przez oba programy.

| Obszar | Co jest wykonywane | Wynik |
| :--- | :--- | :--- |
| Wpłaty | księgowanie, blokada duplikatu 60 s i jej obejście, zgłoszenie testowe do kolejki, edycja (osoba/kwota/data/notatka), usunięcie | identyczne |
| Ręczne naliczenia | dodanie dwóch, usunięcie jednego | identyczne |
| Korekty salda | korekta z datą wsteczną (delta liczona od salda na tę datę) i bieżąca, kwota ujemna z groszami | identyczne |
| Kasa | wydatek, korekta kasy na datę wyciągu sprzed 4 miesięcy | identyczne |
| Członkowie | walidacja wieku i pustego nazwiska, dodanie, edycja parametrów krytycznych bez i z potwierdzeniem, usunięcie członka z wpłatami | identyczne |
| Celestia | brak nazwy, termin głosowania (waga 1.5, okno 10 dni, poślizg 3), zbiórka kwartalna, usunięcie | identyczne |
| Kolejka wpłat | deklaracja skarbnika koła, akceptacja, odrzucenie z własnym powodem | identyczne |
| Struktura | duplikat regionu, region, zmiana nazwy, koła, edycja, kosz koła, kosz regionu z kołem, blokada przywrócenia koła, przywracanie, ponowny kosz, trwałe usunięcie | identyczne |
| Konta | duplikat loginu, konto koła i regionu, blokada, zmiana roli, za krótkie hasło, reset hasła, usunięcie, wymuszona zmiana hasła (różne / za krótkie / poprawne) | identyczne |
| Logowanie | złe hasło, nieznany login, konto zablokowane (złe i dobre hasło) | identyczne komunikaty |
| Kalkulator | 5 zestawów danych (tryb wieku i ręczny, funkcje, data startu, bieżący miesiąc, saldo ujemne) | karty, rozbicie naliczeń i werdykt identyczne |
| Wykresy | oś salda i dynamika KDI dla 3 członków × 3 interwały, rozkład Celestii, porównania KDI regionu i kraju | dane wszystkich serii identyczne |
| Kopia zapasowa | pobranie przez UI, odtworzenie do pustej bazy | obie odtwarzają się do kopii bazy; nowa wersja co do mikrosekundy |

**Ostatni pełny przebieg (2026-10-17, po restarcie systemu): 13 z 13 kroków w obu aplikacjach, 13 tabel identycznych
(46 nowych wpisów audytu), wszystkie komunikaty, wyniki kalkulatora i dane wykresów identyczne, obie kopie zapasowe
odtwarzają się poprawnie; kopia nowej wersji jest dokładną kopią bazy co do bajtu.**

Wszystkie komunikaty walidacji mają identyczną treść. Sukcesy oryginał gubi przy `st.rerun()`; nowa wersja pokazuje je
jako powiadomienia — to i inne świadome usprawnienia są w `docs/IMPROVEMENTS.md`.

Znalezione i poprawione dzięki testowi: kopia zapasowa nowej wersji obcinała znaczniki czasu do milisekund (teraz bezstratna);
błędy w koszu pokazywały się nad listą zamiast pod klikniętym przyciskiem.

## Dane rzeczywiste (zrzut produkcyjny z 2026-10-17)

Oba programy uruchomione na tej samej lokalnej kopii zrzutu (15 kół, 73 członków, 438 wpisów audytu), z dwoma kontami testowymi
dodanymi tylko w kopii. Zrzuty ekranów z danymi rzeczywistymi powstają poza repozytorium i nie są w nim zapisywane.

| Sesja | Słowa oryginału | Brakujące w nowej aplikacji |
| :--- | ---: | :--- |
| Skarbnik koła | 689 | 0 |
| Administrator | 952 | 2 — czasy ostatniego logowania kont testowych (logowania w różnych chwilach) |

Zgodność pikseli na danych rzeczywistych (przebieg po zmianie znaku i wyszukiwania, 2026-10-17): średnio **93.9%**
(91.5–96.0% na ekran), 24 pary ekranów przejrzane na arkuszach porównawczych — wszystkie zgodne. Różnice to wyłącznie zamierzone
(znak „Citadel for NG” i ikona C w nagłówku, dwuwierszowy znak na logowaniu), natywny format pól daty oraz chwilowe
podpowiedzi przycisków w oryginale.

| Ekran | Piksele | Ekran | Piksele |
| :--- | ---: | :--- | ---: |
| 00 Logowanie | 96.0% | 12 Logi Audytowe | 92.6% |
| 01 Tabela Zbiorcza | 91.5% | 13 Panel Centauri | 92.1% |
| 02 Profile & Wykresy | 94.2% | 20 Statystyki Regionu | 94.0% |
| 03 Celestia (ranking) | 94.1% | 21 Statystyki Kraju | 95.4% |
| 03b Celestia (rejestr) | 92.4% | 21b Kraj · Porównanie KDI | 93.7% |
| 04 Wpłaty Członków | 95.2% | 30 Kraj · Ciemny | 94.3% |
| 05 Ręczne Naliczenia | 95.4% | 31 Koło · Ciemny | 92.7% |
| 06 Kasa Koła | 93.8% | 32 Koło · Jasny | 92.0% |
| 07 Korekta Salda | 95.0% | 33 Celestia · Jasny | 95.0% |
| 08 Zarządzaj Członkami | 94.9% | 40 Skarbnik · Tabela | 92.1% |
| 09 Kalkulator | 92.8% | 41 Skarbnik · Wpłaty | 93.8% |
| 10 Wpłaty do zaakceptowania | 95.7% | | |
| 11 Zarządzaj Strukturą | 94.1% | | |

Etykieta „nan” oryginału (koło bez regionu w koszu i w listach struktury) odtworzona 1:1.

## Wyszukiwanie w listach rozwijanych (`scripts/compare-search.ts`)

Algorytm przeniesiony 1:1 z frontendu Streamlit (fzy: dopasowanie podciągu bez rozróżniania wielkości liter,
ranking wg tych samych wag). Porównanie na danych rzeczywistych (`SEARCH_LABEL`, `SEARCH_NAME`, `SEARCH_VIEW`, `SEARCH_TAB`):

| Lista | Zapytania | Wyniki identyczne i w tej samej kolejności |
| :--- | :--- | :--- |
| Członek (Profile & Wykresy) | `Mati`, `kow`, `lodz`, `łódź`, `ann`, `ewa`, `zz` | 7 z 7 |
| Koło (Wybierz Koło z regionu) | `ko`, `kra`, `ol`, `łó`, `zz` | 5 z 5 |
| Aktywny Region (nagłówek) | `po`, `ma`, `zz`, `ł` | 4 z 4 |

Porównywane są wszystkie wiersze renderowane przez oryginał (jego lista jest wirtualizowana). Inne listy rozwijane korzystają
z tego samego komponentu `Select.svelte` i tej samej funkcji `fuzzyFilter`.
Jedyna różnica: przy braku wyników oryginał pokazuje angielskie „No results”, nowa wersja „Brak wyników”.

## Zamierzone różnice (na życzenie właściciela)

* Logo „C” w nagłówku aplikacji i jako favicona; nazwa „Citadel for NG” rysowana krojem znaku słownego z żółtą kropką
  nad „i” (na stronie logowania w dwóch liniach). Tekst nazwy pozostaje w stronie (dla czytników ekranu i porównań).
