"""
Import ONLY properties + ACTIVE contracts into Inmobiliaria Poblar.
Creates missing people on demand (owners/tenants/guarantors).

Env: DATABASE_URL, ACCESS_MDB, ACCESS_PWD
"""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path

import bcrypt
import psycopg2
import pyodbc

ORG_SLUG = "inmobiliaria-poblar"
MAP_PATH = Path(__file__).resolve().parent.parent / ".tmp-access-review" / "id-map.json"
REPORT_PATH = Path(__file__).resolve().parent.parent / ".tmp-access-review" / "import-props-contracts-report.json"

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
    return re.sub(r"-+", "-", s).strip("-")[:80] or "item"


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


def clean_str(v, max_len=None):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    return s[:max_len] if max_len else s


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
        r"C:\Users\esteb\ERP Inmobiliario\.tmp-access-review\BaseInmobiliare-copy.mdb",
    )
    pwd = os.environ.get("ACCESS_PWD", "inmobiliare")
    cs = rf"DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={mdb};PWD={pwd};"
    return pyodbc.connect(cs, autocommit=True)


def pg_conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        url_file = Path(__file__).resolve().parent.parent / ".tmp-access-review" / "railway-db.url"
        if url_file.exists():
            url = url_file.read_text(encoding="utf-8").strip()
    if not url:
        raise SystemExit("DATABASE_URL required")
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return psycopg2.connect(url)


def fetch_all(ac, sql):
    cur = ac.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    out = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return out


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
    estado = (clean_str(row.get("estado")) or "").lower()
    if "inactiv" in estado or "baja" in estado:
        return "INACTIVE"
    if "reserv" in estado:
        return "RESERVED"
    if truthy(row.get("enAlquiler")) or truthy(row.get("enVenta")):
        return "AVAILABLE"
    return "DRAFT"


def is_active_contract(row, today=None):
    today = today or date.today()
    raw = (clean_str(row.get("estadoAlquiler")) or clean_str(row.get("estado")) or "").lower()
    if any(x in raw for x in ("rescind", "finaliz", "termin", "baja", "vencid", "anul")):
        return False
    end = to_date(row.get("vencimiento"))
    start = to_date(row.get("fechaInicio"))
    if end and end < today:
        return False
    if start and start > today + timedelta(days=60):
        # future draft-ish; skip for "activos"
        return False
    if "activ" in raw or "vigente" in raw or raw in {"ok", "si", "sí", ""}:
        return True
    # if no clear status but date range covers today
    if start and (not end or end >= today) and start <= today:
        return True
    return False


def contract_initial_rent(row):
    for k in ("importe1", "importe2", "importe3", "importe4", "importe5", "importe6", "totalAlquiler"):
        v = to_dec(row.get(k), "0")
        if v > 0:
            return v
    return Decimal("1")


def role_flags(row):
    roles = []

    def flag(val):
        s = (clean_str(val) or "").lower()
        return bool(s) and s not in {"no", "0", "false", "inactivo", "n", "baja"}

    if flag(row.get("estadoPropietario")):
        roles.append("OWNER")
    if flag(row.get("estadoInquilino")):
        roles.append("TENANT")
    if flag(row.get("estadoGarante")):
        roles.append("GUARANTOR")
    return roles or ["VIEWER"]


def primary_role(roles):
    for r in ("OWNER", "TENANT", "GUARANTOR", "VIEWER"):
        if r in roles:
            return r
    return "VIEWER"


class Importer:
    def __init__(self):
        self.ac = access_conn()
        self.pg = pg_conn()
        self.pg.autocommit = False
        self.idmap = load_map()
        self.report = {"startedAt": datetime.now().isoformat()}
        self.dummy_hash = bcrypt.hashpw(b"ChangeMeImport123!", bcrypt.gensalt(rounds=8)).decode()
        self.people_by_id = None
        cur = self.pg.cursor()
        cur.execute('SELECT id, name, slug FROM organizations WHERE slug=%s', (ORG_SLUG,))
        row = cur.fetchone()
        if not row:
            raise SystemExit("org not found")
        self.org_id = row[0]
        print(f"ORG {row[1]} ({row[2]})", flush=True)
        self._rebuild_people_map_from_db()
        self._rebuild_properties_map_from_db()

    def reconnect(self):
        try:
            self.pg.close()
        except Exception:
            pass
        self.pg = pg_conn()
        self.pg.autocommit = False
        print("  reconnected postgres", flush=True)

    def cur(self):
        try:
            c = self.pg.cursor()
            c.execute("SELECT 1")
            return c
        except Exception:
            self.reconnect()
            return self.pg.cursor()

    def commit(self):
        try:
            self.pg.commit()
        except Exception:
            self.reconnect()

    def exec(self, sql, params=None, retries=3):
        last = None
        for _ in range(retries):
            try:
                cur = self.cur()
                cur.execute(sql, params)
                return cur
            except psycopg2.OperationalError as e:
                last = e
                print(f"  db drop, retry: {e}", flush=True)
                try:
                    self.pg.rollback()
                except Exception:
                    pass
                self.reconnect()
            except psycopg2.InterfaceError as e:
                last = e
                print(f"  db interface error, retry: {e}", flush=True)
                self.reconnect()
        raise last

    def _rebuild_people_map_from_db(self):
        cur = self.cur()
        cur.execute(
            """
            SELECT u.id, u.email FROM organization_members m
            JOIN "User" u ON u.id=m."userId"
            WHERE m."organizationId"=%s
              AND u.email LIKE 'access%%@import.inmobiliaria-poblar.local'
            """,
            (self.org_id,),
        )
        people = {}
        for uid, email in cur.fetchall():
            m = re.match(r"access(\d+)@import\.inmobiliaria-poblar\.local$", email or "")
            if m:
                people[m.group(1)] = uid
        self.idmap["people"] = people
        save_map(self.idmap)
        print(f"people already mapped: {len(people)}", flush=True)

    def _rebuild_properties_map_from_db(self):
        cur = self.cur()
        cur.execute(
            """
            SELECT id, slug FROM "Property"
            WHERE "organizationId"=%s AND slug LIKE 'access-inm-%%'
            """,
            (self.org_id,),
        )
        props = {}
        for pid, slug in cur.fetchall():
            m = re.match(r"access-inm-(\d+)$", slug or "")
            if m:
                props[m.group(1)] = pid
        self.idmap["properties"] = props
        save_map(self.idmap)
        print(f"properties already mapped: {len(props)}", flush=True)

    def load_person_row(self, person_id: int):
        if self.people_by_id is None:
            print("loading Persona index...", flush=True)
            rows = fetch_all(self.ac, "SELECT * FROM Persona")
            self.people_by_id = {}
            for r in rows:
                pid = to_int(r.get("idPersona"))
                if pid is not None:
                    self.people_by_id[pid] = r
            print(f"Persona index: {len(self.people_by_id)}", flush=True)
        return self.people_by_id.get(person_id)

    def ensure_person(self, person_id: int | None, preferred_role: str | None = None):
        if not person_id:
            return None
        key = str(person_id)
        if key in self.idmap["people"]:
            return self.idmap["people"][key]

        row = self.load_person_row(person_id)
        if not row:
            return None

        name = clean_str(row.get("apellido"), 180) or f"Persona {person_id}"
        real_mail = clean_str(row.get("mail"), 100)
        if real_mail and "@" in real_mail:
            name = f"{name} <{real_mail}>"[:180]
        email = f"access{person_id}@import.inmobiliaria-poblar.local"
        phone = clean_str(row.get("telefono") or row.get("telefonoAlternativo"), 50)
        doc_type = clean_str(row.get("tipoDocumento"), 20)
        doc_num = clean_str(str(row.get("numeroDocumento") or ""), 40)
        if doc_num in {"0", "None"}:
            doc_num = None
        cbu = clean_str(row.get("cbu"), 30)
        bank = clean_str(row.get("banco"), 80)
        roles = role_flags(row)
        if preferred_role and preferred_role not in roles:
            roles = [preferred_role] + roles
        org_role = preferred_role or primary_role(roles)

        cur = self.cur()
        cur.execute('SELECT id FROM "User" WHERE email=%s', (email,))
        found = cur.fetchone()
        if found:
            user_id = found[0]
            self.exec(
                """
                UPDATE "User" SET name=%s, phone=%s, "documentType"=%s, "documentNumber"=%s,
                  "bankCbu"=%s, "bankName"=%s, "updatedAt"=NOW() WHERE id=%s
                """,
                (name, phone, doc_type, doc_num, cbu, bank, user_id),
            )
        else:
            user_id = "imp" + uuid.uuid4().hex[:22]
            self.exec(
                """
                INSERT INTO "User"
                  (id, email, "passwordHash", name, phone, "documentType", "documentNumber",
                   "isActive", "bankCbu", "bankName", "createdAt", "updatedAt")
                VALUES (%s,%s,%s,%s,%s,%s,%s,true,%s,%s,NOW(),NOW())
                """,
                (user_id, email, self.dummy_hash, name, phone, doc_type, doc_num, cbu, bank),
            )

        cur = self.exec(
            'SELECT id FROM organization_members WHERE "organizationId"=%s AND "userId"=%s',
            (self.org_id, user_id),
        )
        if not cur.fetchone():
            self.exec(
                """
                INSERT INTO organization_members
                  (id, "organizationId", "userId", role, "allowedModules", "createdAt", "updatedAt")
                VALUES (%s,%s,%s,%s,%s,NOW(),NOW())
                """,
                ("imm" + uuid.uuid4().hex[:22], self.org_id, user_id, org_role, []),
            )

        self.idmap["people"][key] = user_id
        return user_id

    def import_properties(self):
        print("== PROPERTIES ==", flush=True)
        rows = fetch_all(self.ac, "SELECT * FROM Inmueble")
        print(f"Access Inmueble: {len(rows)}", flush=True)
        created = updated = skipped = 0
        for i, row in enumerate(rows, 1):
            iid = to_int(row.get("idInmueble"))
            if iid is None:
                skipped += 1
                continue
            key = str(iid)
            address = clean_str(row.get("domicilio") or row.get("domicilioPostal"), 200) or f"Inmueble {iid}"
            city = clean_str(row.get("localidad"), 80) or "Sin ciudad"
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
                price, currency = (rent if rent > 0 else Decimal("1")), "ARS"
                rent_price = rent_currency = None
            elif op == "SALE":
                price, currency = (sale if sale > 0 else Decimal("1")), currency_sale
                rent_price = rent_currency = None
            else:
                price = sale if sale > 0 else (rent if rent > 0 else Decimal("1"))
                currency = currency_sale
                rent_price = rent if rent > 0 else None
                rent_currency = "ARS" if rent_price else None

            rooms = to_int(row.get("ambientes") or row.get("dormitorios"))
            baths = to_int(row.get("banios"))
            area = None
            if row.get("supTotal") or row.get("supCubierta"):
                area = to_dec(row.get("supTotal") or row.get("supCubierta"), None)
            desc = clean_str(row.get("descripcionComercial") or row.get("observaciones"))
            published_at = datetime.now() if status in {"AVAILABLE", "RESERVED"} else None
            owner_id = self.ensure_person(to_int(row.get("idPropietario")), "OWNER")

            # resume: skip if already mapped and exists
            prop_id = self.idmap["properties"].get(key)
            if prop_id:
                cur = self.exec('SELECT id FROM "Property" WHERE id=%s', (prop_id,))
                if cur.fetchone():
                    skipped += 1
                    if i % 200 == 0:
                        print(f"  properties skip {i}/{len(rows)} mapped={len(self.idmap['properties'])}", flush=True)
                    continue

            cur = self.exec(
                'SELECT id FROM "Property" WHERE "organizationId"=%s AND slug=%s',
                (self.org_id, slug),
            )
            found = cur.fetchone()
            if found:
                prop_id = found[0]
                self.exec(
                    """
                    UPDATE "Property"
                    SET title=%s, description=%s, "propertyType"=%s, "operationType"=%s, status=%s,
                        price=%s, currency=%s, "rentPrice"=%s, "rentCurrency"=%s,
                        address=%s, city=%s, rooms=%s, bathrooms=%s, "areaM2"=%s,
                        "publishedAt"=%s, "updatedAt"=NOW()
                    WHERE id=%s
                    """,
                    (
                        title, desc, ptype, op, status, price, currency, rent_price, rent_currency,
                        address, city, rooms, baths, area, published_at, prop_id,
                    ),
                )
                updated += 1
            else:
                prop_id = "imp" + uuid.uuid4().hex[:22]
                self.exec(
                    """
                    INSERT INTO "Property"
                      (id, title, slug, description, "propertyType", "operationType", status,
                       price, currency, "rentPrice", "rentCurrency", address, city, country,
                       rooms, bathrooms, "areaM2", amenities, "publishedAt",
                       "createdAt", "updatedAt", "organizationId")
                    VALUES
                      (%s,%s,%s,%s,%s,%s,%s,
                       %s,%s,%s,%s,%s,%s,'AR',
                       %s,%s,%s,%s,%s,
                       NOW(),NOW(),%s)
                    """,
                    (
                        prop_id, title, slug, desc, ptype, op, status,
                        price, currency, rent_price, rent_currency, address, city,
                        rooms, baths, area, [], published_at, self.org_id,
                    ),
                )
                created += 1

            if owner_id:
                self.exec('DELETE FROM "PropertyOwnership" WHERE "propertyId"=%s', (prop_id,))
                self.exec(
                    """
                    INSERT INTO "PropertyOwnership"
                      (id, "propertyId", "ownerId", "sharePct", "isPrimary", "createdAt")
                    VALUES (%s,%s,%s,100,true,NOW())
                    """,
                    ("imo" + uuid.uuid4().hex[:22], prop_id, owner_id),
                )

            self.idmap["properties"][key] = prop_id
            if i % 50 == 0:
                self.commit()
                save_map(self.idmap)
                print(f"  properties {i}/{len(rows)} created={created} updated={updated} skipped={skipped}", flush=True)

        self.commit()
        save_map(self.idmap)
        self.report["properties"] = {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total": len(rows),
        }
        print(f"Properties done created={created} updated={updated}", flush=True)

    def import_active_contracts(self):
        print("== ACTIVE CONTRACTS ==", flush=True)
        rows = fetch_all(self.ac, "SELECT * FROM Alquiler")
        grows = fetch_all(self.ac, "SELECT * FROM GarantePorAlquiler")
        guarantors = {}
        for g in grows:
            aid = to_int(g.get("idAlquiler"))
            gid = to_int(g.get("idGarante"))
            if aid and gid:
                guarantors.setdefault(aid, []).append(gid)

        active = [r for r in rows if is_active_contract(r)]
        print(f"Access Alquiler: {len(rows)} active={len(active)}", flush=True)
        created = updated = skipped = 0

        for i, row in enumerate(active, 1):
            aid = to_int(row.get("idAlquiler"))
            if aid is None:
                skipped += 1
                continue
            prop_id = self.idmap["properties"].get(str(to_int(row.get("idPropiedad"))))
            if not prop_id:
                skipped += 1
                continue

            tenant_id = self.ensure_person(to_int(row.get("idInquilino")), "TENANT")
            owner_id = self.ensure_person(to_int(row.get("idPropietario")), "OWNER")
            start = to_date(row.get("fechaInicio")) or date(2000, 1, 1)
            end = to_date(row.get("vencimiento")) or (start + timedelta(days=365 * 2))
            if end < start:
                end = start + timedelta(days=365)
            rent = contract_initial_rent(row)
            deposit = to_dec(row.get("deposito"), "0")
            late = to_dec(row.get("recargoPorMora") or row.get("multaDiaria"), "0")
            commission = to_dec(row.get("comisionPropietario"), "0")
            notes = clean_str(row.get("observaciones") or row.get("historial"))
            code = f"ALG-{aid}"

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

            key = str(aid)
            contract_id = self.idmap["contracts"].get(key)
            if contract_id:
                cur = self.exec('SELECT id FROM "Contract" WHERE id=%s', (contract_id,))
                if cur.fetchone():
                    skipped += 1
                    continue

            cur = self.exec(
                'SELECT id FROM "Contract" WHERE "organizationId"=%s AND code=%s',
                (self.org_id, code),
            )
            found = cur.fetchone()
            if found:
                contract_id = found[0]
                self.exec(
                    """
                    UPDATE "Contract"
                    SET "propertyId"=%s, status='ACTIVE', "startDate"=%s, "endDate"=%s,
                        "initialRent"=%s, "depositAmount"=%s, "lateFeeDailyRatePct"=%s,
                        "agencyCommissionPct"=%s, notes=%s, "updatedAt"=NOW()
                    WHERE id=%s
                    """,
                    (prop_id, start, end, rent, deposit, late, commission, notes, contract_id),
                )
                updated += 1
            else:
                contract_id = "imp" + uuid.uuid4().hex[:22]
                self.exec(
                    """
                    INSERT INTO "Contract"
                      (id, code, "propertyId", status, "startDate", "endDate",
                       "initialRent", currency, "depositAmount", "depositHeld",
                       "agencyCommissionPct", "lateFeeDailyRatePct",
                       "includesOrdinaryExp", "includesExtraordExp", notes,
                       "createdAt", "updatedAt", "organizationId",
                       "commissionMode", "commissionOwnerPct", "commissionTenantPct", "commissionValue")
                    VALUES
                      (%s,%s,%s,'ACTIVE',%s,%s,
                       %s,'ARS',%s,true,
                       %s,%s,
                       true,false,%s,
                       NOW(),NOW(),%s,
                       'PERCENT_RENT',100,0,0)
                    """,
                    (
                        contract_id, code, prop_id, start, end, rent, deposit,
                        commission, late, notes, self.org_id,
                    ),
                )
                created += 1

            def upsert_party(user_id, role):
                if not user_id:
                    return
                cur2 = self.exec(
                    """
                    SELECT id FROM "ContractParty"
                    WHERE "contractId"=%s AND "userId"=%s AND role=%s
                    """,
                    (contract_id, user_id, role),
                )
                if not cur2.fetchone():
                    self.exec(
                        """
                        INSERT INTO "ContractParty" (id, "contractId", "userId", role, "sharePct")
                        VALUES (%s,%s,%s,%s,NULL)
                        """,
                        ("icp" + uuid.uuid4().hex[:22], contract_id, user_id, role),
                    )

            upsert_party(tenant_id, "TENANT")
            upsert_party(owner_id, "OWNER")
            for gid in guarantors.get(aid, []):
                upsert_party(self.ensure_person(gid, "GUARANTOR"), "GUARANTOR")

            cur = self.exec(
                'SELECT id FROM "ContractAdjustment" WHERE "contractId"=%s LIMIT 1',
                (contract_id,),
            )
            if not cur.fetchone():
                self.exec(
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
                        "Importado Access (activo)",
                    ),
                )

            self.exec(
                """
                UPDATE "Property" SET status='RENTED', "updatedAt"=NOW()
                WHERE id=%s AND status IN ('AVAILABLE','DRAFT','RESERVED')
                """,
                (prop_id,),
            )

            self.idmap["contracts"][key] = contract_id
            if i % 25 == 0:
                self.commit()
                save_map(self.idmap)
                print(f"  contracts {i}/{len(active)} created={created} updated={updated} skipped={skipped}", flush=True)

        self.commit()
        save_map(self.idmap)
        self.report["contracts"] = {
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "active": len(active),
            "totalAccess": len(rows),
        }
        print(f"Contracts done created={created} updated={updated} skipped={skipped}", flush=True)

    def run(self):
        self.import_properties()
        self.import_active_contracts()
        self.report["finishedAt"] = datetime.now().isoformat()
        self.report["peopleMapped"] = len(self.idmap["people"])
        REPORT_PATH.write_text(json.dumps(self.report, indent=2, default=str), encoding="utf-8")
        print("REPORT", REPORT_PATH, flush=True)
        print(json.dumps(self.report, indent=2, default=str), flush=True)
        self.ac.close()
        self.pg.close()


if __name__ == "__main__":
    Importer().run()
