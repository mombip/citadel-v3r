"""Generates parity fixtures by running the ORIGINAL Python engines on random inputs.

Usage:  python gen_python_cases.py <path-to-Citadel-V3/citadel> <out.json>
Requires the original project's virtualenv (pandas, dateutil, streamlit).
"""
import json
import random
import sys
from datetime import date, timedelta

sys.path.insert(0, sys.argv[1])
import pandas as pd  # noqa: E402

from calculations import (  # noqa: E402
    oblicz_dynamiczny_prog_kdi, oblicz_naliczenia_gr, oblicz_symulacje_kalkulatora, pobierz_parametr,
)
from celestia import oblicz_rating_celestia_dla_czlonka  # noqa: E402

random.seed(int(sys.argv[3]) if len(sys.argv) > 3 else 42)


def rd(a, b):
    if b < a:
        a, b = b, a
    return a + timedelta(days=random.randint(0, (b - a).days))


cases = []
for i in range(400):
    dzis = rd(date(2025, 6, 1), date(2027, 6, 1))
    ur = rd(date(1960, 1, 1), date(2012, 1, 1))
    wst = rd(date(2015, 1, 1), dzis + timedelta(days=40))
    param = random.choice([None, "AUTO", "B", "M", "S"])
    s_start = random.choice([0, 0, random.randint(-40000, 8000)])
    wplaty = [(rd(wst - timedelta(days=30), dzis), random.choice([600, 900, 1500, 2700, 100, 5000]))
              for _ in range(random.randint(0, 10))]
    reczne = [(rd(wst, dzis), random.choice([500, 2000])) for _ in range(random.randint(0, 2))]
    korekty = [(rd(wst, dzis), random.randint(-3000, 3000)) for _ in range(random.randint(0, 2))]
    terminy = []
    for _ in range(random.randint(0, 5)):
        d = rd(wst - timedelta(days=200), dzis + timedelta(days=60))
        dni_przed = random.randint(1, 40)
        terminy.append({
            "id": len(terminy) + 1,
            "data_glosowania": d,
            "data_zbiorki_od": (d - timedelta(days=dni_przed)) if random.random() < 0.5 else None,
            "dni_zbiorki_przed": dni_przed,
            "dni_wymagalnosci_po": random.randint(0, 5),
            "waga": random.choice([1.0, 1.5]),
            "nazwa": f"Termin {len(terminy) + 1}",
            "typ_terminu": random.choice(["GLOSOWANIE", "GLOSOWANIE", "KWARTALNY", None]),
        })

    nal_auto, msc = oblicz_naliczenia_gr(wst, ur, param, dzis)
    _, stawka = pobierz_parametr(ur, param, dzis)
    wpl = sum(k for _, k in wplaty)
    rec = sum(k for _, k in reczne)
    kor = sum(k for _, k in korekty)
    saldo = s_start + wpl + kor - (nal_auto + rec)
    s_i = max(0, s_start) + wpl
    z_i = max(0, s_i - saldo)
    kdi = round(z_i / s_i, 2) if s_i > 0 else None

    dane = {
        "data_wst": wst, "data_ur": ur, "reczny_parametr": param,
        "saldo_start_gr": s_start, "saldo_akt_gr": saldo, "naliczone_gr": nal_auto + rec, "kdi_val": kdi,
    }
    res = oblicz_rating_celestia_dla_czlonka(
        i, dane, pd.DataFrame(terminy) if terminy else pd.DataFrame(),
        pd.DataFrame([{"data_wplaty": d, "kwota_gr": k} for d, k in wplaty]),
        pd.DataFrame([{"data_naliczenia": d, "kwota_gr": k} for d, k in reczne]),
        pd.DataFrame([{"data_korekty": d, "delta_gr": k} for d, k in korekty]),
        dzis,
    )
    sym = oblicz_symulacje_kalkulatora(wst, ur, param or "AUTO", dzis, rd(date(2015, 1, 1), dzis),
                                       random.random() < 0.5, 1000, random.randint(0, 5))
    prog = oblicz_dynamiczny_prog_kdi([{"z_i_gr": z_i, "stawka_biezaca_gr": stawka}])

    cases.append({
        "input": {
            "dzis": str(dzis), "ur": str(ur), "wst": str(wst), "param": param, "s_start": s_start,
            "wplaty": [[str(d), k] for d, k in wplaty],
            "reczne": [[str(d), k] for d, k in reczne],
            "korekty": [[str(d), k] for d, k in korekty],
            "terminy": [{**t, "data_glosowania": str(t["data_glosowania"]),
                         "data_zbiorki_od": str(t["data_zbiorki_od"]) if t["data_zbiorki_od"] else None}
                        for t in terminy],
            "sym_args": None,
        },
        "finance": {"nal_auto": nal_auto, "msc": msc, "stawka": stawka, "saldo": saldo, "kdi": kdi,
                    "prog": [prog[0], prog[1]]},
        "celestia": res,
    })

with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(cases, f, ensure_ascii=False, default=str)
print(f"wrote {len(cases)} cases")
