"""Bulk-update Poblar contracts commission + import pending extras."""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

import psycopg2
import pyodbc

ORG_ID = "cmsjb34ou0000mg4els0p1f4j"
BASE = Path(__file__).resolve().parent.parent / ".tmp-access-review"
URL = (BASE / "railway-db.url").read_text(encoding="utf-8").strip()
MDB = os.environ.get("ACCESS_MDB", str(BASE / "BaseInmobiliare-copy.mdb"))
PWD = os.environ.get("ACCESS_PWD", "inmobiliare")
MAP_PATH = BASE / "id-map.json"
REPORT_PATH = BASE / "import-extras-report.json"


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


def to_date(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def clean_str(v, n=None):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    return s[:n] if n else s


def truthy(v):
    s = (clean_str(v) or "").lower()
    return s in {"1", "si", "sí", "true", "s", "y", "yes", "activo", "ok"}


def parse_period(periodo, fallback=None):
    s = (clean_str(periodo) or "").lower()
    m = re.search(r"(20\d{2})\D+(\d{1,2})", s)
    if m:
        return int(m.group(1)), max(1, min(12, int(m.group(2))))
    m = re.search(r"(\d{1,2})\D+(20\d{2})", s)
    if m:
        return int(m.group(2)), max(1, min(12, int(m.group(1))))
    months = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
        "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9,
        "octubre": 10, "noviembre": 11, "diciembre": 12,
    }
    for name, num in months.items():
        if name in s:
            y = re.search(r"20\d{2}", s)
            if y:
                return int(y.group()), num
    d = to_date(fallback) or date.today()
    return d.year, d.month


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


def load_map():
    if MAP_PATH.exists():
        return json.loads(MAP_PATH.read_text(encoding="utf-8"))
    return {}


def save_map(m):
    MAP_PATH.write_text(json.dumps(m, indent=2), encoding="utf-8")


def fetch_all(ac, sql):
    cur = ac.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return rows


def rebuild_maps(conn):
    cur = conn.cursor()
    props, contracts = {}, {}
    cur.execute(
        'SELECT id, slug FROM "Property" WHERE "organizationId"=%s AND slug LIKE %s',
        (ORG_ID, "access-inm-%"),
    )
    for pid, slug in cur.fetchall():
        m = re.match(r"access-inm-(\d+)$", slug or "")
        if m:
            props[m.group(1)] = pid
    cur.execute(
        'SELECT id, code FROM "Contract" WHERE "organizationId"=%s AND code LIKE %s',
        (ORG_ID, "ALG-%"),
    )
    for cid, code in cur.fetchall():
        m = re.match(r"ALG-(\d+)$", code or "")
        if m:
            contracts[m.group(1)] = cid
    return props, contracts


def update_commissions(conn):
    print("== UPDATE COMMISSIONS ==", flush=True)
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE "Contract"
        SET "commissionMode"='CONTRACT_TOTAL',
            "agencyCommissionPct"=5,
            "commissionValue"=5,
            "commissionTenantPct"=100,
            "commissionOwnerPct"=0,
            "updatedAt"=NOW()
        WHERE "organizationId"=%s
        """,
        (ORG_ID,),
    )
    n = cur.rowcount
    conn.commit()
    print(f"contracts updated={n}", flush=True)
    return n


def expensa_pending(row):
    if truthy(row.get("cancelado")) or to_dec(row.get("cancelado")) > 0:
        # cancelado field sometimes numeric amount cancelled
        pass
    saldo = to_dec(row.get("saldo"), "0")
    if saldo > 0:
        return True
    estado = (clean_str(row.get("estadoCobro")) or clean_str(row.get("estado")) or "").lower()
    if any(x in estado for x in ("cobrad", "pagad", "cancel", "liquid")):
        return False
    if any(x in estado for x in ("pend", "parcial", "vencid", "deuda")):
        return True
    importe = to_dec(row.get("importe"), "0")
    return importe > 0 and not to_int(row.get("idCobroExpensa")) and not to_int(row.get("idCobro"))


def service_category(name: str | None):
    s = (name or "").lower()
    if "agua" in s:
        return "WATER"
    if "gas" in s:
        return "GAS"
    if "luz" in s or "elec" in s:
        return "ELECTRICITY"
    if "muni" in s or "abl" in s or "tasa" in s:
        return "MUNICIPAL"
    return "OTHER"


def import_pending_expenses(ac, conn, props):
    print("== PENDING EXPENSAS -> ServiceCost EXPENSES ==", flush=True)
    rows = fetch_all(ac, "SELECT * FROM Expensa")
    created = skipped = 0
    cur = conn.cursor()
    # avoid duplicates by notes
    cur.execute(
        """
        SELECT notes FROM "ServiceCost"
        WHERE "organizationId"=%s AND notes LIKE 'accessExpensa=%%'
        """,
        (ORG_ID,),
    )
    existing = set()
    for (notes,) in cur.fetchall():
        m = re.search(r"accessExpensa=(\d+)", notes or "")
        if m:
            existing.add(m.group(1))

    for row in rows:
        eid = to_int(row.get("idExpensa"))
        if eid is None or not expensa_pending(row):
            skipped += 1
            continue
        if str(eid) in existing:
            skipped += 1
            continue
        prop_id = props.get(str(to_int(row.get("idInmueble"))))
        if not prop_id:
            skipped += 1
            continue
        amount = to_dec(row.get("saldo"), "0")
        if amount <= 0:
            amount = to_dec(row.get("importe"), "0")
        if amount <= 0:
            skipped += 1
            continue
        year, month = parse_period(row.get("periodo"), row.get("fechaVencimiento"))
        concept = clean_str(row.get("concepto"), 180) or f"Expensa {eid}"
        notes = f"accessExpensa={eid}; periodo={clean_str(row.get('periodo')) or ''}; saldo={amount}"
        cur.execute(
            """
            INSERT INTO "ServiceCost"
              (id, "organizationId", "propertyId", ledger, category, concept,
               "periodYear", "periodMonth", amount, currency, notes, "createdAt")
            VALUES (%s,%s,%s,'EXPENSES','OTHER',%s,%s,%s,%s,'ARS',%s,NOW())
            """,
            (
                "imp" + uuid.uuid4().hex[:22],
                ORG_ID,
                prop_id,
                concept[:180],
                year,
                month,
                amount,
                notes,
            ),
        )
        created += 1
        if created % 200 == 0:
            conn.commit()
            print(f"  expensas created={created}", flush=True)
    conn.commit()
    print(f"Expensas done created={created} skipped={skipped} total={len(rows)}", flush=True)
    return {"created": created, "skipped": skipped, "total": len(rows)}


def servicio_pending(row):
    """ServicioImpuesto: saldo pendiente a cobrar (no cancelado / no se paga)."""
    amount = to_dec(row.get("saldo") or row.get("montoACobrar"), "0")
    if amount <= 0:
        return False
    est_serv = (clean_str(row.get("estadoServicio")) or "").lower()
    if any(x in est_serv for x in ("cancel", "rescind", "cobrad")):
        return False
    if est_serv and "por cobrar" not in est_serv and "pend" not in est_serv:
        # keep empty / unknown; skip other closed states
        if any(x in est_serv for x in ("pagad", "cerr", "fin", "anulado")):
            return False
    est_pago = (clean_str(row.get("estadoPago")) or "").lower()
    if "no se paga" in est_pago:
        return False
    estado = (clean_str(row.get("estado")) or "").upper()
    if estado == "FIN":
        return False
    return True


def import_pending_services(ac, conn, props):
    """Pending utility/tax charges from ServicioImpuesto -> ServiceCost SERVICES."""
    print("== PENDING SERVICIOS (ServicioImpuesto) ==", flush=True)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT notes FROM "ServiceCost"
        WHERE "organizationId"=%s AND notes LIKE 'accessServicio=%%'
        """,
        (ORG_ID,),
    )
    existing = set()
    for (notes,) in cur.fetchall():
        m = re.search(r"accessServicio=([^\s;]+)", notes or "")
        if m:
            existing.add(m.group(1))

    rows = fetch_all(ac, "SELECT * FROM ServicioImpuesto")
    created = skipped = 0
    for i, row in enumerate(rows, 1):
        if not servicio_pending(row):
            skipped += 1
            continue
        sid = to_int(row.get("idServicioImpuesto"))
        key = str(sid) if sid is not None else None
        if not key or key in existing:
            skipped += 1
            continue
        prop_id = props.get(str(to_int(row.get("idPropiedad"))))
        if not prop_id:
            skipped += 1
            continue
        amount = to_dec(row.get("saldo") or row.get("montoACobrar"), "0")
        year, month = parse_period(row.get("periodo"), row.get("fechaVencimiento") or row.get("fechaCarga"))
        concept = clean_str(row.get("servicio"), 180) or f"Servicio {sid}"
        notes = f"accessServicio={key}; source=ServicioImpuesto"
        cur.execute(
            """
            INSERT INTO "ServiceCost"
              (id, "organizationId", "propertyId", ledger, category, concept,
               "periodYear", "periodMonth", amount, currency, notes, "createdAt")
            VALUES (%s,%s,%s,'SERVICES',%s,%s,%s,%s,%s,'ARS',%s,NOW())
            """,
            (
                "imp" + uuid.uuid4().hex[:22],
                ORG_ID,
                prop_id,
                service_category(concept),
                concept[:180],
                year,
                month,
                amount,
                notes,
            ),
        )
        created += 1
        existing.add(key)
        if created % 200 == 0:
            conn.commit()
            print(f"  servicios created={created}", flush=True)

    conn.commit()
    print(f"Servicios done created={created} skipped={skipped} total={len(rows)}", flush=True)
    return {"created": created, "skipped": skipped, "total": len(rows)}


def reclamo_open(row):
    estado = (clean_str(row.get("estadoReclamo")) or clean_str(row.get("estado")) or "").lower()
    if any(x in estado for x in ("cerr", "resolv", "final", "cancel", "anulado")):
        return False
    if to_date(row.get("fechaResolucion")) and any(x in estado for x in ("ok", "listo")):
        return False
    return True


def import_open_claims(ac, conn, props, contracts):
    print("== OPEN RECLAMOS -> WorkOrder ==", flush=True)
    rows = fetch_all(ac, "SELECT * FROM Reclamo")
    cur = conn.cursor()
    cur.execute(
        'SELECT code FROM "WorkOrder" WHERE "organizationId"=%s AND code LIKE %s',
        (ORG_ID, "REC-%"),
    )
    existing = {r[0] for r in cur.fetchall()}
    created = skipped = 0
    for row in rows:
        rid = to_int(row.get("idReclamo"))
        if rid is None or not reclamo_open(row):
            skipped += 1
            continue
        code = f"REC-{rid}"
        if code in existing:
            skipped += 1
            continue
        prop_id = props.get(str(to_int(row.get("idInmueble"))))
        if not prop_id:
            skipped += 1
            continue
        contract_id = contracts.get(str(to_int(row.get("idAlquiler"))))
        title = clean_str(row.get("tema"), 180) or f"Reclamo {rid}"
        desc = clean_str(row.get("descripcion") or row.get("observaciones"))
        requested = to_date(row.get("fecha"))
        requested_dt = datetime(requested.year, requested.month, requested.day) if requested else datetime.now()
        cur.execute(
            """
            INSERT INTO "WorkOrder"
              (id, code, "propertyId", "contractId", title, description, status,
               "costBearer", "requestedAt", "createdAt", "updatedAt", "organizationId")
            VALUES
              (%s,%s,%s,%s,%s,%s,'OPEN',
               'OWNER_DEDUCTIBLE',%s,NOW(),NOW(),%s)
            """,
            (
                "imp" + uuid.uuid4().hex[:22],
                code,
                prop_id,
                contract_id,
                title,
                desc,
                requested_dt,
                ORG_ID,
            ),
        )
        created += 1
    conn.commit()
    print(f"Reclamos done created={created} skipped={skipped} total={len(rows)}", flush=True)
    return {"created": created, "skipped": skipped, "total": len(rows)}


def liquidacion_pending(row):
    if truthy(row.get("TotalPagado")):
        return False
    estado = (clean_str(row.get("estado")) or "").lower()
    if "cancel" in estado or "pagad" in estado:
        return False
    return True


def import_pending_settlements(ac, conn, idmap_people):
    print("== PENDING LIQUIDACIONES -> OwnerSettlement ==", flush=True)
    # rebuild people from emails
    cur = conn.cursor()
    cur.execute(
        """
        SELECT u.id, u.email FROM organization_members m
        JOIN "User" u ON u.id=m."userId"
        WHERE m."organizationId"=%s AND u.email LIKE 'access%%@import.inmobiliaria-poblar.local'
        """,
        (ORG_ID,),
    )
    people = {}
    for uid, email in cur.fetchall():
        m = re.match(r"access(\d+)@import\.inmobiliaria-poblar\.local$", email or "")
        if m:
            people[m.group(1)] = uid

    cur.execute(
        'SELECT code FROM "OwnerSettlement" WHERE "organizationId"=%s AND code LIKE %s',
        (ORG_ID, "LIQ-%"),
    )
    existing = {r[0] for r in cur.fetchall()}

    rows = fetch_all(ac, "SELECT * FROM Liquidacion")
    created = skipped = 0
    for row in rows:
        lid = to_int(row.get("idLiquidacion"))
        if lid is None or not liquidacion_pending(row):
            skipped += 1
            continue
        code = f"LIQ-{lid}"
        if code in existing:
            skipped += 1
            continue
        owner_id = people.get(str(to_int(row.get("idPropietario"))))
        if not owner_id:
            skipped += 1
            continue
        when = to_date(row.get("fecha")) or date.today()
        year, month = when.year, when.month
        gross = to_dec(row.get("totalIngresos"), "0")
        commission = to_dec(row.get("montoComision"), "0")
        deductions = to_dec(row.get("totalEgresos"), "0")
        net = to_dec(row.get("total"), "0")
        status = "ISSUED"
        try:
            cur.execute(
                """
                INSERT INTO "OwnerSettlement"
                  (id, code, "ownerId", "periodYear", "periodMonth", currency,
                   "grossRent", "commissionAmount", "deductionsAmount", "extraordinaryAmount",
                   "netPayout", status, "issuedAt", "createdAt", "updatedAt", "organizationId")
                VALUES
                  (%s,%s,%s,%s,%s,'ARS',
                   %s,%s,%s,0,
                   %s,%s,%s,NOW(),NOW(),%s)
                """,
                (
                    "imp" + uuid.uuid4().hex[:22],
                    code,
                    owner_id,
                    year,
                    month,
                    gross,
                    commission,
                    deductions,
                    net,
                    status,
                    datetime(when.year, when.month, when.day),
                    ORG_ID,
                ),
            )
            created += 1
        except psycopg2.Error:
            conn.rollback()
            # unique owner/period conflict: alternate code
            code2 = f"LIQ-{lid}-{month}"
            if code2 in existing:
                skipped += 1
                continue
            try:
                cur.execute(
                    """
                    INSERT INTO "OwnerSettlement"
                      (id, code, "ownerId", "periodYear", "periodMonth", currency,
                       "grossRent", "commissionAmount", "deductionsAmount", "extraordinaryAmount",
                       "netPayout", status, "issuedAt", "createdAt", "updatedAt", "organizationId")
                    VALUES
                      (%s,%s,%s,%s,%s,'ARS',
                       %s,%s,%s,0,
                       %s,%s,%s,NOW(),NOW(),%s)
                    """,
                    (
                        "imp" + uuid.uuid4().hex[:22],
                        code2,
                        owner_id,
                        year,
                        month,
                        gross,
                        commission,
                        deductions,
                        net,
                        status,
                        datetime(when.year, when.month, when.day),
                        ORG_ID,
                    ),
                )
                created += 1
            except psycopg2.Error as e:
                conn.rollback()
                skipped += 1
                continue
        if created % 100 == 0:
            conn.commit()
            print(f"  liquidaciones created={created}", flush=True)
    conn.commit()
    print(f"Liquidaciones done created={created} skipped={skipped} total={len(rows)}", flush=True)
    return {"created": created, "skipped": skipped, "total": len(rows)}


def main():
    only = (os.environ.get("IMPORT_ONLY") or "").strip().lower()
    report = {"startedAt": datetime.now().isoformat(), "only": only or "all"}
    conn = pg()
    ac = access()
    try:
        props, contracts = rebuild_maps(conn)
        print(f"maps props={len(props)} contracts={len(contracts)}", flush=True)
        if not only or only == "commissions":
            report["commissionsUpdated"] = update_commissions(conn)
        if not only or only == "expensas":
            report["expensas"] = import_pending_expenses(ac, conn, props)
        if not only or only == "servicios":
            report["servicios"] = import_pending_services(ac, conn, props)
        if not only or only == "reclamos":
            report["reclamos"] = import_open_claims(ac, conn, props, contracts)
        if not only or only == "liquidaciones":
            report["liquidaciones"] = import_pending_settlements(ac, conn, {})
    finally:
        report["finishedAt"] = datetime.now().isoformat()
        REPORT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        ac.close()
        conn.close()
        print("DONE", json.dumps(report, indent=2, default=str), flush=True)


if __name__ == "__main__":
    main()
