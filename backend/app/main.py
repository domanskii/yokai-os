import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

import bcrypt
import jwt
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from psycopg.rows import dict_row
from pydantic import BaseModel, EmailStr, Field

DATABASE_URL = os.environ["DATABASE_URL"]
SECRET_KEY = os.environ["SECRET_KEY"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].lower().strip()
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

OrderStatus = Literal[
    "Nowe",
    "Projekt",
    "Produkcja",
    "Gotowe",
    "Zrealizowane",
    "Anulowane",
]

PaymentStatus = Literal[
    "Nieopłacone",
    "Zaliczka",
    "Opłacone",
    "Zwrot",
]

app = FastAPI(title="YOKAI OS API", version="0.13.0")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OrderCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1, max_length=100)
    size: str | None = Field(default=None, max_length=100)
    quantity: int = Field(default=1, ge=1, le=100000)
    price: Decimal = Field(default=Decimal("0"), ge=0)
    paid_amount: Decimal = Field(default=Decimal("0"), ge=0)
    payment_status: PaymentStatus = "Nieopłacone"
    deadline: date | None = None
    notes: str | None = Field(default=None, max_length=5000)
    status: OrderStatus = "Projekt"


class OrderUpdate(BaseModel):
    client_name: str | None = Field(default=None, min_length=1, max_length=200)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    source: str | None = Field(default=None, min_length=1, max_length=100)
    size: str | None = Field(default=None, max_length=100)
    quantity: int | None = Field(default=None, ge=1, le=100000)
    price: Decimal | None = Field(default=None, ge=0)
    paid_amount: Decimal | None = Field(default=None, ge=0)
    payment_status: PaymentStatus | None = None
    deadline: date | None = None
    notes: str | None = Field(default=None, max_length=5000)
    status: OrderStatus | None = None


def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def create_token(user_id: int, email: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user_id),
            "email": email,
            "role": role,
            "iat": now,
            "exp": now + timedelta(hours=12),
        },
        SECRET_KEY,
        algorithm="HS256",
    )


def get_current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Brak tokenu",
        )

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesja wygasła lub token jest nieprawidłowy",
        ) from exc

    return {
        "id": int(payload["sub"]),
        "email": payload["email"],
        "role": payload.get("role", "admin"),
    }


def get_order_or_404(cur, order_id: int) -> dict:
    cur.execute(
        """
        SELECT
            id,
            order_number,
            client_name,
            name,
            source,
            size,
            quantity,
            price,
            paid_amount,
            payment_status,
            deadline,
            notes,
            status,
            is_archived,
            created_at,
            updated_at
        FROM orders
        WHERE id = %s
        """,
        (order_id,),
    )
    order = cur.fetchone()

    if order is None:
        raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

    return order


@app.on_event("startup")
def startup():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'admin',
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS orders (
                    id BIGSERIAL PRIMARY KEY,
                    order_number TEXT UNIQUE,
                    client_name TEXT NOT NULL,
                    name TEXT NOT NULL,
                    source TEXT NOT NULL,
                    size TEXT,
                    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
                    price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
                    deadline DATE,
                    notes TEXT,
                    status TEXT NOT NULL DEFAULT 'Projekt',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

            cur.execute(
                """
                ALTER TABLE orders
                ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
                """
            )
            cur.execute(
                """
                ALTER TABLE orders
                ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Nieopłacone'
                """
            )
            cur.execute(
                """
                ALTER TABLE orders
                ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE
                """
            )


            cur.execute(
                """
                UPDATE orders
                SET status = CASE
                    WHEN status = 'Akceptacja'
                        THEN 'Projekt'
                    WHEN status IN (
                        'Do cięcia',
                        'Wycinanie',
                        'Wybieranie',
                        'Warstwowanie',
                        'Transfer'
                    )
                        THEN 'Produkcja'
                    WHEN status IN (
                        'Pakowanie',
                        'Wysyłka'
                    )
                        THEN 'Gotowe'
                    ELSE status
                END
                WHERE status IN (
                    'Akceptacja',
                    'Do cięcia',
                    'Wycinanie',
                    'Wybieranie',
                    'Warstwowanie',
                    'Transfer',
                    'Pakowanie',
                    'Wysyłka'
                )
                """
            )

            cur.execute("SELECT id FROM users WHERE email = %s", (ADMIN_EMAIL,))
            if cur.fetchone() is None:
                password_hash = bcrypt.hashpw(
                    ADMIN_PASSWORD.encode(),
                    bcrypt.gensalt(),
                ).decode()

                cur.execute(
                    """
                    INSERT INTO users (email, password_hash, role)
                    VALUES (%s, %s, 'admin')
                    """,
                    (ADMIN_EMAIL, password_hash),
                )

        conn.commit()


@app.get("/")
def root():
    return {
        "name": "YOKAI OS",
        "version": "0.13.0",
        "status": "running",
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login")
def login(data: LoginRequest):
    email = data.email.lower().strip()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, password_hash, role, is_active
                FROM users
                WHERE email = %s
                """,
                (email,),
            )
            user = cur.fetchone()

    if not user or not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy login lub hasło",
        )

    if not bcrypt.checkpw(data.password.encode(), user["password_hash"].encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy login lub hasło",
        )

    return {
        "access_token": create_token(user["id"], user["email"], user["role"]),
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "role": user["role"],
        },
    }


@app.get("/auth/me")
def me(user: dict = Depends(get_current_user)):
    return user


@app.get("/orders/stats")
def order_stats(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE is_archived = FALSE) AS active,
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                        AND status = 'Produkcja'
                    ) AS cutting,
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                        AND status = 'Gotowe'
                    ) AS shipping,
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                        AND payment_status = 'Nieopłacone'
                    ) AS unpaid,
                    COALESCE(
                        SUM(price) FILTER (WHERE is_archived = FALSE),
                        0
                    ) AS total_value,
                    COALESCE(
                        SUM(paid_amount) FILTER (WHERE is_archived = FALSE),
                        0
                    ) AS paid_value
                FROM orders
                """
            )
            summary = cur.fetchone()

            cur.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM orders
                WHERE is_archived = FALSE
                GROUP BY status
                ORDER BY status
                """
            )
            status_rows = cur.fetchall()

    return {
        **summary,
        "status_counts": {
            row["status"]: row["count"]
            for row in status_rows
        },
    }


@app.get("/orders")
def list_orders(
    search: str | None = Query(default=None, max_length=200),
    order_status: str | None = Query(default=None, max_length=100),
    payment_status: str | None = Query(default=None, max_length=100),
    archived: bool = False,
    limit: int = Query(default=200, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    conditions = ["is_archived = %s"]
    params: list[object] = [archived]

    if search and search.strip():
        phrase = f"%{search.strip()}%"
        conditions.append(
            """
            (
                order_number ILIKE %s
                OR client_name ILIKE %s
                OR name ILIKE %s
                OR source ILIKE %s
            )
            """
        )
        params.extend([phrase, phrase, phrase, phrase])

    if order_status:
        conditions.append("status = %s")
        params.append(order_status)

    if payment_status:
        conditions.append("payment_status = %s")
        params.append(payment_status)

    params.append(limit)

    query = f"""
        SELECT
            id,
            order_number,
            client_name,
            name,
            source,
            size,
            quantity,
            price,
            paid_amount,
            payment_status,
            deadline,
            notes,
            status,
            is_archived,
            created_at,
            updated_at
        FROM orders
        WHERE {" AND ".join(conditions)}
        ORDER BY created_at DESC
        LIMIT %s
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            return cur.fetchall()


@app.get("/orders/{order_id}")
def get_order(
    order_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            return get_order_or_404(cur, order_id)


@app.post("/orders", status_code=status.HTTP_201_CREATED)
def create_order(
    data: OrderCreate,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO orders (
                    client_name,
                    name,
                    source,
                    size,
                    quantity,
                    price,
                    paid_amount,
                    payment_status,
                    deadline,
                    notes,
                    status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    data.client_name.strip(),
                    data.name.strip(),
                    data.source.strip(),
                    data.size.strip() if data.size else None,
                    data.quantity,
                    data.price,
                    data.paid_amount,
                    data.payment_status,
                    data.deadline,
                    data.notes.strip() if data.notes else None,
                    data.status,
                ),
            )
            order_id = cur.fetchone()["id"]
            order_number = f"YK-{order_id:05d}"

            cur.execute(
                """
                UPDATE orders
                SET order_number = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (order_number, order_id),
            )

            order = get_order_or_404(cur, order_id)

        conn.commit()

    return order


@app.patch("/orders/{order_id}")
def update_order(
    order_id: int,
    data: OrderUpdate,
    user: dict = Depends(get_current_user),
):
    values = data.model_dump(exclude_unset=True)

    if not values:
        raise HTTPException(status_code=400, detail="Brak danych do zapisania")

    allowed_columns = {
        "client_name",
        "name",
        "source",
        "size",
        "quantity",
        "price",
        "paid_amount",
        "payment_status",
        "deadline",
        "notes",
        "status",
    }

    assignments: list[str] = []
    params: list[object] = []

    for field, value in values.items():
        if field not in allowed_columns:
            continue

        if isinstance(value, str):
            value = value.strip()

        assignments.append(f"{field} = %s")
        params.append(value)

    if not assignments:
        raise HTTPException(status_code=400, detail="Brak danych do zapisania")

    assignments.append("updated_at = NOW()")
    params.append(order_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            get_order_or_404(cur, order_id)
            cur.execute(
                f"""
                UPDATE orders
                SET {", ".join(assignments)}
                WHERE id = %s
                """,
                params,
            )
            order = get_order_or_404(cur, order_id)

        conn.commit()

    return order


@app.post("/orders/{order_id}/archive")
def archive_order(
    order_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            get_order_or_404(cur, order_id)
            cur.execute(
                """
                UPDATE orders
                SET is_archived = TRUE, updated_at = NOW()
                WHERE id = %s
                """,
                (order_id,),
            )
            order = get_order_or_404(cur, order_id)

        conn.commit()

    return order


@app.post("/orders/{order_id}/restore")
def restore_order(
    order_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            get_order_or_404(cur, order_id)
            cur.execute(
                """
                UPDATE orders
                SET is_archived = FALSE, updated_at = NOW()
                WHERE id = %s
                """,
                (order_id,),
            )
            order = get_order_or_404(cur, order_id)

        conn.commit()

    return order


# === YOKAI WOOCOMMERCE IMPORT V0.5 ===

import base64 as _wc_base64
import json as _wc_json
import urllib.error as _wc_urlerror
import urllib.parse as _wc_urlparse
import urllib.request as _wc_urlrequest
import threading as _wc_threading
import time as _wc_time


_WC_STATUS_MAP = {
    "pending": "Nowe",
    "on-hold": "Projekt",
    "processing": "Produkcja",
    "completed": "Zrealizowane",
    "cancelled": "Anulowane",
    "refunded": "Anulowane",
    "failed": "Anulowane",
}


def _wc_configuration() -> tuple[str, str, str]:
    url = os.environ.get("WC_URL", "").strip().rstrip("/")
    key = os.environ.get("WC_CONSUMER_KEY", "").strip()
    secret = os.environ.get("WC_CONSUMER_SECRET", "").strip()

    if not url or not key or not secret:
        raise HTTPException(
            status_code=503,
            detail="Brak konfiguracji WooCommerce w backendzie",
        )

    return url, key, secret


def _wc_fetch_orders(limit: int) -> list[dict]:
    url, key, secret = _wc_configuration()

    authorization = _wc_base64.b64encode(
        f"{key}:{secret}".encode("utf-8")
    ).decode("ascii")

    collected: list[dict] = []
    page = 1

    while len(collected) < limit:
        per_page = min(100, limit - len(collected))

        query = _wc_urlparse.urlencode(
            {
                "per_page": per_page,
                "page": page,
                "orderby": "date",
                "order": "desc",
            }
        )

        endpoint = f"{url}/wp-json/wc/v3/orders?{query}"

        request = _wc_urlrequest.Request(
            endpoint,
            headers={
                "Authorization": f"Basic {authorization}",
                "Accept": "application/json",
                "User-Agent": "YOKAI-OS/0.13",
            },
            method="GET",
        )

        try:
            with _wc_urlrequest.urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except _wc_urlerror.HTTPError as exc:
            raw_error = exc.read().decode("utf-8", errors="replace")

            try:
                error_data = _wc_json.loads(raw_error)
                message = error_data.get("message", raw_error)
            except Exception:
                message = raw_error

            raise HTTPException(
                status_code=502,
                detail=f"WooCommerce HTTP {exc.code}: {message}",
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Nie udało się połączyć z WooCommerce: {exc}",
            ) from exc

        try:
            batch = _wc_json.loads(raw)
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail="WooCommerce zwrócił nieprawidłowy JSON",
            ) from exc

        if not isinstance(batch, list):
            raise HTTPException(
                status_code=502,
                detail="WooCommerce zwrócił nieprawidłową listę zamówień",
            )

        collected.extend(batch)

        if len(batch) < per_page:
            break

        page += 1

    return collected[:limit]


def _wc_customer_name(order: dict) -> str:
    billing = order.get("billing") or {}

    company = str(billing.get("company") or "").strip()
    first_name = str(billing.get("first_name") or "").strip()
    last_name = str(billing.get("last_name") or "").strip()
    email = str(billing.get("email") or "").strip()

    full_name = " ".join(
        part for part in [first_name, last_name] if part
    ).strip()

    return company or full_name or email or "Klient WooCommerce"


def _wc_order_name(order: dict) -> str:
    line_items = order.get("line_items") or []
    labels: list[str] = []

    for item in line_items[:4]:
        name = str(item.get("name") or "Produkt").strip()
        quantity = int(item.get("quantity") or 1)
        labels.append(f"{name} × {quantity}")

    if len(line_items) > 4:
        labels.append(f"+ {len(line_items) - 4} poz.")

    return " • ".join(labels) or f"Zamówienie WooCommerce #{order.get('number')}"


def _wc_quantity(order: dict) -> int:
    total = 0

    for item in order.get("line_items") or []:
        try:
            total += int(item.get("quantity") or 0)
        except (TypeError, ValueError):
            pass

    return max(total, 1)


def _wc_payment(order: dict) -> tuple[Decimal, str]:
    total = Decimal(str(order.get("total") or "0"))
    wc_status = str(order.get("status") or "").strip()

    if wc_status == "refunded":
        return Decimal("0"), "Zwrot"

    if order.get("date_paid"):
        return total, "Opłacone"

    return Decimal("0"), "Nieopłacone"


def _wc_notes(order: dict) -> str:
    lines = [
        f"WooCommerce #{order.get('number')}",
    ]

    payment_method = str(order.get("payment_method_title") or "").strip()
    if payment_method:
        lines.append(f"Płatność: {payment_method}")

    shipping_lines = order.get("shipping_lines") or []
    shipping_names = [
        str(item.get("method_title") or "").strip()
        for item in shipping_lines
        if str(item.get("method_title") or "").strip()
    ]

    if shipping_names:
        lines.append(f"Dostawa: {', '.join(shipping_names)}")

    customer_note = str(order.get("customer_note") or "").strip()
    if customer_note:
        lines.append(f"Uwagi klienta: {customer_note}")

    return "\n".join(lines)


def _ensure_woocommerce_schema(cur) -> None:
    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS woocommerce_order_id BIGINT
        """
    )

    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS woocommerce_order_number TEXT
        """
    )

    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS woocommerce_status TEXT
        """
    )

    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS woocommerce_synced_at TIMESTAMPTZ
        """
    )

    cur.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS orders_woocommerce_order_id_unique
        ON orders (woocommerce_order_id)
        WHERE woocommerce_order_id IS NOT NULL
        """
    )


@app.get("/woocommerce/status")
def woocommerce_status(
    user: dict = Depends(get_current_user),
):
    url = os.environ.get("WC_URL", "").strip().rstrip("/")
    key = os.environ.get("WC_CONSUMER_KEY", "").strip()
    secret = os.environ.get("WC_CONSUMER_SECRET", "").strip()

    return {
        "configured": bool(url and key and secret),
        "url": url or None,
    }


_WC_SYNC_LOCK = _wc_threading.Lock()
_WC_SYNC_WORKER_STARTED = False
_WC_SYNC_INTERVAL_SECONDS = 600


def _ensure_wc_sync_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS woocommerce_sync_state (
            id SMALLINT PRIMARY KEY,
            last_started_at TIMESTAMPTZ,
            last_finished_at TIMESTAMPTZ,
            last_success_at TIMESTAMPTZ,
            last_error TEXT,
            last_received INTEGER NOT NULL DEFAULT 0,
            last_created INTEGER NOT NULL DEFAULT 0,
            last_updated INTEGER NOT NULL DEFAULT 0,
            is_running BOOLEAN NOT NULL DEFAULT FALSE,
            trigger TEXT
        )
        """
    )

    cur.execute(
        """
        INSERT INTO woocommerce_sync_state (id)
        VALUES (1)
        ON CONFLICT (id) DO NOTHING
        """
    )


def _record_wc_sync_failure(error: str, trigger: str) -> None:
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                _ensure_wc_sync_schema(cur)

                cur.execute(
                    """
                    UPDATE woocommerce_sync_state
                    SET
                        last_finished_at = NOW(),
                        last_error = %s,
                        is_running = FALSE,
                        trigger = %s
                    WHERE id = 1
                    """,
                    (error[:2000], trigger),
                )

            conn.commit()
    except Exception:
        pass


def _wc_sync_once(limit: int = 100, trigger: str = "manual") -> dict:
    if not _WC_SYNC_LOCK.acquire(blocking=False):
        return {
            "received": 0,
            "created": 0,
            "updated": 0,
            "imported_numbers": [],
            "skipped": True,
            "message": "Synchronizacja już trwa",
        }

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                _ensure_woocommerce_schema(cur)
                _ensure_wc_sync_schema(cur)

                cur.execute(
                    """
                    UPDATE woocommerce_sync_state
                    SET
                        last_started_at = NOW(),
                        last_error = NULL,
                        is_running = TRUE,
                        trigger = %s
                    WHERE id = 1
                    """,
                    (trigger,),
                )

            conn.commit()

        woo_orders = _wc_fetch_orders(limit)

        created = 0
        updated = 0
        imported_numbers: list[str] = []

        with get_connection() as conn:
            with conn.cursor() as cur:
                _ensure_woocommerce_schema(cur)
                _ensure_wc_sync_schema(cur)

                for woo_order in woo_orders:
                    woo_id = int(woo_order["id"])
                    woo_number = str(
                        woo_order.get("number") or woo_id
                    ).strip()
                    woo_status = str(
                        woo_order.get("status") or ""
                    ).strip()

                    client_name = _wc_customer_name(woo_order)
                    order_name = _wc_order_name(woo_order)
                    quantity = _wc_quantity(woo_order)

                    price = Decimal(
                        str(woo_order.get("total") or "0")
                    )

                    paid_amount, payment_status = _wc_payment(
                        woo_order
                    )

                    production_status = _WC_STATUS_MAP.get(
                        woo_status,
                        "Nowe",
                    )

                    notes = _wc_notes(woo_order)

                    cur.execute(
                        """
                        SELECT id
                        FROM orders
                        WHERE woocommerce_order_id = %s
                        """,
                        (woo_id,),
                    )

                    existing = cur.fetchone()

                    if existing:
                        cur.execute(
                            """
                            UPDATE orders
                            SET
                                client_name = %s,
                                name = %s,
                                source = 'WooCommerce',
                                quantity = %s,
                                price = %s,
                                paid_amount = %s,
                                payment_status = %s,
                                woocommerce_order_number = %s,
                                woocommerce_status = %s,
                                woocommerce_synced_at = NOW(),
                                updated_at = NOW()
                            WHERE id = %s
                            """,
                            (
                                client_name,
                                order_name,
                                quantity,
                                price,
                                paid_amount,
                                payment_status,
                                woo_number,
                                woo_status,
                                existing["id"],
                            ),
                        )

                        updated += 1
                        continue

                    cur.execute(
                        """
                        INSERT INTO orders (
                            client_name,
                            name,
                            source,
                            size,
                            quantity,
                            price,
                            paid_amount,
                            payment_status,
                            deadline,
                            notes,
                            status,
                            woocommerce_order_id,
                            woocommerce_order_number,
                            woocommerce_status,
                            woocommerce_synced_at
                        )
                        VALUES (
                            %s,
                            %s,
                            'WooCommerce',
                            NULL,
                            %s,
                            %s,
                            %s,
                            %s,
                            NULL,
                            %s,
                            %s,
                            %s,
                            %s,
                            %s,
                            NOW()
                        )
                        RETURNING id
                        """,
                        (
                            client_name,
                            order_name,
                            quantity,
                            price,
                            paid_amount,
                            payment_status,
                            notes,
                            production_status,
                            woo_id,
                            woo_number,
                            woo_status,
                        ),
                    )

                    order_id = cur.fetchone()["id"]
                    order_number = f"YK-{order_id:05d}"

                    cur.execute(
                        """
                        UPDATE orders
                        SET
                            order_number = %s,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (order_number, order_id),
                    )

                    created += 1
                    imported_numbers.append(order_number)

                cur.execute(
                    """
                    UPDATE woocommerce_sync_state
                    SET
                        last_finished_at = NOW(),
                        last_success_at = NOW(),
                        last_error = NULL,
                        last_received = %s,
                        last_created = %s,
                        last_updated = %s,
                        is_running = FALSE,
                        trigger = %s
                    WHERE id = 1
                    """,
                    (
                        len(woo_orders),
                        created,
                        updated,
                        trigger,
                    ),
                )

            conn.commit()

        return {
            "received": len(woo_orders),
            "created": created,
            "updated": updated,
            "imported_numbers": imported_numbers[:20],
            "skipped": False,
        }

    except Exception as exc:
        _record_wc_sync_failure(str(exc), trigger)
        raise

    finally:
        _WC_SYNC_LOCK.release()


def _wc_auto_sync_worker() -> None:
    while True:
        try:
            _wc_sync_once(
                limit=100,
                trigger="automatic",
            )
        except Exception as exc:
            print(
                f"WooCommerce auto-sync error: {exc}",
                flush=True,
            )

        _wc_time.sleep(_WC_SYNC_INTERVAL_SECONDS)


@app.on_event("startup")
def start_wc_auto_sync_worker():
    global _WC_SYNC_WORKER_STARTED

    configured = all(
        [
            os.environ.get("WC_URL", "").strip(),
            os.environ.get("WC_CONSUMER_KEY", "").strip(),
            os.environ.get("WC_CONSUMER_SECRET", "").strip(),
        ]
    )

    if not configured or _WC_SYNC_WORKER_STARTED:
        return

    _WC_SYNC_WORKER_STARTED = True

    worker = _wc_threading.Thread(
        target=_wc_auto_sync_worker,
        name="woocommerce-auto-sync",
        daemon=True,
    )

    worker.start()


@app.get("/woocommerce/sync-status")
def woocommerce_sync_status(
    user: dict = Depends(get_current_user),
):
    configured = all(
        [
            os.environ.get("WC_URL", "").strip(),
            os.environ.get("WC_CONSUMER_KEY", "").strip(),
            os.environ.get("WC_CONSUMER_SECRET", "").strip(),
        ]
    )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_wc_sync_schema(cur)

            cur.execute(
                """
                SELECT
                    last_started_at,
                    last_finished_at,
                    last_success_at,
                    last_error,
                    last_received,
                    last_created,
                    last_updated,
                    is_running,
                    trigger
                FROM woocommerce_sync_state
                WHERE id = 1
                """
            )

            state = cur.fetchone()

        conn.commit()

    return {
        "configured": configured,
        "interval_minutes": 10,
        **state,
    }


@app.post("/woocommerce/import")
def import_woocommerce_orders(
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    return _wc_sync_once(
        limit=limit,
        trigger="manual",
    )



# === YOKAI WOOCOMMERCE ORDER DETAILS V0.8 ===


def _wc_fetch_single_order(woocommerce_order_id: int) -> dict:
    url, key, secret = _wc_configuration()

    authorization = _wc_base64.b64encode(
        f"{key}:{secret}".encode("utf-8")
    ).decode("ascii")

    endpoint = (
        f"{url}/wp-json/wc/v3/orders/"
        f"{woocommerce_order_id}"
    )

    request = _wc_urlrequest.Request(
        endpoint,
        headers={
            "Authorization": f"Basic {authorization}",
            "Accept": "application/json",
            "User-Agent": "YOKAI-OS/0.13",
        },
        method="GET",
    )

    try:
        with _wc_urlrequest.urlopen(
            request,
            timeout=30,
        ) as response:
            raw = response.read().decode("utf-8")

    except _wc_urlerror.HTTPError as exc:
        raw_error = exc.read().decode(
            "utf-8",
            errors="replace",
        )

        try:
            error_data = _wc_json.loads(raw_error)
            message = error_data.get(
                "message",
                raw_error,
            )
        except Exception:
            message = raw_error

        raise HTTPException(
            status_code=502,
            detail=(
                f"WooCommerce HTTP {exc.code}: "
                f"{message}"
            ),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Nie udało się pobrać szczegółów "
                f"z WooCommerce: {exc}"
            ),
        ) from exc

    try:
        data = _wc_json.loads(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="WooCommerce zwrócił nieprawidłowy JSON",
        ) from exc

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=502,
            detail="Nieprawidłowa odpowiedź WooCommerce",
        )

    return data


def _wc_public_meta(metadata: list | None) -> list[dict]:
    result: list[dict] = []

    for item in metadata or []:
        key = str(item.get("key") or "").strip()

        if not key or key.startswith("_"):
            continue

        value = item.get("value")

        result.append(
            {
                "id": item.get("id"),
                "key": key,
                "display_key": str(
                    item.get("display_key")
                    or key
                ).strip(),
                "value": value,
                "display_value": item.get(
                    "display_value",
                    value,
                ),
            }
        )

    return result


def _wc_public_address(address: dict | None) -> dict:
    address = address or {}

    return {
        "first_name": str(
            address.get("first_name") or ""
        ).strip(),
        "last_name": str(
            address.get("last_name") or ""
        ).strip(),
        "company": str(
            address.get("company") or ""
        ).strip(),
        "address_1": str(
            address.get("address_1") or ""
        ).strip(),
        "address_2": str(
            address.get("address_2") or ""
        ).strip(),
        "postcode": str(
            address.get("postcode") or ""
        ).strip(),
        "city": str(
            address.get("city") or ""
        ).strip(),
        "state": str(
            address.get("state") or ""
        ).strip(),
        "country": str(
            address.get("country") or ""
        ).strip(),
        "email": str(
            address.get("email") or ""
        ).strip(),
        "phone": str(
            address.get("phone") or ""
        ).strip(),
    }



# === YOKAI PRODUCT IMAGES V0.9 ===


def _wc_fetch_optional_resource(
    resource_path: str,
) -> dict | None:
    url, key, secret = _wc_configuration()

    authorization = _wc_base64.b64encode(
        f"{key}:{secret}".encode("utf-8")
    ).decode("ascii")

    endpoint = (
        f"{url}/wp-json/wc/v3/"
        f"{resource_path.lstrip('/')}"
    )

    request = _wc_urlrequest.Request(
        endpoint,
        headers={
            "Authorization": f"Basic {authorization}",
            "Accept": "application/json",
            "User-Agent": "YOKAI-OS/0.13",
        },
        method="GET",
    )

    try:
        with _wc_urlrequest.urlopen(
            request,
            timeout=20,
        ) as response:
            raw = response.read().decode("utf-8")

        data = _wc_json.loads(raw)

        if isinstance(data, dict):
            return data

    except Exception:
        # Brak zdjęcia nie może blokować całej karty zamówienia.
        return None

    return None


def _wc_extract_image(
    payload: dict | None,
    fallback_alt: str,
) -> dict | None:
    if not payload:
        return None

    image = payload.get("image")

    if not isinstance(image, dict):
        images = payload.get("images")

        if isinstance(images, list) and images:
            first_image = images[0]

            if isinstance(first_image, dict):
                image = first_image

    if not isinstance(image, dict):
        return None

    src = str(image.get("src") or "").strip()

    if not src:
        return None

    alt = str(
        image.get("alt")
        or image.get("name")
        or fallback_alt
    ).strip()

    return {
        "url": src,
        "alt": alt or fallback_alt,
    }


def _wc_item_image(
    item: dict,
    cache: dict[tuple[int, int], dict],
) -> dict:
    item_name = str(
        item.get("name") or "Produkt"
    ).strip()

    direct_image = item.get("image")

    if isinstance(direct_image, dict):
        direct_src = str(
            direct_image.get("src") or ""
        ).strip()

        if direct_src:
            return {
                "url": direct_src,
                "alt": str(
                    direct_image.get("alt")
                    or direct_image.get("name")
                    or item_name
                ).strip(),
            }

    try:
        product_id = int(
            item.get("product_id") or 0
        )
    except (TypeError, ValueError):
        product_id = 0

    try:
        variation_id = int(
            item.get("variation_id") or 0
        )
    except (TypeError, ValueError):
        variation_id = 0

    cache_key = (
        product_id,
        variation_id,
    )

    if cache_key in cache:
        return cache[cache_key]

    result = {
        "url": None,
        "alt": item_name,
    }

    if product_id and variation_id:
        variation = _wc_fetch_optional_resource(
            f"products/{product_id}/variations/"
            f"{variation_id}?image_size=medium"
        )

        variation_image = _wc_extract_image(
            variation,
            item_name,
        )

        if variation_image:
            cache[cache_key] = variation_image
            return variation_image

    if product_id:
        product = _wc_fetch_optional_resource(
            f"products/{product_id}?image_size=medium"
        )

        product_image = _wc_extract_image(
            product,
            item_name,
        )

        if product_image:
            cache[cache_key] = product_image
            return product_image

    cache[cache_key] = result
    return result


@app.get("/orders/{order_id}/woocommerce-details")
def get_woocommerce_order_details(
    order_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    order_number,
                    source,
                    woocommerce_order_id,
                    woocommerce_order_number,
                    woocommerce_status,
                    woocommerce_synced_at
                FROM orders
                WHERE id = %s
                """,
                (order_id,),
            )

            internal_order = cur.fetchone()

    if internal_order is None:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono zamówienia",
        )

    woocommerce_order_id = internal_order.get(
        "woocommerce_order_id"
    )

    if not woocommerce_order_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "To zamówienie nie pochodzi "
                "z WooCommerce"
            ),
        )

    order = _wc_fetch_single_order(
        int(woocommerce_order_id)
    )

    items = []
    image_cache: dict[tuple[int, int], dict] = {}

    for item in order.get("line_items") or []:
        item_image = _wc_item_image(
            item,
            image_cache,
        )

        items.append(
            {
                "id": item.get("id"),
                "name": str(
                    item.get("name") or "Produkt"
                ).strip(),
                "product_id": item.get("product_id"),
                "variation_id": item.get("variation_id"),
                "quantity": int(
                    item.get("quantity") or 0
                ),
                "sku": str(
                    item.get("sku") or ""
                ).strip(),
                "price": str(
                    item.get("price") or "0"
                ),
                "subtotal": str(
                    item.get("subtotal") or "0"
                ),
                "total": str(
                    item.get("total") or "0"
                ),
                "tax": str(
                    item.get("total_tax") or "0"
                ),
                "image_url": item_image.get("url"),
                "image_alt": item_image.get("alt")
                or str(item.get("name") or "Produkt"),
                "meta": _wc_public_meta(
                    item.get("meta_data")
                ),
            }
        )

    shipping_methods = []

    for shipping in order.get("shipping_lines") or []:
        shipping_methods.append(
            {
                "id": shipping.get("id"),
                "method_title": str(
                    shipping.get("method_title") or ""
                ).strip(),
                "method_id": str(
                    shipping.get("method_id") or ""
                ).strip(),
                "total": str(
                    shipping.get("total") or "0"
                ),
                "meta": _wc_public_meta(
                    shipping.get("meta_data")
                ),
            }
        )

    fees = []

    for fee in order.get("fee_lines") or []:
        fees.append(
            {
                "id": fee.get("id"),
                "name": str(
                    fee.get("name") or "Opłata"
                ).strip(),
                "total": str(
                    fee.get("total") or "0"
                ),
            }
        )

    coupons = []

    for coupon in order.get("coupon_lines") or []:
        coupons.append(
            {
                "code": str(
                    coupon.get("code") or ""
                ).strip(),
                "discount": str(
                    coupon.get("discount") or "0"
                ),
            }
        )

    return {
        "internal_order_id": internal_order["id"],
        "internal_order_number": internal_order[
            "order_number"
        ],
        "woocommerce_order_id": order.get("id"),
        "woocommerce_order_number": str(
            order.get("number")
            or internal_order.get(
                "woocommerce_order_number"
            )
            or ""
        ),
        "woocommerce_status": str(
            order.get("status") or ""
        ),
        "currency": str(
            order.get("currency") or "PLN"
        ),
        "total": str(
            order.get("total") or "0"
        ),
        "subtotal": str(
            order.get("subtotal") or "0"
        ),
        "discount_total": str(
            order.get("discount_total") or "0"
        ),
        "shipping_total": str(
            order.get("shipping_total") or "0"
        ),
        "total_tax": str(
            order.get("total_tax") or "0"
        ),
        "date_created": order.get("date_created"),
        "date_modified": order.get("date_modified"),
        "date_paid": order.get("date_paid"),
        "date_completed": order.get(
            "date_completed"
        ),
        "payment_method": str(
            order.get("payment_method") or ""
        ),
        "payment_method_title": str(
            order.get("payment_method_title") or ""
        ),
        "transaction_id": str(
            order.get("transaction_id") or ""
        ),
        "customer_note": str(
            order.get("customer_note") or ""
        ),
        "billing": _wc_public_address(
            order.get("billing")
        ),
        "shipping": _wc_public_address(
            order.get("shipping")
        ),
        "items": items,
        "shipping_methods": shipping_methods,
        "fees": fees,
        "coupons": coupons,
        "order_meta": _wc_public_meta(
            order.get("meta_data")
        ),
    }



# === YOKAI MATERIALS V0.10 ===


class MaterialCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: str = Field(default="", max_length=100)
    series: str = Field(default="", max_length=100)
    category: str = Field(default="Folia ploterowa", max_length=100)
    color_name: str = Field(default="", max_length=150)
    color_code: str = Field(default="", max_length=100)
    width_cm: Decimal = Field(gt=0, le=500)
    roll_length_m: Decimal = Field(gt=0, le=10000)
    purchase_price: Decimal = Field(default=Decimal("0"), ge=0)
    stock_length_m: Decimal = Field(default=Decimal("0"), ge=0)
    low_stock_threshold_m: Decimal = Field(default=Decimal("5"), ge=0)
    supplier: str = Field(default="", max_length=200)
    notes: str | None = Field(default=None, max_length=5000)


class MaterialUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=100)
    series: str | None = Field(default=None, max_length=100)
    category: str | None = Field(default=None, max_length=100)
    color_name: str | None = Field(default=None, max_length=150)
    color_code: str | None = Field(default=None, max_length=100)
    width_cm: Decimal | None = Field(default=None, gt=0, le=500)
    roll_length_m: Decimal | None = Field(default=None, gt=0, le=10000)
    purchase_price: Decimal | None = Field(default=None, ge=0)
    stock_length_m: Decimal | None = Field(default=None, ge=0)
    low_stock_threshold_m: Decimal | None = Field(default=None, ge=0)
    supplier: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=5000)


@app.on_event("startup")
def startup_materials():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS materials (
                    id BIGSERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    brand TEXT NOT NULL DEFAULT '',
                    series TEXT NOT NULL DEFAULT '',
                    category TEXT NOT NULL DEFAULT 'Folia ploterowa',
                    color_name TEXT NOT NULL DEFAULT '',
                    color_code TEXT NOT NULL DEFAULT '',
                    width_cm NUMERIC(10, 2) NOT NULL CHECK (width_cm > 0),
                    roll_length_m NUMERIC(12, 2) NOT NULL CHECK (roll_length_m > 0),
                    purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0
                        CHECK (purchase_price >= 0),
                    stock_length_m NUMERIC(12, 2) NOT NULL DEFAULT 0
                        CHECK (stock_length_m >= 0),
                    low_stock_threshold_m NUMERIC(12, 2) NOT NULL DEFAULT 5
                        CHECK (low_stock_threshold_m >= 0),
                    supplier TEXT NOT NULL DEFAULT '',
                    notes TEXT,
                    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS materials_active_index
                ON materials (is_archived, category, brand, series)
                """
            )

        conn.commit()


def _material_result(row: dict) -> dict:
    result = dict(row)

    width_cm = Decimal(str(result.get("width_cm") or 0))
    roll_length_m = Decimal(str(result.get("roll_length_m") or 0))
    purchase_price = Decimal(str(result.get("purchase_price") or 0))
    stock_length_m = Decimal(str(result.get("stock_length_m") or 0))
    threshold = Decimal(
        str(result.get("low_stock_threshold_m") or 0)
    )

    width_m = width_cm / Decimal("100")
    roll_area = width_m * roll_length_m
    stock_area = width_m * stock_length_m

    cost_per_m2 = (
        purchase_price / roll_area
        if roll_area > 0
        else Decimal("0")
    )

    stock_value = cost_per_m2 * stock_area

    result["width_cm"] = float(width_cm)
    result["roll_length_m"] = float(roll_length_m)
    result["purchase_price"] = float(purchase_price)
    result["stock_length_m"] = float(stock_length_m)
    result["low_stock_threshold_m"] = float(threshold)
    result["roll_area_m2"] = round(float(roll_area), 3)
    result["stock_area_m2"] = round(float(stock_area), 3)
    result["cost_per_m2"] = round(float(cost_per_m2), 4)
    result["estimated_stock_value"] = round(float(stock_value), 2)
    result["is_low_stock"] = stock_length_m <= threshold

    return result


def _get_material_or_404(cur, material_id: int) -> dict:
    cur.execute(
        """
        SELECT *
        FROM materials
        WHERE id = %s
        """,
        (material_id,),
    )

    material = cur.fetchone()

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono materiału",
        )

    return material


@app.get("/materials")
def list_materials(
    search: str | None = Query(default=None, max_length=200),
    archived: bool = False,
    user: dict = Depends(get_current_user),
):
    conditions = ["is_archived = %s"]
    params: list[object] = [archived]

    if search and search.strip():
        phrase = f"%{search.strip()}%"

        conditions.append(
            """
            (
                name ILIKE %s
                OR brand ILIKE %s
                OR series ILIKE %s
                OR category ILIKE %s
                OR color_name ILIKE %s
                OR color_code ILIKE %s
                OR supplier ILIKE %s
            )
            """
        )

        params.extend(
            [
                phrase,
                phrase,
                phrase,
                phrase,
                phrase,
                phrase,
                phrase,
            ]
        )

    query = f"""
        SELECT *
        FROM materials
        WHERE {" AND ".join(conditions)}
        ORDER BY
            category ASC,
            brand ASC,
            series ASC,
            color_name ASC,
            name ASC
    """

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()

    return [_material_result(row) for row in rows]


@app.get("/materials/stats")
def material_stats(
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM materials
                WHERE is_archived = FALSE
                """
            )

            rows = cur.fetchall()

    materials = [_material_result(row) for row in rows]

    return {
        "total_materials": len(materials),
        "low_stock": sum(
            1 for item in materials
            if item["is_low_stock"]
        ),
        "stock_area_m2": round(
            sum(item["stock_area_m2"] for item in materials),
            2,
        ),
        "estimated_stock_value": round(
            sum(
                item["estimated_stock_value"]
                for item in materials
            ),
            2,
        ),
    }


@app.get("/materials/{material_id}")
def get_material(
    material_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            material = _get_material_or_404(
                cur,
                material_id,
            )

    return _material_result(material)


@app.post(
    "/materials",
    status_code=status.HTTP_201_CREATED,
)
def create_material(
    data: MaterialCreate,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO materials (
                    name,
                    brand,
                    series,
                    category,
                    color_name,
                    color_code,
                    width_cm,
                    roll_length_m,
                    purchase_price,
                    stock_length_m,
                    low_stock_threshold_m,
                    supplier,
                    notes
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s
                )
                RETURNING *
                """,
                (
                    data.name.strip(),
                    data.brand.strip(),
                    data.series.strip(),
                    data.category.strip(),
                    data.color_name.strip(),
                    data.color_code.strip(),
                    data.width_cm,
                    data.roll_length_m,
                    data.purchase_price,
                    data.stock_length_m,
                    data.low_stock_threshold_m,
                    data.supplier.strip(),
                    data.notes.strip()
                    if data.notes
                    else None,
                ),
            )

            material = cur.fetchone()

        conn.commit()

    return _material_result(material)


@app.patch("/materials/{material_id}")
def update_material(
    material_id: int,
    data: MaterialUpdate,
    user: dict = Depends(get_current_user),
):
    values = data.model_dump(exclude_unset=True)

    if not values:
        raise HTTPException(
            status_code=400,
            detail="Brak danych do zapisania",
        )

    allowed_columns = {
        "name",
        "brand",
        "series",
        "category",
        "color_name",
        "color_code",
        "width_cm",
        "roll_length_m",
        "purchase_price",
        "stock_length_m",
        "low_stock_threshold_m",
        "supplier",
        "notes",
    }

    assignments: list[str] = []
    params: list[object] = []

    for field, value in values.items():
        if field not in allowed_columns:
            continue

        if isinstance(value, str):
            value = value.strip()

        assignments.append(f"{field} = %s")
        params.append(value)

    if not assignments:
        raise HTTPException(
            status_code=400,
            detail="Brak danych do zapisania",
        )

    assignments.append("updated_at = NOW()")
    params.append(material_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_material_or_404(
                cur,
                material_id,
            )

            cur.execute(
                f"""
                UPDATE materials
                SET {", ".join(assignments)}
                WHERE id = %s
                RETURNING *
                """,
                params,
            )

            material = cur.fetchone()

        conn.commit()

    return _material_result(material)


@app.post("/materials/{material_id}/archive")
def archive_material(
    material_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_material_or_404(
                cur,
                material_id,
            )

            cur.execute(
                """
                UPDATE materials
                SET
                    is_archived = TRUE,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (material_id,),
            )

            material = cur.fetchone()

        conn.commit()

    return _material_result(material)


@app.post("/materials/{material_id}/restore")
def restore_material(
    material_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_material_or_404(
                cur,
                material_id,
            )

            cur.execute(
                """
                UPDATE materials
                SET
                    is_archived = FALSE,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (material_id,),
            )

            material = cur.fetchone()

        conn.commit()

    return _material_result(material)


# === YOKAI COST CALCULATOR V0.11 ===

from psycopg.types.json import Jsonb as _CalcJsonb


class CalculationMaterialLine(BaseModel):
    material_id: int = Field(gt=0)
    layers: Decimal = Field(default=Decimal("1"), gt=0, le=100)


class CalculationCreate(BaseModel):
    order_id: int | None = Field(default=None, gt=0)
    name: str = Field(min_length=1, max_length=200)
    width_cm: Decimal = Field(gt=0, le=10000)
    height_cm: Decimal = Field(gt=0, le=10000)
    quantity: int = Field(default=1, ge=1, le=1000000)
    waste_percent: Decimal = Field(default=Decimal("15"), ge=0, le=500)
    labor_minutes: Decimal = Field(default=Decimal("0"), ge=0, le=100000)
    hourly_rate: Decimal = Field(default=Decimal("50"), ge=0, le=100000)
    margin_percent: Decimal = Field(default=Decimal("40"), ge=0, lt=100)
    materials: list[CalculationMaterialLine] = Field(min_length=1)
    deduct_stock: bool = False
    update_order_price: bool = False
    notes: str | None = Field(default=None, max_length=5000)


def _ensure_calculator_schema(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS calculations (
            id BIGSERIAL PRIMARY KEY,
            calculation_number TEXT UNIQUE,
            order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            width_cm NUMERIC(12,3) NOT NULL,
            height_cm NUMERIC(12,3) NOT NULL,
            quantity INTEGER NOT NULL,
            waste_percent NUMERIC(8,3) NOT NULL,
            labor_minutes NUMERIC(12,2) NOT NULL,
            hourly_rate NUMERIC(12,2) NOT NULL,
            margin_percent NUMERIC(8,3) NOT NULL,
            base_area_m2 NUMERIC(16,6) NOT NULL,
            material_cost NUMERIC(14,2) NOT NULL,
            labor_cost NUMERIC(14,2) NOT NULL,
            total_cost NUMERIC(14,2) NOT NULL,
            suggested_price NUMERIC(14,2) NOT NULL,
            profit NUMERIC(14,2) NOT NULL,
            material_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
            stock_deducted BOOLEAN NOT NULL DEFAULT FALSE,
            order_price_updated BOOLEAN NOT NULL DEFAULT FALSE,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )


def _calc_decimal(value: object) -> Decimal:
    return Decimal(str(value or 0))


def _calc_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"))


def _calculation_result(row: dict) -> dict:
    result = dict(row)
    for field in (
        "width_cm", "height_cm", "waste_percent", "labor_minutes",
        "hourly_rate", "margin_percent", "base_area_m2",
        "material_cost", "labor_cost", "total_cost",
        "suggested_price", "profit",
    ):
        result[field] = float(_calc_decimal(result.get(field)))
    return result


def _calculate_order_cost(cur, data: CalculationCreate) -> dict:
    base_area = (
        data.width_cm / Decimal("100")
        * data.height_cm / Decimal("100")
        * Decimal(data.quantity)
    )
    waste_factor = Decimal("1") + data.waste_percent / Decimal("100")
    material_ids = [line.material_id for line in data.materials]

    cur.execute(
        """
        SELECT *
        FROM materials
        WHERE id = ANY(%s) AND is_archived = FALSE
        """,
        (material_ids,),
    )
    rows = {int(row["id"]): row for row in cur.fetchall()}

    missing = sorted(set(material_ids) - set(rows))
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Brak aktywnych materiałów: " + ", ".join(map(str, missing)),
        )

    material_cost = Decimal("0")
    deductions: dict[int, Decimal] = {}
    breakdown: list[dict] = []

    for line in data.materials:
        material = rows[line.material_id]
        roll_width_m = _calc_decimal(material["width_cm"]) / Decimal("100")
        roll_length_m = _calc_decimal(material["roll_length_m"])
        purchase_price = _calc_decimal(material["purchase_price"])
        available_m = _calc_decimal(material["stock_length_m"])

        if roll_width_m <= 0 or roll_length_m <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"Nieprawidłowy rozmiar rolki: {material['name']}",
            )

        cost_per_m2 = purchase_price / (roll_width_m * roll_length_m)
        used_area = base_area * line.layers * waste_factor
        used_length = used_area / roll_width_m
        line_cost = used_area * cost_per_m2

        material_cost += line_cost
        deductions[line.material_id] = (
            deductions.get(line.material_id, Decimal("0")) + used_length
        )
        breakdown.append(
            {
                "material_id": int(material["id"]),
                "name": material["name"],
                "color_name": material["color_name"],
                "color_code": material["color_code"],
                "layers": float(line.layers),
                "used_area_m2": round(float(used_area), 6),
                "used_length_m": round(float(used_length), 4),
                "cost_per_m2": round(float(cost_per_m2), 4),
                "cost": round(float(line_cost), 2),
                "stock_before_m": float(available_m),
            }
        )

    if data.deduct_stock:
        for material_id, required_m in deductions.items():
            available_m = _calc_decimal(rows[material_id]["stock_length_m"])
            if required_m > available_m:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Za mało materiału: {rows[material_id]['name']}. "
                        f"Potrzeba {required_m.quantize(Decimal('0.01'))} m, "
                        f"dostępne {available_m.quantize(Decimal('0.01'))} m."
                    ),
                )

    labor_cost = data.labor_minutes / Decimal("60") * data.hourly_rate
    total_cost = material_cost + labor_cost
    suggested_price = total_cost / (
        Decimal("1") - data.margin_percent / Decimal("100")
    )
    profit = suggested_price - total_cost

    return {
        "base_area": base_area,
        "material_cost": _calc_money(material_cost),
        "labor_cost": _calc_money(labor_cost),
        "total_cost": _calc_money(total_cost),
        "suggested_price": _calc_money(suggested_price),
        "profit": _calc_money(profit),
        "breakdown": breakdown,
        "deductions": deductions,
    }


@app.get("/calculations")
def list_calculations(
    limit: int = Query(default=30, ge=1, le=500),
    order_id: int | None = Query(default=None, gt=0),
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_calculator_schema(cur)
            if order_id:
                cur.execute(
                    """
                    SELECT c.*, o.order_number, o.client_name
                    FROM calculations c
                    LEFT JOIN orders o ON o.id = c.order_id
                    WHERE c.order_id = %s
                    ORDER BY c.created_at DESC
                    LIMIT %s
                    """,
                    (order_id, limit),
                )
            else:
                cur.execute(
                    """
                    SELECT c.*, o.order_number, o.client_name
                    FROM calculations c
                    LEFT JOIN orders o ON o.id = c.order_id
                    ORDER BY c.created_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
            rows = cur.fetchall()
        conn.commit()
    return [_calculation_result(row) for row in rows]


@app.post("/calculations", status_code=status.HTTP_201_CREATED)
def create_calculation(
    data: CalculationCreate,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_calculator_schema(cur)

            if data.order_id:
                cur.execute(
                    "SELECT id FROM orders WHERE id = %s AND is_archived = FALSE",
                    (data.order_id,),
                )
                if cur.fetchone() is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Nie znaleziono aktywnego zamówienia",
                    )

            totals = _calculate_order_cost(cur, data)

            if data.deduct_stock:
                for material_id, used_length in totals["deductions"].items():
                    cur.execute(
                        """
                        UPDATE materials
                        SET stock_length_m = stock_length_m - %s,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (used_length, material_id),
                    )

            cur.execute(
                """
                INSERT INTO calculations (
                    order_id, name, width_cm, height_cm, quantity,
                    waste_percent, labor_minutes, hourly_rate, margin_percent,
                    base_area_m2, material_cost, labor_cost, total_cost,
                    suggested_price, profit, material_breakdown,
                    stock_deducted, order_price_updated, notes
                )
                VALUES (
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s
                )
                RETURNING id
                """,
                (
                    data.order_id, data.name.strip(), data.width_cm,
                    data.height_cm, data.quantity, data.waste_percent,
                    data.labor_minutes, data.hourly_rate, data.margin_percent,
                    totals["base_area"], totals["material_cost"],
                    totals["labor_cost"], totals["total_cost"],
                    totals["suggested_price"], totals["profit"],
                    _CalcJsonb(totals["breakdown"]), data.deduct_stock,
                    data.update_order_price, data.notes.strip() if data.notes else None,
                ),
            )
            calculation_id = cur.fetchone()["id"]
            calculation_number = f"YK-C-{calculation_id:05d}"

            cur.execute(
                "UPDATE calculations SET calculation_number = %s WHERE id = %s",
                (calculation_number, calculation_id),
            )

            if data.order_id and data.update_order_price:
                cur.execute(
                    "UPDATE orders SET price = %s, updated_at = NOW() WHERE id = %s",
                    (totals["suggested_price"], data.order_id),
                )

            cur.execute(
                """
                SELECT c.*, o.order_number, o.client_name
                FROM calculations c
                LEFT JOIN orders o ON o.id = c.order_id
                WHERE c.id = %s
                """,
                (calculation_id,),
            )
            result = cur.fetchone()
        conn.commit()

    return _calculation_result(result)


# === YOKAI CALCULATOR EDIT DELETE RESTORE V0.12 ===


def _ensure_calculator_v012_schema(cur) -> None:
    _ensure_calculator_schema(cur)

    cur.execute(
        """
        ALTER TABLE calculations
        ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE
        """
    )

    cur.execute(
        """
        ALTER TABLE calculations
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ
        """
    )

    cur.execute(
        """
        ALTER TABLE calculations
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS calculations_deleted_index
        ON calculations (is_deleted, created_at DESC)
        """
    )


def _get_calculation_v012(cur, calculation_id: int, lock: bool = False) -> dict:
    suffix = " FOR UPDATE" if lock else ""

    cur.execute(
        f"""
        SELECT *
        FROM calculations
        WHERE id = %s
        {suffix}
        """,
        (calculation_id,),
    )

    row = cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono kalkulacji",
        )

    return row


def _restore_previous_calculation_stock(cur, calculation: dict) -> None:
    if not calculation.get("stock_deducted"):
        return

    for item in calculation.get("material_breakdown") or []:
        try:
            material_id = int(item.get("material_id") or 0)
            used_length = _calc_decimal(item.get("used_length_m"))
        except (TypeError, ValueError):
            continue

        if material_id <= 0 or used_length <= 0:
            continue

        cur.execute(
            """
            UPDATE materials
            SET
                stock_length_m = stock_length_m + %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (used_length, material_id),
        )


@app.get("/calculations/manage")
def manage_calculations(
    deleted: bool = False,
    limit: int = Query(default=30, ge=1, le=500),
    order_id: int | None = Query(default=None, gt=0),
    user: dict = Depends(get_current_user),
):
    conditions = ["c.is_deleted = %s"]
    params: list[object] = [deleted]

    if order_id is not None:
        conditions.append("c.order_id = %s")
        params.append(order_id)

    params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_calculator_v012_schema(cur)

            cur.execute(
                f"""
                SELECT
                    c.*,
                    o.order_number,
                    o.client_name
                FROM calculations c
                LEFT JOIN orders o
                    ON o.id = c.order_id
                WHERE {" AND ".join(conditions)}
                ORDER BY c.created_at DESC
                LIMIT %s
                """,
                params,
            )

            rows = cur.fetchall()

        conn.commit()

    return [
        _calculation_result(row)
        for row in rows
    ]


@app.patch("/calculations/{calculation_id}")
def update_calculation_v012(
    calculation_id: int,
    data: CalculationCreate,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_calculator_v012_schema(cur)

            existing = _get_calculation_v012(
                cur,
                calculation_id,
                lock=True,
            )

            if existing.get("is_deleted"):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Przywróć kalkulację przed jej edycją"
                    ),
                )

            if data.order_id:
                cur.execute(
                    """
                    SELECT id
                    FROM orders
                    WHERE id = %s
                      AND is_archived = FALSE
                    """,
                    (data.order_id,),
                )

                if cur.fetchone() is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Nie znaleziono aktywnego zamówienia",
                    )

            # Najpierw cofamy poprzednie zużycie. Jeżeli nowa kalkulacja
            # nie przejdzie walidacji, transakcja wycofa także to cofnięcie.
            _restore_previous_calculation_stock(
                cur,
                existing,
            )

            totals = _calculate_order_cost(
                cur,
                data,
            )

            if data.deduct_stock:
                for material_id, used_length in totals["deductions"].items():
                    cur.execute(
                        """
                        UPDATE materials
                        SET
                            stock_length_m = stock_length_m - %s,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (used_length, material_id),
                    )

            cur.execute(
                """
                UPDATE calculations
                SET
                    order_id = %s,
                    name = %s,
                    width_cm = %s,
                    height_cm = %s,
                    quantity = %s,
                    waste_percent = %s,
                    labor_minutes = %s,
                    hourly_rate = %s,
                    margin_percent = %s,
                    base_area_m2 = %s,
                    material_cost = %s,
                    labor_cost = %s,
                    total_cost = %s,
                    suggested_price = %s,
                    profit = %s,
                    material_breakdown = %s,
                    stock_deducted = %s,
                    order_price_updated = %s,
                    notes = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    data.order_id,
                    data.name.strip(),
                    data.width_cm,
                    data.height_cm,
                    data.quantity,
                    data.waste_percent,
                    data.labor_minutes,
                    data.hourly_rate,
                    data.margin_percent,
                    totals["base_area"],
                    totals["material_cost"],
                    totals["labor_cost"],
                    totals["total_cost"],
                    totals["suggested_price"],
                    totals["profit"],
                    _CalcJsonb(totals["breakdown"]),
                    data.deduct_stock,
                    data.update_order_price,
                    data.notes.strip() if data.notes else None,
                    calculation_id,
                ),
            )

            if data.order_id and data.update_order_price:
                cur.execute(
                    """
                    UPDATE orders
                    SET
                        price = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        totals["suggested_price"],
                        data.order_id,
                    ),
                )

            cur.execute(
                """
                SELECT
                    c.*,
                    o.order_number,
                    o.client_name
                FROM calculations c
                LEFT JOIN orders o
                    ON o.id = c.order_id
                WHERE c.id = %s
                """,
                (calculation_id,),
            )

            result = cur.fetchone()

        conn.commit()

    return _calculation_result(result)


@app.post("/calculations/{calculation_id}/delete")
def soft_delete_calculation_v012(
    calculation_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_calculator_v012_schema(cur)
            _get_calculation_v012(cur, calculation_id)

            cur.execute(
                """
                UPDATE calculations
                SET
                    is_deleted = TRUE,
                    deleted_at = NOW(),
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (calculation_id,),
            )

            result = cur.fetchone()

        conn.commit()

    return _calculation_result(result)


@app.post("/calculations/{calculation_id}/restore")
def restore_calculation_v012(
    calculation_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_calculator_v012_schema(cur)
            _get_calculation_v012(cur, calculation_id)

            cur.execute(
                """
                UPDATE calculations
                SET
                    is_deleted = FALSE,
                    deleted_at = NULL,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (calculation_id,),
            )

            result = cur.fetchone()

        conn.commit()

    return _calculation_result(result)

# === YOKAI ORDER FROM CALCULATOR V0.13 ===


def _format_calculation_dimension(value: object) -> str:
    number = Decimal(str(value or 0))

    if number == number.to_integral():
        return str(int(number))

    return format(number.normalize(), "f")


@app.post(
    "/calculations/actions/create-order",
    status_code=status.HTTP_201_CREATED,
)
def create_order_from_calculator(
    data: CalculationCreate,
    user: dict = Depends(get_current_user),
):
    if data.order_id is not None:
        with get_connection() as conn:
            with conn.cursor() as cur:
                order = get_order_or_404(
                    cur,
                    data.order_id,
                )

        return {
            "order": order,
            "calculation": None,
            "created": False,
        }

    calculation_data = data.model_copy(
        update={
            "order_id": None,
            "update_order_price": False,
        }
    )

    calculation = create_calculation(
        calculation_data,
        user,
    )

    size = (
        f"{_format_calculation_dimension(data.width_cm)}"
        f" × "
        f"{_format_calculation_dimension(data.height_cm)} cm"
    )

    calculation_note = (
        f"Utworzono z kalkulacji "
        f"{calculation['calculation_number']}."
    )

    if data.notes and data.notes.strip():
        calculation_note += (
            "\n\nUwagi z kalkulacji:\n"
            + data.notes.strip()
        )

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO orders (
                    client_name,
                    name,
                    source,
                    size,
                    quantity,
                    price,
                    paid_amount,
                    payment_status,
                    deadline,
                    notes,
                    status
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s,
                    0, 'Nieopłacone', NULL, %s, 'Nowe'
                )
                RETURNING id
                """,
                (
                    "Do uzupełnienia",
                    data.name.strip(),
                    "Kalkulator",
                    size,
                    data.quantity,
                    calculation["suggested_price"],
                    calculation_note,
                ),
            )

            order_id = cur.fetchone()["id"]
            order_number = f"YK-{order_id:05d}"

            cur.execute(
                """
                UPDATE orders
                SET
                    order_number = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    order_number,
                    order_id,
                ),
            )

            cur.execute(
                """
                UPDATE calculations
                SET
                    order_id = %s,
                    order_price_updated = TRUE,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    order_id,
                    calculation["id"],
                ),
            )

            order = get_order_or_404(
                cur,
                order_id,
            )

        conn.commit()

    return {
        "order": order,
        "calculation": {
            **calculation,
            "order_id": order_id,
            "order_number": order_number,
            "order_price_updated": True,
        },
        "created": True,
    }
