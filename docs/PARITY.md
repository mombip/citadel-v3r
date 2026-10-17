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
* Testy API: 12, testy jednostkowe: 26, E2E Playwright: 21 (wszystkie zakładki, role, motywy, operacje zapisu, wygaszanie sesji).

## Dane rzeczywiste (zrzut produkcyjny z 2026-10-17)

Oba programy uruchomione na tej samej lokalnej kopii zrzutu (15 kół, 73 członków, 438 wpisów audytu), z dwoma kontami testowymi
dodanymi tylko w kopii. Zrzuty ekranów z danymi rzeczywistymi nie są w repozytorium (`tests/e2e/results/real`, gitignored).

| Sesja | Słowa oryginału | Brakujące w nowej aplikacji |
| :--- | ---: | :--- |
| Skarbnik koła | 689 | 0 |
| Administrator | 952 | 2 — czasy ostatniego logowania kont testowych (logowania w różnych chwilach) |

Zgodność pikseli na danych rzeczywistych: średnio **94.1%** (91.6–99.0% na ekran).
Etykieta „nan” oryginału (koło bez regionu w koszu i w listach struktury) odtworzona 1:1.
