"""
Import BaseInmobiliare.mdb -> Railway org Inmobiliaria Poblar.

Env:
  ACCESS_MDB   path to .mdb
  ACCESS_PWD   database password
  DATABASE_URL Postgres URL (public Railway)
  ORG_SLUG     default inmobiliaria-poblar
  PHASE        people|properties|contracts|bills|payments|settlements|workorders|all
"""

from __future__ import annotations

import json
import os
import re
import sys
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

import bcrypt
import psycopg2
import pyodbc
from psycopg2.extras import execute_batch

ORG_SLUG = os.environ.get("ORG_SLUG", "inmobiliaria-poblar")
MAP_PATH = Path(__file__).resolve().parent.parent / ".tmp-access-review" / "id-map.json"
REPORT_PATH = Path(__file__).resolve().parent.parent / ".tmp-access-review" / "import-report.json"

TYPE_MAP = {
    "casa": "HOUSE",
    "departamento": "APARTMENT",
    "depto": "APARTMENT",
    "ph": "APARTMENT",
    "local": "COMMERCIAL",
    "comercial": "COMMERCIAL",
    "oficina": "OFFICE",
    "terreno": "LAND",
    "lote": "LAND",
    "cochera": "OTHER",
    "galpon": "COMMERCIAL",
}


def slugify(text: str) -> str:
    s = (text or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:80] or "item"


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
    s = str(v)[:10]
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


def to_dt(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    return None


def clean_str(v, max_len=None):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    if max_len:
        s = s[:max_len]
    return s


def truthy(v):
    if v is None:
        return False
    s = str(v).strip().lower()
    return s in {"1", "si", "sí", "true", "s", "y", "yes", "activo", "ok"}


def load_map():
    if MAP_PATH.exists():
        return json.loads(MAP_PATH.read_text(encoding="utf-8"))
    return {
        "people": {},
        "properties": {},
        "contracts": {},
        "bills": {},
        "payments": {},
        "settlements": {},
        "workorders": {},
    }


def save_map(m):
    MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAP_PATH.write_text(json.dumps(m, indent=2), encoding="utf-8")


def access_conn():
    mdb = os.environ.get(
        "ACCESS_MDB",
        r"c:\Users\esteb\Desktop\Lenovo EV\Backup base\BaseInmobiliare.mdb",
    )
    pwd = os.environ.get("ACCESS_PWD", "inmobiliare")
    cs = (
        r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
        f"DBQ={mdb};PWD={pwd};"
    )
    return pyodbc.connect(cs, autocommit=True)


def pg_conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL required")
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    conn = psycopg2.connect(url)
    conn.autocommit = False
    return conn


def pg_alive(pg):
    try:
        if pg.closed:
            return False
        cur = pg.cursor()
        cur.execute("SELECT 1")
        cur.close()
        return True
    except Exception:
        return False


def pg_reset(pg):
    try:
        pg.close()
    except Exception:
        pass
    return pg_conn()


def ensure_pg(pg, force_check=False, counter=[0]):
    counter[0] += 1
    if force_check or counter[0] % 50 == 1:
        if not pg_alive(pg):
            print("  reconnecting postgres...", flush=True)
            return pg_reset(pg)
    return pg


def fetch_all(ac, sql):
    cur = ac.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    rows = []
    while True:
        batch = cur.fetchmany(1000)
        if not batch:
            break
        for r in batch:
            rows.append(dict(zip(cols, r)))
    cur.close()
    return rows


def iter_rows(ac, sql, size=500):
    cur = ac.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    while True:
        batch = cur.fetchmany(size)
        if not batch:
            break
        for r in batch:
            yield dict(zip(cols, r))
    cur.close()


def map_property_type(tipo, subtipo):
    blob = f"{tipo or ''} {subtipo or ''}".lower()
    for k, v in TYPE_MAP.items():
        if k in blob:
            return v
    return "OTHER"


def map_operation(row):
    rent = truthy(row.get("enAlquiler")) or truthy(row.get("enAlquilerTemporal"))
    sale = truthy(row.get("enVenta"))
    if rent and sale:
        return "BOTH"
    if sale:
        return "SALE"
    return "RENT"


def map_property_status(row):
    if truthy(row.get("estadoVendida")):
        return "SOLD"
    if truthy(row.get("estadoAlquilada")):
        return "RENTED"
    estado = clean_str(row.get("estado"), 20) or ""
    e = estado.lower()
    if "inactiv" in e or "baja" in e:
        return "INACTIVE"
    if "reserv" in e:
        return "RESERVED"
    if truthy(row.get("enAlquiler")) or truthy(row.get("enVenta")):
        return "AVAILABLE"
    return "DRAFT"


def map_contract_status(row):
    raw = (clean_str(row.get("estadoAlquiler")) or clean_str(row.get("estado")) or "").lower()
    if "rescind" in raw or "finaliz" in raw or "termin" in raw or "baja" in raw:
        return "TERMINATED"
    if "vencid" in raw:
        return "ENDED"
    if "activ" in raw or "vigente" in raw or raw in {"ok", "si", "sí"}:
        return "ACTIVE"
    start = to_date(row.get("fechaInicio"))
    end = to_date(row.get("vencimiento"))
    today = date.today()
    if end and end < today:
        return "ENDED"
    if start and start <= today and (not end or end >= today):
        return "ACTIVE"
    return "DRAFT"


def map_bill_status(row):
    raw = (clean_str(row.get("estadoDetalle")) or "").lower()
    saldo = to_dec(row.get("saldo"))
    cobrado = to_dec(row.get("montoCobrado"))
    if "cancel" in raw:
        return "CANCELLED"
    if saldo <= 0 and cobrado > 0:
        return "PAID"
    if cobrado > 0 and saldo > 0:
        return "PARTIAL"
    due = to_date(row.get("fechaVencimiento"))
    if due and due < date.today() and saldo > 0:
        return "OVERDUE"
    return "PENDING"


def map_settlement_status(row):
    if truthy(row.get("TotalPagado")):
        return "PAID"
    estado = (clean_str(row.get("estado")) or "").lower()
    if "cancel" in estado:
        return "CANCELLED"
    if "emit" in estado or "ok" in estado or truthy(row.get("HonorariosPagado")):
        return "ISSUED"
    return "ISSUED"


def map_work_status(row):
    raw = (clean_str(row.get("estadoReclamo")) or clean_str(row.get("estado")) or "").lower()
    if "cerr" in raw or "resolv" in raw or "final" in raw:
        return "DONE"
    if "curso" in raw or "progreso" in raw or "asign" in raw:
        return "IN_PROGRESS"
    if "cancel" in raw:
        return "CANCELLED"
    return "OPEN"


def person_role_flags(row):
    roles = []

    def flag(val):
        s = (clean_str(val) or "").lower()
        if not s:
            return False
        if s in {"no", "0", "false", "inactivo", "n", "baja"}:
            return False
        return True

    if flag(row.get("estadoPropietario")):
        roles.append("OWNER")
    if flag(row.get("estadoInquilino")):
        roles.append("TENANT")
    if flag(row.get("estadoGarante")):
        roles.append("GUARANTOR")
    return roles or ["VIEWER"]


def primary_org_role(roles):
    for r in ("OWNER", "TENANT", "GUARANTOR", "VIEWER"):
        if r in roles:
            return r
    return "VIEWER"


def synthetic_email(person_id: int, mail: str | None):
    # Stable unique email; real address kept only as contact via phone/notes elsewhere.
    return f"access{person_id}@import.inmobiliaria-poblar.local"


def ensure_org(pg):
    cur = pg.cursor()
    cur.execute(
        'SELECT id, name, slug FROM organizations WHERE slug=%s',
        (ORG_SLUG,),
    )
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"Organization slug not found: {ORG_SLUG}")
    print(f"ORG {row[1]} ({row[2]}) id={row[0]}")
    return row[0]


def import_people(ac, pg, org_id, idmap, report):
    print("== PEOPLE ==", flush=True)
    rows = list(iter_rows(ac, "SELECT * FROM Persona"))
    print(f"Access Persona: {len(rows)}", flush=True)
    created = updated = skipped = 0
    dummy_hash = bcrypt.hashpw(b"ChangeMeImport123!", bcrypt.gensalt(rounds=10)).decode()

    for row in rows:
        pg = ensure_pg(pg)
        cur = pg.cursor()
        pid = to_int(row.get("idPersona"))
        if pid is None:
            skipped += 1
            continue
        key = str(pid)
        name = clean_str(row.get("apellido"), 180) or f"Persona {pid}"
        real_mail = clean_str(row.get("mail"), 100)
        if real_mail and "@" in real_mail and len(name) < 160:
            name = f"{name} <{real_mail}>"[:180]
        email = synthetic_email(pid, row.get("mail"))
        phone = clean_str(row.get("telefono") or row.get("telefonoAlternativo"), 50)
        doc_type = clean_str(row.get("tipoDocumento"), 20)
        doc_num = clean_str(str(row.get("numeroDocumento") or ""), 40)
        if doc_num in {"0", "None"}:
            doc_num = None
        cbu = clean_str(row.get("cbu"), 30)
        bank = clean_str(row.get("banco"), 80)
        roles = person_role_flags(row)
        org_role = primary_org_role(roles)

        existing_user_id = idmap["people"].get(key)
        if existing_user_id:
            skipped += 1
            if skipped % 1000 == 0:
                print(f"  people skip-mapped={skipped} mapped={len(idmap['people'])}", flush=True)
            continue

        cur.execute('SELECT id FROM "User" WHERE email=%s', (email,))
        found = cur.fetchone()
        if found:
            user_id = found[0]
            cur.execute(
                """
                UPDATE "User"
                SET name=%s, phone=%s, "documentType"=%s, "documentNumber"=%s,
                    "bankCbu"=%s, "bankName"=%s, "updatedAt"=NOW()
                WHERE id=%s
                """,
                (name, phone, doc_type, doc_num, cbu, bank, user_id),
            )
            updated += 1
        else:
            user_id = "imp" + uuid.uuid4().hex[:22]
            try:
                cur.execute("SAVEPOINT sp_person")
                cur.execute(
                    """
                    INSERT INTO "User"
                      (id, email, "passwordHash", name, phone, "documentType", "documentNumber",
                       "isActive", "bankCbu", "bankName", "createdAt", "updatedAt")
                    VALUES (%s,%s,%s,%s,%s,%s,%s,true,%s,%s,NOW(),NOW())
                    """,
                    (user_id, email, dummy_hash, name, phone, doc_type, doc_num, cbu, bank),
                )
                cur.execute("RELEASE SAVEPOINT sp_person")
                created += 1
            except psycopg2.Error:
                cur.execute("ROLLBACK TO SAVEPOINT sp_person")
                cur.execute('SELECT id FROM "User" WHERE email=%s', (email,))
                found2 = cur.fetchone()
                if not found2:
                    skipped += 1
                    continue
                user_id = found2[0]
                updated += 1

        cur.execute(
            """
            SELECT id FROM organization_members
            WHERE "organizationId"=%s AND "userId"=%s
            """,
            (org_id, user_id),
        )
        mem = cur.fetchone()
        if mem:
            cur.execute(
                'UPDATE organization_members SET role=%s, "updatedAt"=NOW() WHERE id=%s',
                (org_role, mem[0]),
            )
        else:
            try:
                cur.execute("SAVEPOINT sp_mem")
                cur.execute(
                    """
                    INSERT INTO organization_members
                      (id, "organizationId", "userId", role, "allowedModules", "createdAt", "updatedAt")
                    VALUES (%s,%s,%s,%s,%s,NOW(),NOW())
                    """,
                    ("imm" + uuid.uuid4().hex[:22], org_id, user_id, org_role, []),
                )
                cur.execute("RELEASE SAVEPOINT sp_mem")
            except psycopg2.Error:
                cur.execute("ROLLBACK TO SAVEPOINT sp_mem")

        idmap["people"][key] = user_id
        if (created + updated) % 200 == 0:
            pg.commit()
            save_map(idmap)
            print(f"  people progress mapped={len(idmap['people'])} created={created} updated={updated}", flush=True)

    pg.commit()
    save_map(idmap)
    report["people"] = {"created": created, "updated": updated, "skipped": skipped, "total": len(rows)}
    print(f"People done created={created} updated={updated} skipped={skipped} mapped={len(idmap['people'])}", flush=True)
    return pg


def import_properties(ac, pg, org_id, idmap, report):
    print("== PROPERTIES ==")
    rows = list(iter_rows(ac, "SELECT * FROM Inmueble"))
    print(f"Access Inmueble: {len(rows)}")
    cur = pg.cursor()
    created = updated = skipped = 0

    for row in rows:
        iid = to_int(row.get("idInmueble"))
        if iid is None:
            skipped += 1
            continue
        key = str(iid)
        address = clean_str(row.get("domicilio") or row.get("domicilioPostal"), 200) or f"Inmueble {iid}"
        city = clean_str(row.get("localidad"), 80) or "Sin ciudad"
        province = None
        title = clean_str(row.get("descripcionComercial"), 180)
        if not title:
            tipo = clean_str(row.get("tipo")) or "Propiedad"
            title = f"{tipo} {address}"[:180]
        slug = f"access-inm-{iid}"
        ptype = map_property_type(row.get("tipo"), row.get("subtipo"))
        op = map_operation(row)
        status = map_property_status(row)
        rent = to_dec(row.get("alquilerSugerido"), "0")
        sale = to_dec(row.get("ventaSugerido"), "0")
        currency_sale = (clean_str(row.get("monedaVenta"), 3) or "USD").upper()
        if currency_sale not in {"ARS", "USD", "EUR"}:
            currency_sale = "USD"
        if op == "RENT":
            price = rent if rent > 0 else Decimal("1")
            currency = "ARS"
            rent_price = None
            rent_currency = None
        elif op == "SALE":
            price = sale if sale > 0 else Decimal("1")
            currency = currency_sale
            rent_price = None
            rent_currency = None
        else:
            price = sale if sale > 0 else (rent if rent > 0 else Decimal("1"))
            currency = currency_sale
            rent_price = rent if rent > 0 else None
            rent_currency = "ARS" if rent_price else None
            if price <= 0:
                price = Decimal("1")

        rooms = to_int(row.get("ambientes") or row.get("dormitorios"))
        baths = to_int(row.get("banios"))
        area = to_dec(row.get("supTotal") or row.get("supCubierta"), None) if (
            row.get("supTotal") or row.get("supCubierta")
        ) else None
        desc = clean_str(row.get("descripcionComercial") or row.get("observaciones"))
        published_at = datetime.utcnow() if status in {"AVAILABLE", "RESERVED"} else None
        owner_access = to_int(row.get("idPropietario"))
        owner_id = idmap["people"].get(str(owner_access)) if owner_access else None

        prop_id = idmap["properties"].get(key)
        if prop_id:
            cur.execute('SELECT id FROM "Property" WHERE id=%s', (prop_id,))
            if not cur.fetchone():
                prop_id = None
        if not prop_id:
            cur.execute(
                'SELECT id FROM "Property" WHERE "organizationId"=%s AND slug=%s',
                (org_id, slug),
            )
            found = cur.fetchone()
            if found:
                prop_id = found[0]

        if prop_id:
            cur.execute(
                """
                UPDATE "Property"
                SET title=%s, description=%s, "propertyType"=%s, "operationType"=%s, status=%s,
                    price=%s, currency=%s, "rentPrice"=%s, "rentCurrency"=%s,
                    address=%s, city=%s, province=%s, rooms=%s, bathrooms=%s, "areaM2"=%s,
                    "publishedAt"=%s, "updatedAt"=NOW()
                WHERE id=%s
                """,
                (
                    title,
                    desc,
                    ptype,
                    op,
                    status,
                    price,
                    currency,
                    rent_price,
                    rent_currency,
                    address,
                    city,
                    province,
                    rooms,
                    baths,
                    area,
                    published_at,
                    prop_id,
                ),
            )
            updated += 1
        else:
            prop_id = "imp" + uuid.uuid4().hex[:22]
            cur.execute(
                """
                INSERT INTO "Property"
                  (id, title, slug, description, "propertyType", "operationType", status,
                   price, currency, "rentPrice", "rentCurrency", address, city, province, country,
                   rooms, bathrooms, "areaM2", amenities, "publishedAt",
                   "createdAt", "updatedAt", "organizationId")
                VALUES
                  (%s,%s,%s,%s,%s,%s,%s,
                   %s,%s,%s,%s,%s,%s,%s,'AR',
                   %s,%s,%s,%s,%s,
                   NOW(),NOW(),%s)
                """,
                (
                    prop_id,
                    title,
                    slug,
                    desc,
                    ptype,
                    op,
                    status,
                    price,
                    currency,
                    rent_price,
                    rent_currency,
                    address,
                    city,
                    province,
                    rooms,
                    baths,
                    area,
                    [],
                    published_at,
                    org_id,
                ),
            )
            created += 1

        if owner_id:
            cur.execute(
                'SELECT id FROM "PropertyOwnership" WHERE "propertyId"=%s AND "ownerId"=%s',
                (prop_id, owner_id),
            )
            if not cur.fetchone():
                cur.execute('DELETE FROM "PropertyOwnership" WHERE "propertyId"=%s', (prop_id,))
                cur.execute(
                    """
                    INSERT INTO "PropertyOwnership"
                      (id, "propertyId", "ownerId", "sharePct", "isPrimary", "createdAt")
                    VALUES (%s,%s,%s,100,true,NOW())
                    """,
                    ("imo" + uuid.uuid4().hex[:22], prop_id, owner_id),
                )

        idmap["properties"][key] = prop_id
        if (created + updated) % 200 == 0:
            pg.commit()
            save_map(idmap)
            print(f"  properties progress {created+updated}/{len(rows)}")

    pg.commit()
    save_map(idmap)
    report["properties"] = {"created": created, "updated": updated, "skipped": skipped, "total": len(rows)}
    print(f"Properties done created={created} updated={updated} skipped={skipped}")


def contract_initial_rent(row):
    for k in (
        "importe1",
        "importe2",
        "importe3",
        "importe4",
        "importe5",
        "importe6",
        "totalAlquiler",
    ):
        v = to_dec(row.get(k), "0")
        if v > 0:
            return v
    return Decimal("1")


def import_contracts(ac, pg, org_id, idmap, report):
    print("== CONTRACTS ==")
    rows = list(iter_rows(ac, "SELECT * FROM Alquiler"))
    grows = list(iter_rows(ac, "SELECT * FROM GarantePorAlquiler"))
    print(f"Access Alquiler: {len(rows)} garantes: {len(grows)}")
    guarantors_by_contract: dict[str, list[int]] = {}
    for g in grows:
        aid = to_int(g.get("idAlquiler"))
        gid = to_int(g.get("idGarante"))
        if aid and gid:
            guarantors_by_contract.setdefault(str(aid), []).append(gid)

    cur = pg.cursor()
    created = updated = skipped = 0

    for row in rows:
        aid = to_int(row.get("idAlquiler"))
        if aid is None:
            skipped += 1
            continue
        key = str(aid)
        prop_access = to_int(row.get("idPropiedad"))
        prop_id = idmap["properties"].get(str(prop_access)) if prop_access else None
        if not prop_id:
            skipped += 1
            continue
        tenant_id = idmap["people"].get(str(to_int(row.get("idInquilino"))))
        owner_id = idmap["people"].get(str(to_int(row.get("idPropietario"))))
        start = to_date(row.get("fechaInicio")) or date(2000, 1, 1)
        end = to_date(row.get("vencimiento")) or (start + timedelta(days=365 * 2))
        if end < start:
            end = start + timedelta(days=365)
        status = map_contract_status(row)
        rent = contract_initial_rent(row)
        deposit = to_dec(row.get("deposito"), "0")
        late = to_dec(row.get("recargoPorMora") or row.get("multaDiaria"), "0")
        commission = to_dec(row.get("comisionPropietario"), "0")
        notes = clean_str(row.get("observaciones") or row.get("historial"))
        code = f"ALG-{aid}"

        # adjustment index
        index_type = "FIXED"
        custom_pct = None
        period_months = to_int(row.get("actualizarCada"), 12) or 12
        if truthy(row.get("basadoEnICL")):
            index_type = "ICL"
        elif truthy(row.get("basadoEnCasaPropia")):
            index_type = "CP"
        elif truthy(row.get("basadoEnPorcentaje")):
            index_type = "CUSTOM_PERCENT"
            custom_pct = to_dec(row.get("porcentajeAumento"), "0")
        elif truthy(row.get("basadoEnIndice")):
            index_type = "IPC"

        contract_id = idmap["contracts"].get(key)
        if contract_id:
            cur.execute('SELECT id FROM "Contract" WHERE id=%s', (contract_id,))
            if not cur.fetchone():
                contract_id = None
        if not contract_id:
            cur.execute(
                'SELECT id FROM "Contract" WHERE "organizationId"=%s AND code=%s',
                (org_id, code),
            )
            found = cur.fetchone()
            if found:
                contract_id = found[0]

        if contract_id:
            cur.execute(
                """
                UPDATE "Contract"
                SET "propertyId"=%s, status=%s, "startDate"=%s, "endDate"=%s,
                    "initialRent"=%s, "depositAmount"=%s, "lateFeeDailyRatePct"=%s,
                    "agencyCommissionPct"=%s, notes=%s, "updatedAt"=NOW()
                WHERE id=%s
                """,
                (
                    prop_id,
                    status,
                    start,
                    end,
                    rent,
                    deposit,
                    late,
                    commission,
                    notes,
                    contract_id,
                ),
            )
            updated += 1
        else:
            contract_id = "imp" + uuid.uuid4().hex[:22]
            cur.execute(
                """
                INSERT INTO "Contract"
                  (id, code, "propertyId", status, "startDate", "endDate",
                   "initialRent", currency, "depositAmount", "depositHeld",
                   "agencyCommissionPct", "lateFeeDailyRatePct",
                   "includesOrdinaryExp", "includesExtraordExp", notes,
                   "createdAt", "updatedAt", "organizationId",
                   "commissionMode", "commissionOwnerPct", "commissionTenantPct", "commissionValue")
                VALUES
                  (%s,%s,%s,%s,%s,%s,
                   %s,'ARS',%s,true,
                   %s,%s,
                   true,false,%s,
                   NOW(),NOW(),%s,
                   'PERCENT_RENT',100,0,0)
                """,
                (
                    contract_id,
                    code,
                    prop_id,
                    status,
                    start,
                    end,
                    rent,
                    deposit,
                    commission,
                    late,
                    notes,
                    org_id,
                ),
            )
            created += 1

        # parties
        def upsert_party(user_id, role):
            if not user_id:
                return
            cur.execute(
                """
                SELECT id FROM "ContractParty"
                WHERE "contractId"=%s AND "userId"=%s AND role=%s
                """,
                (contract_id, user_id, role),
            )
            if not cur.fetchone():
                cur.execute(
                    """
                    INSERT INTO "ContractParty" (id, "contractId", "userId", role, "sharePct")
                    VALUES (%s,%s,%s,%s,NULL)
                    """,
                    ("icp" + uuid.uuid4().hex[:22], contract_id, user_id, role),
                )

        upsert_party(tenant_id, "TENANT")
        upsert_party(owner_id, "OWNER")
        for gid in guarantors_by_contract.get(key, []):
            upsert_party(idmap["people"].get(str(gid)), "GUARANTOR")

        # one adjustment row
        cur.execute(
            'SELECT id FROM "ContractAdjustment" WHERE "contractId"=%s LIMIT 1',
            (contract_id,),
        )
        if not cur.fetchone():
            cur.execute(
                """
                INSERT INTO "ContractAdjustment"
                  (id, "contractId", "indexType", "customPercent", "periodMonths",
                   "effectiveFrom", "appliedRent", notes, "createdAt")
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                """,
                (
                    "ica" + uuid.uuid4().hex[:22],
                    contract_id,
                    index_type,
                    custom_pct,
                    period_months,
                    start,
                    rent,
                    "Importado desde Access",
                ),
            )

        idmap["contracts"][key] = contract_id
        if (created + updated) % 100 == 0:
            pg.commit()
            save_map(idmap)
            print(f"  contracts progress {created+updated}/{len(rows)}")

    pg.commit()
    save_map(idmap)
    report["contracts"] = {"created": created, "updated": updated, "skipped": skipped, "total": len(rows)}
    print(f"Contracts done created={created} updated={updated} skipped={skipped}")


def parse_period(periodo, fallback_date):
    # expect formats like 01/2024 or 2024-01 or "Enero 2024"
    s = clean_str(periodo) or ""
    m = re.search(r"(20\d{2})\D+(\d{1,2})", s)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"(\d{1,2})\D+(20\d{2})", s)
    if m:
        return int(m.group(2)), int(m.group(1))
    months = {
        "enero": 1,
        "febrero": 2,
        "marzo": 3,
        "abril": 4,
        "mayo": 5,
        "junio": 6,
        "julio": 7,
        "agosto": 8,
        "septiembre": 9,
        "setiembre": 9,
        "octubre": 10,
        "noviembre": 11,
        "diciembre": 12,
    }
    low = s.lower()
    for name, num in months.items():
        if name in low:
            y = re.search(r"20\d{2}", low)
            if y:
                return int(y.group()), num
    d = to_date(fallback_date) or date.today()
    return d.year, d.month


def import_bills(ac, pg, org_id, idmap, report):
    print("== BILLS (DetalleAlquiler) ==")
    cur = pg.cursor()
    created = updated = skipped = 0
    total = 0
    for row in iter_rows(ac, "SELECT * FROM DetalleAlquiler", size=1000):
        total += 1
        did = to_int(row.get("idDetalleAlquiler"))
        aid = to_int(row.get("idAlquiler"))
        if did is None or aid is None:
            skipped += 1
            continue
        contract_id = idmap["contracts"].get(str(aid))
        if not contract_id:
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
        status = map_bill_status(row)
        key = str(did)
        bill_id = idmap["bills"].get(key)

        if bill_id:
            cur.execute('SELECT id FROM "TenantBill" WHERE id=%s', (bill_id,))
            if not cur.fetchone():
                bill_id = None
        if not bill_id:
            cur.execute(
                """
                SELECT id FROM "TenantBill"
                WHERE "contractId"=%s AND "periodYear"=%s AND "periodMonth"=%s
                """,
                (contract_id, year, month),
            )
            found = cur.fetchone()
            if found:
                bill_id = found[0]

        notes = f"accessDetalle={did}; periodo={clean_str(row.get('periodo')) or ''}"
        if bill_id:
            cur.execute(
                """
                UPDATE "TenantBill"
                SET "dueDate"=%s, "rentAmount"=%s, "lateFeeAmount"=%s, "totalAmount"=%s,
                    "paidAmount"=%s, status=%s, notes=%s
                WHERE id=%s
                """,
                (due, rent, late, total_amt, paid, status, notes, bill_id),
            )
            updated += 1
        else:
            bill_id = "imp" + uuid.uuid4().hex[:22]
            try:
                cur.execute(
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
                        bill_id,
                        contract_id,
                        year,
                        month,
                        due,
                        rent,
                        late,
                        total_amt,
                        paid,
                        status,
                        notes,
                    ),
                )
                created += 1
            except psycopg2.Error:
                pg.rollback()
                # unique conflict on period: update existing
                cur = pg.cursor()
                cur.execute(
                    """
                    SELECT id FROM "TenantBill"
                    WHERE "contractId"=%s AND "periodYear"=%s AND "periodMonth"=%s
                    """,
                    (contract_id, year, month),
                )
                found = cur.fetchone()
                if not found:
                    skipped += 1
                    continue
                bill_id = found[0]
                cur.execute(
                    """
                    UPDATE "TenantBill"
                    SET "dueDate"=%s, "rentAmount"=%s, "lateFeeAmount"=%s, "totalAmount"=%s,
                        "paidAmount"=%s, status=%s, notes=%s
                    WHERE id=%s
                    """,
                    (due, rent, late, total_amt, paid, status, notes, bill_id),
                )
                updated += 1

        idmap["bills"][key] = bill_id
        if (created + updated) % 1000 == 0:
            pg.commit()
            save_map(idmap)
            print(f"  bills progress {created+updated} (seen {total})")

    pg.commit()
    save_map(idmap)
    report["bills"] = {"created": created, "updated": updated, "skipped": skipped, "total": total}
    print(f"Bills done created={created} updated={updated} skipped={skipped}")


def import_payments(ac, pg, org_id, idmap, report):
    print("== PAYMENTS ==")
    # Map cobro details that point to DetalleAlquiler
    cur = pg.cursor()
    created = skipped = 0
    total = 0
    # Load cobro headers for dates
    cobros = {}
    for row in iter_rows(ac, "SELECT idCobroAlquiler, fecha, porTransferencia, concepto FROM CobroAlquiler"):
        cid = to_int(row.get("idCobroAlquiler"))
        if cid:
            cobros[cid] = row

    for row in iter_rows(ac, "SELECT * FROM DetalleCobroAlquiler", size=1000):
        total += 1
        did = to_int(row.get("DidDetalleCobroAlquiler"))
        detalle_alquiler = to_int(row.get("DidDetalleAlquiler"))
        cobro_id = to_int(row.get("DidCobroAlquiler"))
        if not did or not detalle_alquiler:
            skipped += 1
            continue
        bill_id = idmap["bills"].get(str(detalle_alquiler))
        if not bill_id:
            skipped += 1
            continue
        key = str(did)
        if key in idmap["payments"]:
            continue
        amount = to_dec(row.get("Dtotal") or row.get("Dimporte"), "0")
        if amount <= 0:
            skipped += 1
            continue
        header = cobros.get(cobro_id or -1, {})
        paid_at = to_dt(header.get("fecha")) or datetime.utcnow()
        method = "BANK_TRANSFER" if truthy(header.get("porTransferencia")) else "CASH"
        ref = f"ACCESS-COB-{cobro_id}-DET-{did}"
        pay_id = "imp" + uuid.uuid4().hex[:22]
        cur.execute(
            """
            INSERT INTO "Payment"
              (id, "tenantBillId", amount, currency, method, "paidAt", reference, notes, "createdAt")
            VALUES (%s,%s,%s,'ARS',%s,%s,%s,%s,NOW())
            """,
            (
                pay_id,
                bill_id,
                amount,
                method,
                paid_at,
                ref,
                clean_str(row.get("Dconcepto") or header.get("concepto")),
            ),
        )
        idmap["payments"][key] = pay_id
        created += 1
        if created % 1000 == 0:
            pg.commit()
            save_map(idmap)
            print(f"  payments progress {created} (seen {total})")

    pg.commit()
    save_map(idmap)
    report["payments"] = {"created": created, "skipped": skipped, "total": total}
    print(f"Payments done created={created} skipped={skipped}")


def import_settlements(ac, pg, org_id, idmap, report):
    print("== SETTLEMENTS ==")
    rows = list(iter_rows(ac, "SELECT * FROM Liquidacion"))
    print(f"Access Liquidacion: {len(rows)}")
    cur = pg.cursor()
    created = updated = skipped = 0
    for row in rows:
        lid = to_int(row.get("idLiquidacion"))
        owner_access = to_int(row.get("idPropietario"))
        if lid is None or not owner_access:
            skipped += 1
            continue
        owner_id = idmap["people"].get(str(owner_access))
        if not owner_id:
            skipped += 1
            continue
        when = to_date(row.get("fecha")) or date.today()
        year, month = when.year, when.month
        code = f"LIQ-{lid}"
        gross = to_dec(row.get("totalIngresos"), "0")
        commission = to_dec(row.get("montoComision"), "0")
        deductions = to_dec(row.get("totalEgresos"), "0")
        net = to_dec(row.get("total"), "0")
        status = map_settlement_status(row)
        paid_at = to_dt(row.get("fecha")) if status == "PAID" else None
        key = str(lid)
        sid = idmap["settlements"].get(key)
        if sid:
            cur.execute('SELECT id FROM "OwnerSettlement" WHERE id=%s', (sid,))
            if not cur.fetchone():
                sid = None
        if not sid:
            cur.execute(
                'SELECT id FROM "OwnerSettlement" WHERE "organizationId"=%s AND code=%s',
                (org_id, code),
            )
            found = cur.fetchone()
            if found:
                sid = found[0]

        if sid:
            cur.execute(
                """
                UPDATE "OwnerSettlement"
                SET "ownerId"=%s, "periodYear"=%s, "periodMonth"=%s,
                    "grossRent"=%s, "commissionAmount"=%s, "deductionsAmount"=%s,
                    "netPayout"=%s, status=%s, "paidAt"=%s, "issuedAt"=%s, "updatedAt"=NOW()
                WHERE id=%s
                """,
                (
                    owner_id,
                    year,
                    month,
                    gross,
                    commission,
                    deductions,
                    net,
                    status,
                    paid_at,
                    to_dt(row.get("fecha")),
                    sid,
                ),
            )
            updated += 1
        else:
            sid = "imp" + uuid.uuid4().hex[:22]
            try:
                cur.execute(
                    """
                    INSERT INTO "OwnerSettlement"
                      (id, code, "ownerId", "periodYear", "periodMonth", currency,
                       "grossRent", "commissionAmount", "deductionsAmount", "extraordinaryAmount",
                       "netPayout", status, "paidAt", "issuedAt", "createdAt", "updatedAt", "organizationId")
                    VALUES
                      (%s,%s,%s,%s,%s,'ARS',
                       %s,%s,%s,0,
                       %s,%s,%s,%s,NOW(),NOW(),%s)
                    """,
                    (
                        sid,
                        code,
                        owner_id,
                        year,
                        month,
                        gross,
                        commission,
                        deductions,
                        net,
                        status,
                        paid_at,
                        to_dt(row.get("fecha")),
                        org_id,
                    ),
                )
                created += 1
            except psycopg2.Error as e:
                pg.rollback()
                cur = pg.cursor()
                # unique owner/period/currency conflict: suffix code
                code2 = f"LIQ-{lid}-{month}"
                sid = "imp" + uuid.uuid4().hex[:22]
                try:
                    cur.execute(
                        """
                        INSERT INTO "OwnerSettlement"
                          (id, code, "ownerId", "periodYear", "periodMonth", currency,
                           "grossRent", "commissionAmount", "deductionsAmount", "extraordinaryAmount",
                           "netPayout", status, "paidAt", "issuedAt", "createdAt", "updatedAt", "organizationId")
                        VALUES
                          (%s,%s,%s,%s,%s,'ARS',
                           %s,%s,%s,0,
                           %s,%s,%s,%s,NOW(),NOW(),%s)
                        """,
                        (
                            sid,
                            code2,
                            owner_id,
                            year,
                            month,
                            gross,
                            commission,
                            deductions,
                            net,
                            status,
                            paid_at,
                            to_dt(row.get("fecha")),
                            org_id,
                        ),
                    )
                    created += 1
                except psycopg2.Error:
                    pg.rollback()
                    cur = pg.cursor()
                    skipped += 1
                    continue

        idmap["settlements"][key] = sid
        if (created + updated) % 200 == 0:
            pg.commit()
            save_map(idmap)
            print(f"  settlements progress {created+updated}/{len(rows)}")

    pg.commit()
    save_map(idmap)
    report["settlements"] = {"created": created, "updated": updated, "skipped": skipped, "total": len(rows)}
    print(f"Settlements done created={created} updated={updated} skipped={skipped}")


def import_workorders(ac, pg, org_id, idmap, report):
    print("== WORK ORDERS (Reclamo) ==")
    rows = list(iter_rows(ac, "SELECT * FROM Reclamo"))
    print(f"Access Reclamo: {len(rows)}")
    cur = pg.cursor()
    created = updated = skipped = 0
    for row in rows:
        rid = to_int(row.get("idReclamo"))
        if rid is None:
            skipped += 1
            continue
        prop_id = idmap["properties"].get(str(to_int(row.get("idInmueble"))))
        if not prop_id:
            skipped += 1
            continue
        contract_id = idmap["contracts"].get(str(to_int(row.get("idAlquiler"))))
        title = clean_str(row.get("tema"), 180) or f"Reclamo {rid}"
        desc = clean_str(row.get("descripcion") or row.get("observaciones"))
        status = map_work_status(row)
        requested = to_dt(row.get("fecha")) or datetime.utcnow()
        completed = to_dt(row.get("fechaResolucion")) if status == "DONE" else None
        code = f"REC-{rid}"
        key = str(rid)
        wid = idmap["workorders"].get(key)
        if wid:
            cur.execute('SELECT id FROM "WorkOrder" WHERE id=%s', (wid,))
            if not cur.fetchone():
                wid = None
        if not wid:
            cur.execute(
                'SELECT id FROM "WorkOrder" WHERE "organizationId"=%s AND code=%s',
                (org_id, code),
            )
            found = cur.fetchone()
            if found:
                wid = found[0]
        if wid:
            cur.execute(
                """
                UPDATE "WorkOrder"
                SET "propertyId"=%s, "contractId"=%s, title=%s, description=%s,
                    status=%s, "requestedAt"=%s, "completedAt"=%s, "updatedAt"=NOW()
                WHERE id=%s
                """,
                (prop_id, contract_id, title, desc, status, requested, completed, wid),
            )
            updated += 1
        else:
            wid = "imp" + uuid.uuid4().hex[:22]
            cur.execute(
                """
                INSERT INTO "WorkOrder"
                  (id, code, "propertyId", "contractId", title, description, status,
                   "costBearer", "requestedAt", "completedAt", "createdAt", "updatedAt", "organizationId")
                VALUES
                  (%s,%s,%s,%s,%s,%s,%s,
                   'OWNER_DEDUCTIBLE',%s,%s,NOW(),NOW(),%s)
                """,
                (
                    wid,
                    code,
                    prop_id,
                    contract_id,
                    title,
                    desc,
                    status,
                    requested,
                    completed,
                    org_id,
                ),
            )
            created += 1
        idmap["workorders"][key] = wid

    pg.commit()
    save_map(idmap)
    report["workorders"] = {"created": created, "updated": updated, "skipped": skipped, "total": len(rows)}
    print(f"Work orders done created={created} updated={updated} skipped={skipped}")


def main():
    phase = (os.environ.get("PHASE") or "all").lower()
    print(f"PHASE={phase}")
    idmap = load_map()
    report = {"startedAt": datetime.utcnow().isoformat() + "Z", "phase": phase}
    ac = access_conn()
    pg = pg_conn()
    pg.autocommit = False
    org_id = ensure_org(pg)

    try:
        if phase in {"people", "all"}:
            pg = import_people(ac, pg, org_id, idmap, report)
        if phase in {"properties", "all"}:
            import_properties(ac, pg, org_id, idmap, report)
        if phase in {"contracts", "all"}:
            import_contracts(ac, pg, org_id, idmap, report)
        if phase in {"bills", "all"}:
            import_bills(ac, pg, org_id, idmap, report)
        if phase in {"payments", "all"}:
            import_payments(ac, pg, org_id, idmap, report)
        if phase in {"settlements", "all"}:
            import_settlements(ac, pg, org_id, idmap, report)
        if phase in {"workorders", "all"}:
            import_workorders(ac, pg, org_id, idmap, report)
    finally:
        save_map(idmap)
        report["finishedAt"] = datetime.utcnow().isoformat() + "Z"
        REPORT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        ac.close()
        pg.close()
        print("REPORT", REPORT_PATH)


if __name__ == "__main__":
    main()
