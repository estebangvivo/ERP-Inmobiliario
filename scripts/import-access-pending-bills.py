"""
Import pending DetalleAlquiler rows as TenantBill for Poblar contracts.
Only bills with saldo > 0 (or unpaid status) for contracts already imported (ALG-*).
"""
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
MAP_PATH = Path(__file__).resolve().parent.parent / ".tmp-access-review" / "id-map.json"
URL_PATH = Path(__file__).resolve().parent.parent / ".tmp-access-review" / "railway-db.url"
REPORT_PATH = Path(__file__).resolve().parent.parent / ".tmp-access-review" / "import-bills-report.json"
MDB = os.environ.get(
    "ACCESS_MDB",
    str(Path(__file__).resolve().parent.parent / ".tmp-access-review" / "BaseInmobiliare-copy.mdb"),
)
PWD = os.environ.get("ACCESS_PWD", "inmobiliare")


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


def clean_str(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def parse_period(periodo, fallback_date):
    s = clean_str(periodo) or ""
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
    low = s.lower()
    for name, num in months.items():
        if name in low:
            y = re.search(r"20\d{2}", low)
            if y:
                return int(y.group()), num
    d = to_date(fallback_date) or date.today()
    return d.year, d.month


def is_pending(row):
    saldo = to_dec(row.get("saldo"), "0")
    if saldo > 0:
        return True
    cobrado = to_dec(row.get("montoCobrado"), "0")
    a_cobrar = to_dec(row.get("montoACobrar"), "0")
    if a_cobrar > 0 and cobrado < a_cobrar:
        return True
    estado = (clean_str(row.get("estadoDetalle")) or "").lower()
    if any(x in estado for x in ("pend", "parcial", "vencid", "deuda", "impag")):
        return True
    if any(x in estado for x in ("cobrad", "pagad", "cancel", "liquid")):
        return False
    return False


def bill_status(row):
    saldo = to_dec(row.get("saldo"), "0")
    cobrado = to_dec(row.get("montoCobrado"), "0")
    due = to_date(row.get("fechaVencimiento"))
    if cobrado > 0 and saldo > 0:
        return "PARTIAL"
    if due and due < date.today() and saldo > 0:
        return "OVERDUE"
    return "PENDING"


def pg_connect():
    url = os.environ.get("DATABASE_URL") or URL_PATH.read_text(encoding="utf-8").strip()
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return psycopg2.connect(url)


class Db:
    def __init__(self):
        self.conn = pg_connect()
        self.conn.autocommit = False

    def reconnect(self):
        try:
            self.conn.close()
        except Exception:
            pass
        self.conn = pg_connect()
        self.conn.autocommit = False
        print("  reconnected postgres", flush=True)

    def execute(self, sql, params=None, retries=3):
        last = None
        for _ in range(retries):
            try:
                cur = self.conn.cursor()
                cur.execute(sql, params)
                return cur
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                last = e
                print(f"  db retry: {e}", flush=True)
                try:
                    self.conn.rollback()
                except Exception:
                    pass
                self.reconnect()
        raise last

    def commit(self):
        try:
            self.conn.commit()
        except Exception:
            self.reconnect()

    def rollback(self):
        try:
            self.conn.rollback()
        except Exception:
            self.reconnect()

    def close(self):
        try:
            self.conn.close()
        except Exception:
            pass


def access_connect():
    cs = rf"DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={MDB};PWD={PWD};"
    return pyodbc.connect(cs, autocommit=True)


def load_map():
    if MAP_PATH.exists():
        return json.loads(MAP_PATH.read_text(encoding="utf-8"))
    return {"people": {}, "properties": {}, "contracts": {}, "bills": {}}


def save_map(m):
    MAP_PATH.write_text(json.dumps(m, indent=2), encoding="utf-8")


def rebuild_contract_map(pg):
    cur = pg.cursor()
    cur.execute(
        'SELECT id, code FROM "Contract" WHERE "organizationId"=%s AND code LIKE %s',
        (ORG_ID, "ALG-%"),
    )
    contracts = {}
    for cid, code in cur.fetchall():
        m = re.match(r"ALG-(\d+)$", code or "")
        if m:
            contracts[m.group(1)] = cid
    return contracts


def rebuild_bills_map(pg):
    """Recover bills previously imported via notes accessDetalle=ID."""
    cur = pg.cursor()
    cur.execute(
        """
        SELECT tb.id, tb.notes
        FROM "TenantBill" tb
        JOIN "Contract" c ON c.id = tb."contractId"
        WHERE c."organizationId"=%s AND tb.notes LIKE %s
        """,
        (ORG_ID, "accessDetalle=%"),
    )
    bills = {}
    for bid, notes in cur.fetchall():
        m = re.search(r"accessDetalle=(\d+)", notes or "")
        if m:
            bills[m.group(1)] = bid
    return bills


def main():
    print("connecting...", flush=True)
    ac = access_connect()
    db = Db()
    idmap = load_map()
    idmap["contracts"] = rebuild_contract_map(db.conn)
    idmap["bills"] = rebuild_bills_map(db.conn)
    save_map(idmap)
    print(f"contracts mapped={len(idmap['contracts'])} bills mapped={len(idmap['bills'])}", flush=True)

    cur = ac.cursor()
    cur.execute("SELECT * FROM DetalleAlquiler")
    cols = [d[0] for d in cur.description]

    created = updated = skipped = seen = pending_seen = 0
    report = {"startedAt": datetime.now().isoformat()}

    while True:
        batch = cur.fetchmany(500)
        if not batch:
            break
        for raw in batch:
            seen += 1
            row = dict(zip(cols, raw))
            did = to_int(row.get("idDetalleAlquiler"))
            aid = to_int(row.get("idAlquiler"))
            if did is None or aid is None:
                skipped += 1
                continue
            if not is_pending(row):
                skipped += 1
                continue
            pending_seen += 1
            contract_id = idmap["contracts"].get(str(aid))
            if not contract_id:
                skipped += 1
                continue

            key = str(did)
            if key in idmap["bills"]:
                skipped += 1
                continue

            year, month = parse_period(row.get("periodo") or row.get("nombreMes"), row.get("fechaVencimiento"))
            due = to_date(row.get("fechaVencimiento")) or date(year, month, min(28, 10))
            rent = to_dec(row.get("montoInicial") or row.get("montoACobrar"), "0")
            late = to_dec(row.get("intereses"), "0") + to_dec(row.get("multa"), "0")
            total_amt = to_dec(row.get("montoACobrar"), "0")
            if total_amt <= 0:
                total_amt = rent + late
            paid = to_dec(row.get("montoCobrado"), "0")
            saldo = to_dec(row.get("saldo"), "0")
            if saldo > 0 and paid == 0 and total_amt > saldo:
                total_amt = saldo + paid
            status = bill_status(row)
            notes = f"accessDetalle={did}; periodo={clean_str(row.get('periodo')) or ''}"

            try:
                pcur = db.execute(
                    """
                    SELECT id FROM "TenantBill"
                    WHERE "contractId"=%s AND "periodYear"=%s AND "periodMonth"=%s
                    """,
                    (contract_id, year, month),
                )
                found = pcur.fetchone()
                if found:
                    bill_id = found[0]
                    db.execute(
                        """
                        UPDATE "TenantBill"
                        SET "dueDate"=%s, "rentAmount"=%s, "lateFeeAmount"=%s,
                            "totalAmount"=%s, "paidAmount"=%s, status=%s, notes=%s
                        WHERE id=%s
                        """,
                        (due, rent, late, total_amt, paid, status, notes, bill_id),
                    )
                    updated += 1
                else:
                    bill_id = "imp" + uuid.uuid4().hex[:22]
                    db.execute(
                        """
                        INSERT INTO "TenantBill"
                          (id, "contractId", "periodYear", "periodMonth", "dueDate",
                           "rentAmount", "expensesAmount", "lateFeeAmount", "otherAmount",
                           "totalAmount", "paidAmount", currency, status, "issuedAt", notes,
                           "commissionAmount")
                        VALUES
                          (%s,%s,%s,%s,%s,
                           %s,0,%s,0,
                           %s,%s,'ARS',%s,NOW(),%s,
                           0)
                        """,
                        (
                            bill_id, contract_id, year, month, due,
                            rent, late, total_amt, paid, status, notes,
                        ),
                    )
                    created += 1
                idmap["bills"][key] = bill_id
            except psycopg2.Error as e:
                db.rollback()
                print(f"  skip detalle={did} err={e}", flush=True)
                skipped += 1
                continue

            if (created + updated) % 100 == 0 and (created + updated) > 0:
                db.commit()
                save_map(idmap)
                print(
                    f"  bills progress created={created} updated={updated} "
                    f"pending_seen={pending_seen} seen={seen}",
                    flush=True,
                )

    db.commit()
    save_map(idmap)
    cur.close()
    ac.close()
    db.close()
    report.update(
        {
            "finishedAt": datetime.now().isoformat(),
            "seen": seen,
            "pendingSeen": pending_seen,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "billsMapped": len(idmap["bills"]),
        }
    )
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("DONE", json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
