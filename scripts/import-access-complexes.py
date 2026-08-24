"""Import Access InmConjunto -> Complex (Edificios) and link Property -> Unit."""
from __future__ import annotations

import json
import os
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import psycopg2
import pyodbc

ORG_ID = "cmsjb34ou0000mg4els0p1f4j"
BASE = Path(__file__).resolve().parent.parent / ".tmp-access-review"
URL = (BASE / "railway-db.url").read_text(encoding="utf-8").strip()
MDB = os.environ.get("ACCESS_MDB", str(BASE / "BaseInmobiliare-copy.mdb"))
PWD = os.environ.get("ACCESS_PWD", "inmobiliare")
REPORT_PATH = BASE / "import-complexes-report.json"
SKIP_CONJUNTO_IDS = {1}  # NO ESPECIFICADO


def to_dec(v, default="0"):
    if v is None or v == "":
        return Decimal(default)
    try:
        return Decimal(str(v).replace(",", "."))
    except (InvalidOperation, ValueError):
        return Decimal(default)


def to_int(v, default=None):
    if v is None or v == "":
        return default
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return default


def clean_str(v, n=None):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    return s[:n] if n else s


def slugify(text: str) -> str:
    s = (text or "").lower()
    s = (
        s.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ñ", "n")
    )
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60] or "edificio"


def pg():
    url = URL if "sslmode=" in URL else URL + ("&" if "?" in URL else "?") + "sslmode=require"
    c = psycopg2.connect(url)
    c.autocommit = False
    return c


def access():
    return pyodbc.connect(
        rf"DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={MDB};PWD={PWD};",
        autocommit=True,
    )


def fetch_all(ac, sql, params=()):
    cur = ac.cursor()
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return rows


def unit_code_from_address(domicilio: str | None, iid: int) -> str:
    s = clean_str(domicilio) or ""
    # "3 D - SANTA FE 1268" / "PH 2 - OF. D - ..."
    if " - " in s:
        left = s.split(" - ", 1)[0].strip()
        if left and len(left) <= 40:
            return left
    if s and len(s) <= 40:
        return s
    return f"U-{iid}"


def ownership_coeff(porcentaje_ph) -> Decimal:
    pct = to_dec(porcentaje_ph, "0")
    if pct <= 0:
        return Decimal("0.000001")
    # Access stores percent (sums ~100); ERP expects 0..1
    if pct > 1:
        coeff = pct / Decimal(100)
    else:
        coeff = pct
    if coeff > 1:
        coeff = Decimal("1")
    if coeff <= 0:
        coeff = Decimal("0.000001")
    return coeff.quantize(Decimal("0.000001"))


def rebuild_property_map(conn):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT id, slug, "unitId", "areaM2", rooms, bathrooms, address
        FROM "Property"
        WHERE "organizationId"=%s AND slug LIKE 'access-inm-%%'
        """,
        (ORG_ID,),
    )
    props = {}
    for pid, slug, unit_id, area, rooms, baths, address in cur.fetchall():
        m = re.match(r"access-inm-(\d+)$", slug or "")
        if m:
            props[m.group(1)] = {
                "id": pid,
                "unitId": unit_id,
                "areaM2": area,
                "rooms": rooms,
                "bathrooms": baths,
                "address": address,
            }
    return props


def existing_complexes(conn):
    cur = conn.cursor()
    cur.execute(
        'SELECT id, slug FROM "Complex" WHERE "organizationId"=%s AND slug LIKE %s',
        (ORG_ID, "access-conj-%"),
    )
    out = {}
    for cid, slug in cur.fetchall():
        m = re.match(r"access-conj-(\d+)$", slug or "")
        if m:
            out[m.group(1)] = cid
    return out


def collect_conjuntos(ac):
    """Return dict accessId -> {name, address, city, description, fromTable}."""
    by_id = {}
    for row in fetch_all(ac, "SELECT * FROM InmConjunto"):
        cid = to_int(row.get("idConjunto"))
        if cid is None:
            continue
        name = clean_str(row.get("conjunto"), 120) or f"Conjunto {cid}"
        address = clean_str(row.get("domicilio"), 200) or name
        by_id[cid] = {
            "name": name,
            "address": address,
            "city": "Córdoba",
            "province": "Córdoba",
            "description": clean_str(row.get("observaciones")),
            "source": "InmConjunto",
            "estado": clean_str(row.get("estado")),
        }

    # Orphans referenced by Inmueble but missing from InmConjunto
    names = defaultdict(Counter)
    addresses = defaultdict(Counter)
    cities = defaultdict(Counter)
    for row in fetch_all(
        ac,
        "SELECT idConjunto, conjunto, domicilio, localidad FROM Inmueble",
    ):
        cid = to_int(row.get("idConjunto"))
        if cid is None or cid in SKIP_CONJUNTO_IDS:
            continue
        nm = clean_str(row.get("conjunto"))
        if nm:
            names[cid][nm] += 1
        ad = clean_str(row.get("domicilio"))
        if ad:
            # keep street-ish part after " - "
            street = ad.split(" - ", 1)[-1].strip() if " - " in ad else ad
            if street:
                addresses[cid][street] += 1
        loc = clean_str(row.get("localidad"))
        if loc:
            cities[cid][loc] += 1

    for cid, counter in names.items():
        if cid in by_id:
            continue
        best_name = counter.most_common(1)[0][0]
        best_addr = (
            addresses[cid].most_common(1)[0][0] if addresses[cid] else best_name
        )
        best_city = cities[cid].most_common(1)[0][0] if cities[cid] else "Córdoba"
        by_id[cid] = {
            "name": best_name,
            "address": best_addr,
            "city": best_city,
            "province": "Córdoba",
            "description": "Importado desde referencias de Inmueble (sin fila en InmConjunto).",
            "source": "Inmueble-orphan",
            "estado": None,
        }

    return by_id


def import_complexes(conn, conjuntos):
    print("== COMPLEXES (Edificios) ==", flush=True)
    existing = existing_complexes(conn)
    cur = conn.cursor()
    created = skipped = 0
    for cid, meta in sorted(conjuntos.items()):
        if cid in SKIP_CONJUNTO_IDS:
            skipped += 1
            continue
        key = str(cid)
        if key in existing:
            skipped += 1
            continue
        slug = f"access-conj-{cid}"
        complex_id = "imp" + uuid.uuid4().hex[:22]
        cur.execute(
            """
            INSERT INTO "Complex"
              (id, name, slug, address, city, province, country, description,
               "createdAt", "updatedAt", "organizationId")
            VALUES (%s,%s,%s,%s,%s,%s,'AR',%s,NOW(),NOW(),%s)
            """,
            (
                complex_id,
                meta["name"][:180],
                slug,
                meta["address"][:200],
                (meta["city"] or "Córdoba")[:80],
                meta.get("province") or "Córdoba",
                meta.get("description"),
                ORG_ID,
            ),
        )
        existing[key] = complex_id
        created += 1
        print(f"  + {cid} {meta['name']}", flush=True)
    conn.commit()
    print(f"Complexes created={created} skipped={skipped} map={len(existing)}", flush=True)
    return existing


def import_units_and_link(ac, conn, complex_map, props):
    print("== UNITS + link properties ==", flush=True)
    cur = conn.cursor()
    # existing unit codes per complex
    cur.execute(
        """
        SELECT u."complexId", u.code, u.id
        FROM "Unit" u
        JOIN "Complex" c ON c.id=u."complexId"
        WHERE c."organizationId"=%s
        """,
        (ORG_ID,),
    )
    unit_by_complex_code = {}
    for complex_id, code, uid in cur.fetchall():
        unit_by_complex_code[(complex_id, code)] = uid

    rows = fetch_all(ac, "SELECT * FROM Inmueble")
    created = linked = skipped = 0
    used_codes = defaultdict(set)

    for row in rows:
        iid = to_int(row.get("idInmueble"))
        cid = to_int(row.get("idConjunto"))
        if iid is None or cid is None or cid in SKIP_CONJUNTO_IDS:
            skipped += 1
            continue
        complex_id = complex_map.get(str(cid))
        prop = props.get(str(iid))
        if not complex_id or not prop:
            skipped += 1
            continue
        if prop["unitId"]:
            skipped += 1
            continue

        base_code = unit_code_from_address(row.get("domicilio") or prop["address"], iid)
        code = base_code
        n = 2
        while (complex_id, code) in unit_by_complex_code or code in used_codes[complex_id]:
            code = f"{base_code}-{n}"
            n += 1
            if n > 50:
                code = f"U-{iid}"
                break
        used_codes[complex_id].add(code)

        area = prop["areaM2"]
        if area is None:
            area_raw = to_dec(row.get("supTotal") or row.get("supCubierta"), "0")
            area = float(area_raw) if area_raw > 0 else None
        rooms = prop["rooms"]
        baths = prop["bathrooms"]
        coeff = ownership_coeff(row.get("porcentajePH"))
        unit_id = "imp" + uuid.uuid4().hex[:22]

        try:
            cur.execute(
                """
                INSERT INTO "Unit"
                  (id, "complexId", code, floor, "ownershipCoefficient", "areaM2",
                   rooms, bathrooms, "createdAt", "updatedAt")
                VALUES (%s,%s,%s,NULL,%s,%s,%s,%s,NOW(),NOW())
                """,
                (unit_id, complex_id, code[:80], coeff, area, rooms, baths),
            )
            cur.execute(
                """
                UPDATE "Property"
                SET "unitId"=%s, "updatedAt"=NOW()
                WHERE id=%s AND "organizationId"=%s AND "unitId" IS NULL
                """,
                (unit_id, prop["id"], ORG_ID),
            )
            if cur.rowcount != 1:
                conn.rollback()
                skipped += 1
                continue
            unit_by_complex_code[(complex_id, code)] = unit_id
            created += 1
            linked += 1
            if created % 100 == 0:
                conn.commit()
                print(f"  units created={created}", flush=True)
        except psycopg2.Error as e:
            conn.rollback()
            print(f"  skip inm={iid} conj={cid}: {e}", flush=True)
            skipped += 1

    conn.commit()
    print(f"Units created={created} linked={linked} skipped={skipped}", flush=True)
    return {"created": created, "linked": linked, "skipped": skipped, "totalInmuebles": len(rows)}


def main():
    report = {"startedAt": datetime.now().isoformat()}
    conn = pg()
    ac = access()
    try:
        conjuntos = collect_conjuntos(ac)
        report["conjuntosFound"] = len(conjuntos)
        report["conjuntosSkip"] = sorted(SKIP_CONJUNTO_IDS)
        complex_map = import_complexes(conn, conjuntos)
        report["complexesMapped"] = len(complex_map)
        props = rebuild_property_map(conn)
        report["propertiesMapped"] = len(props)
        report["units"] = import_units_and_link(ac, conn, complex_map, props)
    finally:
        report["finishedAt"] = datetime.now().isoformat()
        REPORT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        ac.close()
        conn.close()
        print("DONE", json.dumps(report, indent=2, default=str), flush=True)


if __name__ == "__main__":
    main()
