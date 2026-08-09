import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

import bcrypt
import jwt
import psycopg
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile, status
from psycopg.rows import dict_row
from fastapi.responses import FileResponse
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

app = FastAPI(title="YOKAI OS API", version="0.26.0")


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
        "version": "0.26.0",
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
                "User-Agent": "YOKAI-OS/0.26",
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
            "User-Agent": "YOKAI-OS/0.26",
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
            "User-Agent": "YOKAI-OS/0.26",
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

# === YOKAI SVG LIBRARY V0.14 ===

import hashlib as _svg_hashlib
import re as _svg_re
import uuid as _svg_uuid
import xml.etree.ElementTree as _svg_etree
from pathlib import Path as _SvgPath

from psycopg.types.json import Jsonb as _SvgJsonb


SVG_STORAGE_DIR = _SvgPath(
    os.environ.get("SVG_STORAGE_DIR", "/srv/yokai-data/svg")
)
SVG_MAX_FILE_SIZE = 10 * 1024 * 1024


class SvgAssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=250)
    category: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = None
    client_name: str | None = Field(default=None, max_length=200)
    order_id: int | None = Field(default=None, gt=0)
    version_label: str | None = Field(default=None, max_length=50)
    notes: str | None = Field(default=None, max_length=5000)


def _ensure_svg_storage() -> None:
    SVG_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _svg_local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _validate_svg(content: bytes) -> dict:
    if not content:
        raise HTTPException(status_code=400, detail="Plik SVG jest pusty")

    if len(content) > SVG_MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Plik SVG może mieć maksymalnie 10 MB",
        )

    try:
        root = _svg_etree.fromstring(content)
    except _svg_etree.ParseError as exc:
        raise HTTPException(
            status_code=400,
            detail="Plik nie jest prawidłowym SVG",
        ) from exc

    if _svg_local_name(root.tag) != "svg":
        raise HTTPException(
            status_code=400,
            detail="Główny element musi być znacznikiem SVG",
        )

    blocked_prefixes = (
        "javascript:",
        "http://",
        "https://",
        "//",
        "data:text/html",
    )

    for element in root.iter():
        if _svg_local_name(element.tag) == "script":
            raise HTTPException(
                status_code=400,
                detail="SVG zawiera niedozwolony skrypt",
            )

        for attribute, value in element.attrib.items():
            attribute_name = _svg_local_name(attribute)
            text_value = str(value).strip().lower()

            if attribute_name.startswith("on"):
                raise HTTPException(
                    status_code=400,
                    detail="SVG zawiera niedozwolone zdarzenia",
                )

            if attribute_name in {"href", "src"} and text_value.startswith(
                blocked_prefixes
            ):
                raise HTTPException(
                    status_code=400,
                    detail="SVG zawiera zewnętrzne odwołania",
                )

    return {
        "svg_width": str(root.attrib.get("width") or "").strip() or None,
        "svg_height": str(root.attrib.get("height") or "").strip() or None,
        "view_box": str(
            root.attrib.get("viewBox")
            or root.attrib.get("viewbox")
            or ""
        ).strip()
        or None,
    }


def _clean_svg_tags(tags: list[str] | str | None) -> list[str]:
    if tags is None:
        return []

    values = tags.split(",") if isinstance(tags, str) else tags
    result: list[str] = []
    seen: set[str] = set()

    for value in values:
        cleaned = str(value).strip()

        if not cleaned:
            continue

        normalized = cleaned.casefold()

        if normalized in seen:
            continue

        seen.add(normalized)
        result.append(cleaned[:80])

    return result[:30]


def _svg_result(row: dict) -> dict:
    result = dict(row)
    result["file_size"] = int(result.get("file_size") or 0)
    result["tags"] = list(result.get("tags") or [])
    return result


def _get_svg_or_404(cur, asset_id: int) -> dict:
    cur.execute(
        """
        SELECT
            a.*,
            o.order_number,
            o.name AS order_name
        FROM svg_assets a
        LEFT JOIN orders o ON o.id = a.order_id
        WHERE a.id = %s
        """,
        (asset_id,),
    )

    asset = cur.fetchone()

    if asset is None:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono projektu SVG",
        )

    return asset


@app.on_event("startup")
def startup_svg_library():
    _ensure_svg_storage()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS svg_assets (
                    id BIGSERIAL PRIMARY KEY,
                    asset_number TEXT UNIQUE,
                    name TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    stored_filename TEXT UNIQUE NOT NULL,
                    file_path TEXT UNIQUE NOT NULL,
                    file_size BIGINT NOT NULL DEFAULT 0,
                    sha256 TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'Grafika',
                    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
                    client_name TEXT NOT NULL DEFAULT '',
                    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
                    version_label TEXT NOT NULL DEFAULT 'v1',
                    svg_width TEXT,
                    svg_height TEXT,
                    view_box TEXT,
                    notes TEXT,
                    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS svg_assets_active_index
                ON svg_assets (is_archived, category, created_at DESC)
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS svg_assets_order_index
                ON svg_assets (order_id, created_at DESC)
                """
            )

        conn.commit()


@app.get("/svg-assets/stats")
def svg_asset_stats(user: dict = Depends(get_current_user)):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                    ) AS active,
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                        AND order_id IS NOT NULL
                    ) AS assigned,
                    COUNT(DISTINCT category) FILTER (
                        WHERE is_archived = FALSE
                    ) AS categories,
                    COALESCE(
                        SUM(file_size) FILTER (
                            WHERE is_archived = FALSE
                        ),
                        0
                    ) AS total_size
                FROM svg_assets
                """
            )
            row = cur.fetchone()

    return {
        "active": int(row["active"] or 0),
        "assigned": int(row["assigned"] or 0),
        "categories": int(row["categories"] or 0),
        "total_size": int(row["total_size"] or 0),
    }


@app.get("/svg-assets")
def list_svg_assets(
    search: str | None = Query(default=None, max_length=200),
    archived: bool = False,
    limit: int = Query(default=500, ge=1, le=1000),
    user: dict = Depends(get_current_user),
):
    conditions = ["a.is_archived = %s"]
    params: list[object] = [archived]

    if search and search.strip():
        phrase = f"%{search.strip()}%"

        conditions.append(
            """
            (
                a.asset_number ILIKE %s
                OR a.name ILIKE %s
                OR a.original_filename ILIKE %s
                OR a.category ILIKE %s
                OR a.client_name ILIKE %s
                OR a.version_label ILIKE %s
                OR COALESCE(o.order_number, '') ILIKE %s
                OR EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(a.tags) AS tag
                    WHERE tag ILIKE %s
                )
            )
            """
        )

        params.extend([phrase] * 8)

    params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    a.*,
                    o.order_number,
                    o.name AS order_name
                FROM svg_assets a
                LEFT JOIN orders o ON o.id = a.order_id
                WHERE {" AND ".join(conditions)}
                ORDER BY a.created_at DESC
                LIMIT %s
                """,
                params,
            )
            rows = cur.fetchall()

    return [_svg_result(row) for row in rows]


@app.post("/svg-assets", status_code=status.HTTP_201_CREATED)
async def create_svg_asset(
    file: UploadFile = File(...),
    name: str = Form(...),
    category: str = Form(default="Grafika"),
    tags: str = Form(default=""),
    client_name: str = Form(default=""),
    order_id: int | None = Form(default=None),
    version_label: str = Form(default="v1"),
    notes: str = Form(default=""),
    user: dict = Depends(get_current_user),
):
    original_filename = (file.filename or "projekt.svg").strip()

    if not original_filename.lower().endswith(".svg"):
        raise HTTPException(
            status_code=400,
            detail="Do biblioteki można dodać tylko pliki SVG",
        )

    content = await file.read()
    dimensions = _validate_svg(content)
    digest = _svg_hashlib.sha256(content).hexdigest()

    if order_id is not None:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM orders WHERE id = %s",
                    (order_id,),
                )

                if cur.fetchone() is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Nie znaleziono zamówienia",
                    )

    _ensure_svg_storage()
    stored_filename = f"{_svg_uuid.uuid4().hex}.svg"
    file_path = SVG_STORAGE_DIR / stored_filename

    try:
        file_path.write_bytes(content)

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO svg_assets (
                        name,
                        original_filename,
                        stored_filename,
                        file_path,
                        file_size,
                        sha256,
                        category,
                        tags,
                        client_name,
                        order_id,
                        version_label,
                        svg_width,
                        svg_height,
                        view_box,
                        notes
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    RETURNING id
                    """,
                    (
                        name.strip(),
                        original_filename,
                        stored_filename,
                        str(file_path),
                        len(content),
                        digest,
                        category.strip() or "Grafika",
                        _SvgJsonb(_clean_svg_tags(tags)),
                        client_name.strip(),
                        order_id,
                        version_label.strip() or "v1",
                        dimensions["svg_width"],
                        dimensions["svg_height"],
                        dimensions["view_box"],
                        notes.strip() or None,
                    ),
                )

                asset_id = cur.fetchone()["id"]
                asset_number = f"SVG-{asset_id:05d}"

                cur.execute(
                    """
                    UPDATE svg_assets
                    SET asset_number = %s
                    WHERE id = %s
                    """,
                    (asset_number, asset_id),
                )

                asset = _get_svg_or_404(cur, asset_id)

            conn.commit()

    except Exception:
        if file_path.exists():
            file_path.unlink()
        raise

    return _svg_result(asset)


@app.get("/svg-assets/{asset_id}")
def get_svg_asset(
    asset_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            asset = _get_svg_or_404(cur, asset_id)

    return _svg_result(asset)


@app.get("/svg-assets/{asset_id}/file")
def get_svg_asset_file(
    asset_id: int,
    download: bool = False,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            asset = _get_svg_or_404(cur, asset_id)

    file_path = _SvgPath(asset["file_path"])

    if not file_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Plik SVG nie istnieje na dysku",
        )

    safe_filename = _svg_re.sub(
        r"[^A-Za-z0-9._-]+",
        "_",
        asset["original_filename"],
    )

    return FileResponse(
        path=str(file_path),
        media_type="image/svg+xml",
        filename=safe_filename,
        content_disposition_type=(
            "attachment" if download else "inline"
        ),
    )


@app.patch("/svg-assets/{asset_id}")
def update_svg_asset(
    asset_id: int,
    data: SvgAssetUpdate,
    user: dict = Depends(get_current_user),
):
    values = data.model_dump(exclude_unset=True)

    if not values:
        raise HTTPException(
            status_code=400,
            detail="Brak danych do zapisania",
        )

    if values.get("order_id") is not None:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM orders WHERE id = %s",
                    (values["order_id"],),
                )

                if cur.fetchone() is None:
                    raise HTTPException(
                        status_code=400,
                        detail="Nie znaleziono zamówienia",
                    )

    allowed = {
        "name",
        "category",
        "tags",
        "client_name",
        "order_id",
        "version_label",
        "notes",
    }

    assignments: list[str] = []
    params: list[object] = []

    for field, value in values.items():
        if field not in allowed:
            continue

        if field == "tags":
            value = _SvgJsonb(_clean_svg_tags(value))
        elif isinstance(value, str):
            value = value.strip()

        assignments.append(f"{field} = %s")
        params.append(value)

    assignments.append("updated_at = NOW()")
    params.append(asset_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_svg_or_404(cur, asset_id)

            cur.execute(
                f"""
                UPDATE svg_assets
                SET {", ".join(assignments)}
                WHERE id = %s
                """,
                params,
            )

            asset = _get_svg_or_404(cur, asset_id)

        conn.commit()

    return _svg_result(asset)


@app.post("/svg-assets/{asset_id}/archive")
def archive_svg_asset(
    asset_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_svg_or_404(cur, asset_id)

            cur.execute(
                """
                UPDATE svg_assets
                SET is_archived = TRUE, updated_at = NOW()
                WHERE id = %s
                """,
                (asset_id,),
            )

            asset = _get_svg_or_404(cur, asset_id)

        conn.commit()

    return _svg_result(asset)


@app.post("/svg-assets/{asset_id}/restore")
def restore_svg_asset(
    asset_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_svg_or_404(cur, asset_id)

            cur.execute(
                """
                UPDATE svg_assets
                SET is_archived = FALSE, updated_at = NOW()
                WHERE id = %s
                """,
                (asset_id,),
            )

            asset = _get_svg_or_404(cur, asset_id)

        conn.commit()

    return _svg_result(asset)

# === YOKAI SVG ORDER LINK V0.15 ===


@app.on_event("startup")
def startup_svg_order_link():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                ALTER TABLE svg_assets
                ADD COLUMN IF NOT EXISTS is_production_ready
                BOOLEAN NOT NULL DEFAULT FALSE
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS
                svg_assets_production_ready_index
                ON svg_assets (
                    order_id,
                    is_production_ready
                )
                WHERE is_archived = FALSE
                """
            )

        conn.commit()


@app.get("/orders/{order_id}/svg-assets")
def get_order_svg_assets(
    order_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            get_order_or_404(cur, order_id)

            cur.execute(
                """
                SELECT
                    a.*,
                    o.order_number,
                    o.name AS order_name
                FROM svg_assets a
                LEFT JOIN orders o
                    ON o.id = a.order_id
                WHERE a.order_id = %s
                  AND a.is_archived = FALSE
                ORDER BY
                    a.is_production_ready DESC,
                    a.created_at DESC
                """,
                (order_id,),
            )

            rows = cur.fetchall()

    return [_svg_result(row) for row in rows]


@app.get("/orders/{order_id}/svg-summary")
def get_order_svg_summary(
    order_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            get_order_or_404(cur, order_id)

            cur.execute(
                """
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (
                        WHERE is_production_ready = TRUE
                    ) AS ready_count,
                    MAX(name) FILTER (
                        WHERE is_production_ready = TRUE
                    ) AS ready_name,
                    MAX(asset_number) FILTER (
                        WHERE is_production_ready = TRUE
                    ) AS ready_asset_number
                FROM svg_assets
                WHERE order_id = %s
                  AND is_archived = FALSE
                """,
                (order_id,),
            )

            row = cur.fetchone()

    return {
        "order_id": order_id,
        "total": int(row["total"] or 0),
        "ready_count": int(row["ready_count"] or 0),
        "has_ready": bool(row["ready_count"]),
        "ready_name": row["ready_name"],
        "ready_asset_number": row["ready_asset_number"],
    }


@app.post("/svg-assets/{asset_id}/set-production-ready")
def set_svg_production_ready(
    asset_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            asset = _get_svg_or_404(cur, asset_id)

            if asset["is_archived"]:
                raise HTTPException(
                    status_code=400,
                    detail="Nie można ustawić zarchiwizowanego projektu",
                )

            if asset["order_id"] is None:
                raise HTTPException(
                    status_code=400,
                    detail="Najpierw przypisz projekt do zamówienia",
                )

            cur.execute(
                """
                UPDATE svg_assets
                SET
                    is_production_ready = FALSE,
                    updated_at = NOW()
                WHERE order_id = %s
                  AND is_archived = FALSE
                """,
                (asset["order_id"],),
            )

            cur.execute(
                """
                UPDATE svg_assets
                SET
                    is_production_ready = TRUE,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (asset_id,),
            )

            result = _get_svg_or_404(cur, asset_id)

        conn.commit()

    return _svg_result(result)


@app.post("/svg-assets/{asset_id}/clear-production-ready")
def clear_svg_production_ready(
    asset_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_svg_or_404(cur, asset_id)

            cur.execute(
                """
                UPDATE svg_assets
                SET
                    is_production_ready = FALSE,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (asset_id,),
            )

            result = _get_svg_or_404(cur, asset_id)

        conn.commit()

    return _svg_result(result)

# === YOKAI CLIENTS AND NIP LOOKUP V0.16 ===

import json as _client_json
import re as _client_re
import urllib.error as _client_urlerror
import urllib.parse as _client_urlparse
import urllib.request as _client_urlrequest
from datetime import date as _client_date

from psycopg.types.json import Jsonb as _ClientJsonb


class ClientCreate(BaseModel):
    client_type: str = Field(default="person", max_length=20)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    company_name: str | None = Field(default=None, max_length=250)
    nip: str | None = Field(default=None, max_length=20)
    regon: str | None = Field(default=None, max_length=30)
    krs: str | None = Field(default=None, max_length=30)
    vat_status: str | None = Field(default=None, max_length=80)
    email: str | None = Field(default=None, max_length=250)
    phone: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=500)
    postal_code: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default="Polska", max_length=120)
    notes: str | None = Field(default=None, max_length=5000)


class ClientUpdate(BaseModel):
    client_type: str | None = Field(default=None, max_length=20)
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    company_name: str | None = Field(default=None, max_length=250)
    nip: str | None = Field(default=None, max_length=20)
    regon: str | None = Field(default=None, max_length=30)
    krs: str | None = Field(default=None, max_length=30)
    vat_status: str | None = Field(default=None, max_length=80)
    email: str | None = Field(default=None, max_length=250)
    phone: str | None = Field(default=None, max_length=80)
    address: str | None = Field(default=None, max_length=500)
    postal_code: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=5000)


class AssignClientToOrder(BaseModel):
    client_id: int = Field(gt=0)


def _clean_client_text(value: object) -> str | None:
    if value is None:
        return None

    cleaned = str(value).strip()
    return cleaned or None


def _clean_nip(value: object) -> str | None:
    cleaned = _client_re.sub(r"\D", "", str(value or ""))

    if not cleaned:
        return None

    return cleaned


def _valid_nip(nip: str) -> bool:
    if not _client_re.fullmatch(r"\d{10}", nip):
        return False

    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    checksum = sum(
        int(nip[index]) * weights[index]
        for index in range(9)
    ) % 11

    return checksum != 10 and checksum == int(nip[9])


def _client_display_name(values: dict) -> str:
    client_type = (
        values.get("client_type")
        or "person"
    ).strip().lower()

    if client_type == "company":
        company_name = _clean_client_text(
            values.get("company_name")
        )

        if not company_name:
            raise HTTPException(
                status_code=400,
                detail="Podaj nazwę firmy",
            )

        return company_name

    first_name = _clean_client_text(
        values.get("first_name")
    )
    last_name = _clean_client_text(
        values.get("last_name")
    )
    display_name = " ".join(
        value
        for value in [first_name, last_name]
        if value
    ).strip()

    if not display_name:
        raise HTTPException(
            status_code=400,
            detail="Podaj imię lub nazwisko klienta",
        )

    return display_name


def _client_result(row: dict) -> dict:
    result = dict(row)
    result["order_count"] = int(
        result.get("order_count") or 0
    )
    result["order_value"] = float(
        result.get("order_value") or 0
    )
    return result


def _get_client_or_404(cur, client_id: int) -> dict:
    cur.execute(
        """
        SELECT
            c.*,
            COUNT(o.id) AS order_count,
            COALESCE(SUM(o.price), 0) AS order_value
        FROM clients c
        LEFT JOIN orders o
            ON o.client_id = c.id
        WHERE c.id = %s
        GROUP BY c.id
        """,
        (client_id,),
    )

    client = cur.fetchone()

    if client is None:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono klienta",
        )

    return client


@app.on_event("startup")
def startup_clients_module():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS clients (
                    id BIGSERIAL PRIMARY KEY,
                    client_number TEXT UNIQUE,
                    client_type TEXT NOT NULL DEFAULT 'person',
                    first_name TEXT,
                    last_name TEXT,
                    company_name TEXT,
                    display_name TEXT NOT NULL,
                    nip TEXT UNIQUE,
                    regon TEXT,
                    krs TEXT,
                    vat_status TEXT,
                    email TEXT,
                    phone TEXT,
                    address TEXT,
                    postal_code TEXT,
                    city TEXT,
                    country TEXT NOT NULL DEFAULT 'Polska',
                    notes TEXT,
                    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )

            cur.execute(
                """
                ALTER TABLE orders
                ADD COLUMN IF NOT EXISTS client_id
                BIGINT REFERENCES clients(id)
                ON DELETE SET NULL
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS clients_active_index
                ON clients (
                    is_archived,
                    display_name
                )
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS orders_client_index
                ON orders (
                    client_id,
                    created_at DESC
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS company_lookup_cache (
                    nip TEXT NOT NULL,
                    lookup_date DATE NOT NULL,
                    payload JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (nip, lookup_date)
                )
                """
            )

        conn.commit()


@app.get("/company-lookup/nip/{nip}")
def lookup_company_by_nip(
    nip: str,
    user: dict = Depends(get_current_user),
):
    cleaned_nip = _clean_nip(nip)

    if cleaned_nip is None or not _valid_nip(cleaned_nip):
        raise HTTPException(
            status_code=400,
            detail="Podany NIP jest nieprawidłowy",
        )

    lookup_date = _client_date.today().isoformat()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT payload
                FROM company_lookup_cache
                WHERE nip = %s
                  AND lookup_date = %s
                """,
                (cleaned_nip, lookup_date),
            )

            cached = cur.fetchone()

    if cached is not None:
        payload = dict(cached["payload"])
        payload["cached"] = True
        return payload

    api_url = (
        "https://wl-api.mf.gov.pl/api/search/nip/"
        + _client_urlparse.quote(cleaned_nip)
        + "?date="
        + _client_urlparse.quote(lookup_date)
    )

    request = _client_urlrequest.Request(
        api_url,
        headers={
            "Accept": "application/json",
            "User-Agent": "YOKAI-OS/0.26",
        },
    )

    try:
        with _client_urlrequest.urlopen(
            request,
            timeout=12,
        ) as response:
            raw_data = response.read().decode("utf-8")
            api_data = _client_json.loads(raw_data)
    except _client_urlerror.HTTPError as exc:
        try:
            error_data = _client_json.loads(
                exc.read().decode("utf-8")
            )
            error_message = (
                error_data.get("message")
                or error_data.get("code")
            )
        except Exception:
            error_message = None

        raise HTTPException(
            status_code=404 if exc.code == 404 else 502,
            detail=(
                error_message
                or "Nie znaleziono firmy w rejestrze Ministerstwa Finansów"
            ),
        ) from exc
    except (
        _client_urlerror.URLError,
        TimeoutError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Rejestr Ministerstwa Finansów "
                "jest chwilowo niedostępny"
            ),
        ) from exc

    result = api_data.get("result") or {}
    subject = result.get("subject")

    if not subject:
        raise HTTPException(
            status_code=404,
            detail="Nie znaleziono firmy dla podanego NIP-u",
        )

    payload = {
        "source": "Ministerstwo Finansów – Wykaz podatników VAT",
        "lookup_date": lookup_date,
        "request_id": result.get("requestId"),
        "cached": False,
        "company_name": subject.get("name"),
        "nip": subject.get("nip") or cleaned_nip,
        "regon": subject.get("regon"),
        "krs": subject.get("krs"),
        "vat_status": subject.get("statusVat"),
        "working_address": subject.get("workingAddress"),
        "residence_address": subject.get("residenceAddress"),
        "address": (
            subject.get("workingAddress")
            or subject.get("residenceAddress")
        ),
    }

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO company_lookup_cache (
                    nip,
                    lookup_date,
                    payload
                )
                VALUES (%s, %s, %s)
                ON CONFLICT (nip, lookup_date)
                DO UPDATE SET payload = EXCLUDED.payload
                """,
                (
                    cleaned_nip,
                    lookup_date,
                    _ClientJsonb(payload),
                ),
            )

        conn.commit()

    return payload


@app.get("/clients/stats")
def client_stats(
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                    ) AS active,
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                        AND client_type = 'company'
                    ) AS companies,
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                        AND client_type = 'person'
                    ) AS people
                FROM clients
                """
            )
            client_row = cur.fetchone()

            cur.execute(
                """
                SELECT
                    COUNT(*) AS linked_orders,
                    COALESCE(SUM(price), 0) AS linked_value
                FROM orders
                WHERE client_id IS NOT NULL
                """
            )
            order_row = cur.fetchone()

    return {
        "active": int(client_row["active"] or 0),
        "companies": int(client_row["companies"] or 0),
        "people": int(client_row["people"] or 0),
        "linked_orders": int(order_row["linked_orders"] or 0),
        "linked_value": float(order_row["linked_value"] or 0),
    }


@app.get("/clients")
def list_clients(
    search: str | None = Query(default=None, max_length=200),
    archived: bool = False,
    limit: int = Query(default=500, ge=1, le=1000),
    user: dict = Depends(get_current_user),
):
    conditions = ["c.is_archived = %s"]
    params: list[object] = [archived]

    if search and search.strip():
        phrase = f"%{search.strip()}%"

        conditions.append(
            """
            (
                c.client_number ILIKE %s
                OR c.display_name ILIKE %s
                OR COALESCE(c.nip, '') ILIKE %s
                OR COALESCE(c.regon, '') ILIKE %s
                OR COALESCE(c.email, '') ILIKE %s
                OR COALESCE(c.phone, '') ILIKE %s
                OR COALESCE(c.city, '') ILIKE %s
                OR COALESCE(c.address, '') ILIKE %s
            )
            """
        )
        params.extend([phrase] * 8)

    params.append(limit)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    c.*,
                    COUNT(o.id) AS order_count,
                    COALESCE(SUM(o.price), 0) AS order_value
                FROM clients c
                LEFT JOIN orders o
                    ON o.client_id = c.id
                WHERE {" AND ".join(conditions)}
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                LIMIT %s
                """,
                params,
            )
            rows = cur.fetchall()

    return [_client_result(row) for row in rows]


@app.post("/clients", status_code=status.HTTP_201_CREATED)
def create_client(
    data: ClientCreate,
    user: dict = Depends(get_current_user),
):
    values = data.model_dump()
    client_type = (
        _clean_client_text(values.get("client_type"))
        or "person"
    ).lower()

    if client_type not in {"person", "company"}:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy typ klienta",
        )

    values["client_type"] = client_type
    values["nip"] = _clean_nip(values.get("nip"))

    if values["nip"] and not _valid_nip(values["nip"]):
        raise HTTPException(
            status_code=400,
            detail="Podany NIP jest nieprawidłowy",
        )

    display_name = _client_display_name(values)

    cleaned_values = {
        key: _clean_client_text(value)
        for key, value in values.items()
    }

    cleaned_values["client_type"] = client_type
    cleaned_values["nip"] = values["nip"]
    cleaned_values["country"] = (
        cleaned_values.get("country")
        or "Polska"
    )

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO clients (
                        client_type,
                        first_name,
                        last_name,
                        company_name,
                        display_name,
                        nip,
                        regon,
                        krs,
                        vat_status,
                        email,
                        phone,
                        address,
                        postal_code,
                        city,
                        country,
                        notes
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s, %s, %s
                    )
                    RETURNING id
                    """,
                    (
                        client_type,
                        cleaned_values.get("first_name"),
                        cleaned_values.get("last_name"),
                        cleaned_values.get("company_name"),
                        display_name,
                        cleaned_values.get("nip"),
                        cleaned_values.get("regon"),
                        cleaned_values.get("krs"),
                        cleaned_values.get("vat_status"),
                        cleaned_values.get("email"),
                        cleaned_values.get("phone"),
                        cleaned_values.get("address"),
                        cleaned_values.get("postal_code"),
                        cleaned_values.get("city"),
                        cleaned_values.get("country"),
                        cleaned_values.get("notes"),
                    ),
                )

                client_id = cur.fetchone()["id"]
                client_number = f"KL-{client_id:05d}"

                cur.execute(
                    """
                    UPDATE clients
                    SET client_number = %s
                    WHERE id = %s
                    """,
                    (client_number, client_id),
                )

                client = _get_client_or_404(cur, client_id)

            conn.commit()

    except Exception as exc:
        if "clients_nip_key" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="Klient z tym NIP-em już istnieje",
            ) from exc
        raise

    return _client_result(client)


@app.get("/clients/{client_id}")
def get_client(
    client_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            client = _get_client_or_404(cur, client_id)

    return _client_result(client)


@app.patch("/clients/{client_id}")
def update_client(
    client_id: int,
    data: ClientUpdate,
    user: dict = Depends(get_current_user),
):
    updates = data.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=400,
            detail="Brak danych do zapisania",
        )

    with get_connection() as conn:
        with conn.cursor() as cur:
            current = _get_client_or_404(cur, client_id)

    merged = {
        key: current.get(key)
        for key in [
            "client_type",
            "first_name",
            "last_name",
            "company_name",
            "nip",
            "regon",
            "krs",
            "vat_status",
            "email",
            "phone",
            "address",
            "postal_code",
            "city",
            "country",
            "notes",
        ]
    }
    merged.update(updates)

    client_type = (
        _clean_client_text(merged.get("client_type"))
        or "person"
    ).lower()

    if client_type not in {"person", "company"}:
        raise HTTPException(
            status_code=400,
            detail="Nieprawidłowy typ klienta",
        )

    merged["client_type"] = client_type
    merged["nip"] = _clean_nip(merged.get("nip"))

    if merged["nip"] and not _valid_nip(merged["nip"]):
        raise HTTPException(
            status_code=400,
            detail="Podany NIP jest nieprawidłowy",
        )

    display_name = _client_display_name(merged)

    allowed = {
        "client_type",
        "first_name",
        "last_name",
        "company_name",
        "nip",
        "regon",
        "krs",
        "vat_status",
        "email",
        "phone",
        "address",
        "postal_code",
        "city",
        "country",
        "notes",
    }

    assignments: list[str] = []
    params: list[object] = []

    for field in allowed:
        if field not in updates and field not in {
            "client_type",
            "nip",
        }:
            continue

        value = merged.get(field)

        if field == "nip":
            value = _clean_nip(value)
        elif isinstance(value, str):
            value = value.strip() or None

        assignments.append(f"{field} = %s")
        params.append(value)

    assignments.extend(
        [
            "display_name = %s",
            "updated_at = NOW()",
        ]
    )
    params.extend([display_name, client_id])

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE clients
                    SET {", ".join(assignments)}
                    WHERE id = %s
                    """,
                    params,
                )

                cur.execute(
                    """
                    UPDATE orders
                    SET
                        client_name = %s,
                        updated_at = NOW()
                    WHERE client_id = %s
                    """,
                    (display_name, client_id),
                )

                client = _get_client_or_404(cur, client_id)

            conn.commit()

    except Exception as exc:
        if "clients_nip_key" in str(exc):
            raise HTTPException(
                status_code=409,
                detail="Klient z tym NIP-em już istnieje",
            ) from exc
        raise

    return _client_result(client)


@app.get("/clients/{client_id}/orders")
def get_client_orders(
    client_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            client = _get_client_or_404(cur, client_id)

            cur.execute(
                """
                SELECT *
                FROM orders
                WHERE client_id = %s
                   OR (
                        client_id IS NULL
                        AND client_name = %s
                   )
                ORDER BY created_at DESC
                LIMIT 300
                """,
                (
                    client_id,
                    client["display_name"],
                ),
            )

            rows = cur.fetchall()

    return rows


@app.post("/clients/{client_id}/archive")
def archive_client(
    client_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_client_or_404(cur, client_id)

            cur.execute(
                """
                UPDATE clients
                SET
                    is_archived = TRUE,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (client_id,),
            )

            client = _get_client_or_404(cur, client_id)

        conn.commit()

    return _client_result(client)


@app.post("/clients/{client_id}/restore")
def restore_client(
    client_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _get_client_or_404(cur, client_id)

            cur.execute(
                """
                UPDATE clients
                SET
                    is_archived = FALSE,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (client_id,),
            )

            client = _get_client_or_404(cur, client_id)

        conn.commit()

    return _client_result(client)


@app.post(
    "/clients/{client_id}/create-order",
    status_code=status.HTTP_201_CREATED,
)
def create_order_for_client(
    client_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            client = _get_client_or_404(cur, client_id)

            if client["is_archived"]:
                raise HTTPException(
                    status_code=400,
                    detail="Nie można tworzyć zamówienia dla zarchiwizowanego klienta",
                )

            cur.execute(
                """
                INSERT INTO orders (
                    client_id,
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
                    %s, %s, 'Nowe zamówienie', 'Panel klientów',
                    '', 1, 0, 0, 'Nieopłacone',
                    NULL, NULL, 'Nowe'
                )
                RETURNING id
                """,
                (
                    client_id,
                    client["display_name"],
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

            order = get_order_or_404(cur, order_id)

        conn.commit()

    return order


@app.post("/orders/{order_id}/assign-client")
def assign_client_to_order(
    order_id: int,
    data: AssignClientToOrder,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            get_order_or_404(cur, order_id)
            client = _get_client_or_404(
                cur,
                data.client_id,
            )

            if client["is_archived"]:
                raise HTTPException(
                    status_code=400,
                    detail="Nie można przypisać zarchiwizowanego klienta",
                )

            cur.execute(
                """
                UPDATE orders
                SET
                    client_id = %s,
                    client_name = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    client["id"],
                    client["display_name"],
                    order_id,
                ),
            )

            order = get_order_or_404(cur, order_id)

        conn.commit()

    return order

# === YOKAI CLIENT SEARCH AND SVG PICKER V0.17 ===


class AssignSvgAssetToOrder(BaseModel):
    order_id: int = Field(gt=0)


@app.on_event("startup")
def startup_client_autolink():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE OR REPLACE FUNCTION
                yokai_assign_client_by_name()
                RETURNS TRIGGER AS $$
                DECLARE
                    matched_client_id BIGINT;
                BEGIN
                    IF NEW.client_id IS NULL
                       AND NULLIF(
                           BTRIM(
                               COALESCE(
                                   NEW.client_name,
                                   ''
                               )
                           ),
                           ''
                       ) IS NOT NULL
                    THEN
                        SELECT id
                        INTO matched_client_id
                        FROM clients
                        WHERE is_archived = FALSE
                          AND LOWER(
                              BTRIM(display_name)
                          ) = LOWER(
                              BTRIM(
                                  NEW.client_name
                              )
                          )
                        ORDER BY id
                        LIMIT 1;

                        IF matched_client_id
                           IS NOT NULL
                        THEN
                            NEW.client_id :=
                                matched_client_id;
                        END IF;
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
                """
            )

            cur.execute(
                """
                DROP TRIGGER IF EXISTS
                orders_assign_client_by_name
                ON orders
                """
            )

            cur.execute(
                """
                CREATE TRIGGER
                orders_assign_client_by_name
                BEFORE INSERT OR UPDATE OF
                    client_name,
                    client_id
                ON orders
                FOR EACH ROW
                EXECUTE FUNCTION
                    yokai_assign_client_by_name()
                """
            )

        conn.commit()


@app.post(
    "/svg-assets/{asset_id}/assign-order"
)
def assign_svg_asset_to_order(
    asset_id: int,
    data: AssignSvgAssetToOrder,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            asset = _get_svg_or_404(
                cur,
                asset_id,
            )

            if asset["is_archived"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Nie można przypisać "
                        "zarchiwizowanego projektu"
                    ),
                )

            order = get_order_or_404(
                cur,
                data.order_id,
            )

            cur.execute(
                """
                UPDATE svg_assets
                SET
                    order_id = %s,
                    client_name = %s,
                    is_production_ready = FALSE,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    data.order_id,
                    order["client_name"],
                    asset_id,
                ),
            )

            result = _get_svg_or_404(
                cur,
                asset_id,
            )

        conn.commit()

    return _svg_result(result)

# === YOKAI SVG UNASSIGN V0.18 ===


class UnassignSvgAssetFromOrder(BaseModel):
    order_id: int = Field(gt=0)


@app.post(
    "/svg-assets/{asset_id}/unassign-order"
)
def unassign_svg_asset_from_order(
    asset_id: int,
    data: UnassignSvgAssetFromOrder,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            asset = _get_svg_or_404(
                cur,
                asset_id,
            )

            if asset["order_id"] is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Projekt nie jest przypisany "
                        "do żadnego zamówienia"
                    ),
                )

            if int(asset["order_id"]) != data.order_id:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Projekt jest przypisany "
                        "do innego zamówienia"
                    ),
                )

            get_order_or_404(
                cur,
                data.order_id,
            )

            cur.execute(
                """
                UPDATE svg_assets
                SET
                    order_id = NULL,
                    is_production_ready = FALSE,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (asset_id,),
            )

            result = _get_svg_or_404(
                cur,
                asset_id,
            )

        conn.commit()

    return _svg_result(result)

# === YOKAI BULK OPERATIONS V0.20 ===


class BulkOperationRequest(BaseModel):
    ids: list[int] = Field(
        min_length=1,
        max_length=1000,
    )
    action: str = Field(
        min_length=1,
        max_length=20,
    )


@app.post("/bulk/{entity}")
def run_bulk_operation(
    entity: str,
    data: BulkOperationRequest,
    user: dict = Depends(get_current_user),
):
    entity_config = {
        "clients": {
            "table": "clients",
            "label": "klientów",
        },
        "orders": {
            "table": "orders",
            "label": "zamówień",
        },
        "materials": {
            "table": "materials",
            "label": "materiałów",
        },
    }

    if entity not in entity_config:
        raise HTTPException(
            status_code=404,
            detail="Nieobsługiwany typ danych",
        )

    action = data.action.strip().lower()

    if action not in {
        "archive",
        "restore",
        "delete",
    }:
        raise HTTPException(
            status_code=400,
            detail="Nieobsługiwana operacja",
        )

    ids = sorted(
        {
            int(item_id)
            for item_id in data.ids
            if int(item_id) > 0
        }
    )

    if not ids:
        raise HTTPException(
            status_code=400,
            detail="Nie wybrano żadnych pozycji",
        )

    table = entity_config[entity]["table"]

    with get_connection() as conn:
        try:
            with conn.cursor() as cur:
                if action in {
                    "archive",
                    "restore",
                }:
                    archived_value = (
                        action == "archive"
                    )

                    cur.execute(
                        f"""
                        UPDATE {table}
                        SET
                            is_archived = %s,
                            updated_at = NOW()
                        WHERE id = ANY(%s)
                        RETURNING id
                        """,
                        (
                            archived_value,
                            ids,
                        ),
                    )

                    changed_ids = [
                        row["id"]
                        for row in cur.fetchall()
                    ]

                else:
                    if entity == "clients":
                        cur.execute(
                            """
                            UPDATE orders
                            SET
                                client_id = NULL,
                                updated_at = NOW()
                            WHERE client_id = ANY(%s)
                            """,
                            (ids,),
                        )

                    elif entity == "orders":
                        cur.execute(
                            """
                            UPDATE calculations
                            SET
                                order_id = NULL,
                                order_price_updated = FALSE,
                                updated_at = NOW()
                            WHERE order_id = ANY(%s)
                            """,
                            (ids,),
                        )

                        cur.execute(
                            """
                            UPDATE svg_assets
                            SET
                                order_id = NULL,
                                is_production_ready = FALSE,
                                updated_at = NOW()
                            WHERE order_id = ANY(%s)
                            """,
                            (ids,),
                        )

                    cur.execute(
                        f"""
                        DELETE FROM {table}
                        WHERE id = ANY(%s)
                        RETURNING id
                        """,
                        (ids,),
                    )

                    changed_ids = [
                        row["id"]
                        for row in cur.fetchall()
                    ]

            conn.commit()

        except Exception as exc:
            conn.rollback()

            if action == "delete":
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Nie można trwale usunąć części "
                        "wybranych pozycji, ponieważ są "
                        "powiązane z innymi danymi. "
                        "Najpierw je zarchiwizuj."
                    ),
                ) from exc

            raise

    action_labels = {
        "archive": "Zarchiwizowano",
        "restore": "Przywrócono",
        "delete": "Usunięto",
    }

    return {
        "entity": entity,
        "action": action,
        "requested": len(ids),
        "changed": len(changed_ids),
        "ids": changed_ids,
        "message": (
            f"{action_labels[action]} "
            f"{len(changed_ids)} "
            f"{entity_config[entity]['label']}"
        ),
    }

# === YOKAI ORDER INSTRUCTION PDFS V0.21 ===

import re as _pdf_re
import uuid as _pdf_uuid
from datetime import datetime as _pdf_datetime
from pathlib import Path as _PdfPath
from xml.sax.saxutils import escape as _pdf_escape

from reportlab.lib import colors as _pdf_colors
from reportlab.lib.enums import TA_CENTER as _PDF_TA_CENTER
from reportlab.lib.pagesizes import A4 as _PDF_A4
from reportlab.lib.styles import ParagraphStyle as _PdfParagraphStyle
from reportlab.lib.units import mm as _pdf_mm
from reportlab.pdfbase import pdfmetrics as _pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as _PdfTTFont
from reportlab.platypus import (
    KeepTogether as _PdfKeepTogether,
    Paragraph as _PdfParagraph,
    SimpleDocTemplate as _PdfSimpleDocTemplate,
    Spacer as _PdfSpacer,
    Table as _PdfTable,
    TableStyle as _PdfTableStyle,
)


PDF_STORAGE_DIR = _PdfPath(
    os.environ.get(
        "PDF_STORAGE_DIR",
        "/srv/yokai-data/pdf",
    )
)

_PDF_FONT_REGULAR_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
]

_PDF_FONT_BOLD_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
]


def _find_pdf_font(
    candidates: list[str],
) -> _PdfPath:
    for candidate in candidates:
        path = _PdfPath(
            candidate
        )

        if path.exists():
            return path

    raise RuntimeError(
        "Brakuje fontów DejaVu Sans "
        "potrzebnych do polskich znaków w PDF"
    )

_PDF_ACCENT = _pdf_colors.HexColor("#4C1D95")
_PDF_DARK = _pdf_colors.HexColor("#15171C")
_PDF_MUTED = _pdf_colors.HexColor("#6B7280")
_PDF_LIGHT = _pdf_colors.HexColor("#F4F2F8")
_PDF_BORDER = _pdf_colors.HexColor("#E8E5ED")


class GenerateOrderInstructionPdf(BaseModel):
    instruction_type: str = Field(
        min_length=1,
        max_length=30,
    )
    custom_title: str | None = Field(
        default=None,
        max_length=160,
    )
    custom_text: str | None = Field(
        default=None,
        max_length=12000,
    )


def _ensure_pdf_storage() -> None:
    PDF_STORAGE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )


def _register_pdf_fonts() -> None:
    if "YokaiSans" not in _pdfmetrics.getRegisteredFontNames():
        regular = _find_pdf_font(
            _PDF_FONT_REGULAR_CANDIDATES
        )

        bold = _find_pdf_font(
            _PDF_FONT_BOLD_CANDIDATES
        )

        _pdfmetrics.registerFont(
            _PdfTTFont(
                "YokaiSans",
                str(regular),
            )
        )

        _pdfmetrics.registerFont(
            _PdfTTFont(
                "YokaiSans-Bold",
                str(bold),
            )
        )


def _pdf_clean_filename(
    value: str,
) -> str:
    value = _pdf_re.sub(
        r"[^A-Za-z0-9._-]+",
        "-",
        value.strip(),
    )

    return (
        value.strip("-._")
        or "yokai"
    )


def _instruction_catalog() -> dict:
    common_warning = (
        "Instrukcja ma charakter ogólny. "
        "W przypadku nietypowej powierzchni, "
        "świeżego lakieru, tworzyw wydzielających "
        "gazy lub montażu w trudnych warunkach "
        "skontaktuj się z YOKAI WRAP przed aplikacją."
    )

    return {
        "application": {
            "title": "Instrukcja aplikacji naklejki",
            "subtitle": (
                "Standardowa instrukcja dla naklejek "
                "wycinanych ploterowo z folii samoprzylepnej."
            ),
            "sections": [
                (
                    "1. Przygotuj powierzchnię",
                    [
                        (
                            "Powierzchnia powinna być gładka, "
                            "czysta, sucha i wolna od tłuszczu, "
                            "wosku oraz silikonu."
                        ),
                        (
                            "Najbezpieczniej odtłuścić miejsce "
                            "alkoholem izopropylowym (IPA) lub "
                            "środkiem przeznaczonym do "
                            "przygotowania powierzchni pod folie. "
                            "Po czyszczeniu wytrzyj do sucha."
                        ),
                        (
                            "Nie naklejaj folii na świeży lakier. "
                            "Jeżeli powierzchnia była niedawno "
                            "lakierowana, upewnij się, że lakier "
                            "jest całkowicie utwardzony."
                        ),
                    ],
                ),
                (
                    "2. Ustaw naklejkę",
                    [
                        (
                            "Przyłóż naklejkę razem z papierem "
                            "transportowym i ustaw ją dokładnie "
                            "w docelowym miejscu."
                        ),
                        (
                            "Przy większych projektach warto "
                            "ustalić pozycję taśmą maskującą, "
                            "zanim zaczniesz zdejmować papier "
                            "podkładowy."
                        ),
                    ],
                ),
                (
                    "3. Naklej",
                    [
                        (
                            "Odklejaj papier podkładowy stopniowo. "
                            "Dociskaj grafikę raklą lub miękką "
                            "ściereczką równymi, zachodzącymi na "
                            "siebie ruchami."
                        ),
                        (
                            "Pracuj od środka na zewnątrz, żeby "
                            "ograniczyć ryzyko pęcherzy powietrza "
                            "i zagięć."
                        ),
                    ],
                ),
                (
                    "4. Zdejmij papier transportowy",
                    [
                        (
                            "Po dociśnięciu grafiki zdejmuj papier "
                            "transportowy powoli, prowadząc go "
                            "możliwie płasko względem powierzchni "
                            "(około 180°)."
                        ),
                        (
                            "Jeżeli któryś element podnosi się "
                            "razem z transferem, cofnij papier, "
                            "ponownie mocno dociśnij ten fragment "
                            "i spróbuj jeszcze raz."
                        ),
                    ],
                ),
                (
                    "5. Po aplikacji",
                    [
                        (
                            "Na koniec ponownie dociśnij krawędzie "
                            "i drobne elementy. W pierwszej dobie "
                            "po aplikacji unikaj dużego spadku "
                            "temperatury."
                        ),
                        (
                            "Jeżeli naklejka jest narażona na wodę "
                            "lub mycie, daj klejowi czas na "
                            "osiągnięcie pełnej przyczepności "
                            "przed intensywnym czyszczeniem."
                        ),
                    ],
                ),
            ],
            "warning": common_warning,
        },
        "care": {
            "title": "Pielęgnacja naklejki",
            "subtitle": (
                "Jak czyścić i użytkować naklejkę, "
                "żeby nie uszkodzić krawędzi ani powierzchni."
            ),
            "sections": [
                (
                    "1. Pierwsze godziny",
                    [
                        (
                            "Po aplikacji dokładnie dociśnij "
                            "wszystkie krawędzie i drobne elementy."
                        ),
                        (
                            "W pierwszej dobie unikaj dużego spadku "
                            "temperatury i intensywnego mycia."
                        ),
                    ],
                ),
                (
                    "2. Mycie",
                    [
                        (
                            "Czyść naklejkę łagodnym środkiem "
                            "i miękką ściereczką lub gąbką."
                        ),
                        (
                            "Nie kieruj silnego strumienia "
                            "bezpośrednio pod krawędź naklejki."
                        ),
                    ],
                ),
                (
                    "3. Chemia i temperatura",
                    [
                        (
                            "Unikaj agresywnych rozpuszczalników, "
                            "ostrych narzędzi oraz środków "
                            "ściernych."
                        ),
                        (
                            "Jeżeli naklejka pracuje w bardzo "
                            "wysokiej lub niskiej temperaturze, "
                            "kontroluj stan krawędzi."
                        ),
                    ],
                ),
                (
                    "4. Uszkodzenie",
                    [
                        (
                            "Jeżeli fragment zacznie się odklejać, "
                            "nie ciągnij go. Skontaktuj się z "
                            "YOKAI WRAP i prześlij zdjęcie."
                        ),
                    ],
                ),
            ],
            "warning": common_warning,
        },
        "social": {
            "title": "Instrukcja naklejki Social Media",
            "subtitle": (
                "Montaż wieloelementowej naklejki z ikoną "
                "i nazwą profilu."
            ),
            "sections": [
                (
                    "1. Sprawdź układ",
                    [
                        (
                            "Przed odklejeniem papieru podkładowego "
                            "przyłóż cały projekt do powierzchni "
                            "i sprawdź poziom, odstępy oraz kierunek."
                        ),
                        (
                            "Nie odrywaj pojedynczych liter ani "
                            "elementów od papieru transportowego."
                        ),
                    ],
                ),
                (
                    "2. Przygotuj powierzchnię",
                    [
                        (
                            "Oczyść i odtłuść powierzchnię. "
                            "Miejsce montażu musi być suche i "
                            "wolne od wosku oraz silikonu."
                        ),
                    ],
                ),
                (
                    "3. Naklej cały projekt",
                    [
                        (
                            "Odklejaj podkład stopniowo i dociskaj "
                            "projekt od środka na zewnątrz."
                        ),
                        (
                            "Raklą dokładnie przejedź po ikonie, "
                            "literach i cienkich elementach."
                        ),
                    ],
                ),
                (
                    "4. Zdejmij transfer",
                    [
                        (
                            "Papier transportowy zdejmuj powoli "
                            "i możliwie płasko względem powierzchni."
                        ),
                        (
                            "Jeżeli litera lub fragment logo "
                            "podnosi się, cofnij transfer i ponownie "
                            "mocno dociśnij ten element."
                        ),
                    ],
                ),
                (
                    "5. Kontrola",
                    [
                        (
                            "Po zdjęciu transferu sprawdź wszystkie "
                            "krawędzie i ponownie je dociśnij."
                        ),
                    ],
                ),
            ],
            "warning": common_warning,
        },
        "nfc": {
            "title": "Instrukcja naklejki z NFC",
            "subtitle": (
                "Montaż i sprawdzenie naklejki z ukrytym "
                "tagiem NFC."
            ),
            "sections": [
                (
                    "1. Sprawdź NFC przed montażem",
                    [
                        (
                            "Przed trwałym przyklejeniem sprawdź, "
                            "czy telefon poprawnie odczytuje tag "
                            "i otwiera właściwy link."
                        ),
                        (
                            "Test wykonaj także w docelowym miejscu. "
                            "Powierzchnie metalowe mogą wymagać "
                            "odpowiedniego typu taga NFC."
                        ),
                    ],
                ),
                (
                    "2. Nie uszkodź taga",
                    [
                        (
                            "Nie zaginaj, nie przebijaj i nie "
                            "przecinaj miejsca, pod którym znajduje "
                            "się tag NFC."
                        ),
                        (
                            "Podczas dociskania używaj równomiernej "
                            "siły i nie uderzaj ostrą krawędzią "
                            "rakli bezpośrednio w tag."
                        ),
                    ],
                ),
                (
                    "3. Naklej projekt",
                    [
                        (
                            "Oczyść i odtłuść powierzchnię, ustaw "
                            "projekt i aplikuj go tak samo jak "
                            "standardową naklejkę z transferem."
                        ),
                    ],
                ),
                (
                    "4. Sprawdź po aplikacji",
                    [
                        (
                            "Po zakończeniu montażu ponownie "
                            "przetestuj NFC kilkoma próbami."
                        ),
                        (
                            "W telefonie przyłóż obszar anteny NFC "
                            "do miejsca oznaczonego jako NFC "
                            "w projekcie."
                        ),
                    ],
                ),
            ],
            "warning": (
                "Działanie NFC zależy również od telefonu, "
                "położenia anteny i powierzchni montażowej. "
                "Jeżeli odczyt jest niestabilny, skontaktuj się "
                "z YOKAI WRAP przed dalszym montażem."
            ),
        },
    }


def _pdf_styles() -> dict:
    base = _PdfParagraphStyle(
        "YokaiBase",
        fontName="YokaiSans",
        fontSize=8.7,
        leading=12,
        textColor=_PDF_DARK,
    )

    return {
        "base": base,
        "brand": _PdfParagraphStyle(
            "YokaiBrand",
            parent=base,
            fontName="YokaiSans-Bold",
            fontSize=11,
            leading=14,
            textColor=_PDF_ACCENT,
            spaceAfter=3,
        ),
        "title": _PdfParagraphStyle(
            "YokaiTitle",
            parent=base,
            fontName="YokaiSans-Bold",
            fontSize=19,
            leading=22,
            textColor=_PDF_DARK,
            spaceAfter=4,
        ),
        "section": _PdfParagraphStyle(
            "YokaiSection",
            parent=base,
            fontName="YokaiSans-Bold",
            fontSize=10.8,
            leading=13.5,
            textColor=_PDF_ACCENT,
            spaceBefore=3,
            spaceAfter=4,
        ),
        "small": _PdfParagraphStyle(
            "YokaiSmall",
            parent=base,
            fontSize=7.2,
            leading=9.2,
            textColor=_PDF_MUTED,
        ),
        "step": _PdfParagraphStyle(
            "YokaiStep",
            parent=base,
            spaceAfter=3,
        ),
        "number": _PdfParagraphStyle(
            "YokaiNumber",
            parent=base,
            fontName="YokaiSans-Bold",
            textColor=_pdf_colors.white,
            alignment=_PDF_TA_CENTER,
        ),
        "warning": _PdfParagraphStyle(
            "YokaiWarning",
            parent=base,
            fontName="YokaiSans-Bold",
            fontSize=8.3,
            leading=11,
        ),
    }


def _pdf_header_footer(
    canvas,
    doc,
) -> None:
    width, height = _PDF_A4

    canvas.saveState()

    canvas.setFillColor(
        _PDF_ACCENT
    )

    canvas.rect(
        0,
        height - 6 * _pdf_mm,
        width,
        6 * _pdf_mm,
        fill=1,
        stroke=0,
    )

    canvas.setFillColor(
        _PDF_MUTED
    )

    canvas.setFont(
        "YokaiSans-Bold",
        7.5,
    )

    canvas.drawString(
        18 * _pdf_mm,
        10 * _pdf_mm,
        "YOKAI WRAP  •  yokaiwrap.pl",
    )

    canvas.drawRightString(
        width - 18 * _pdf_mm,
        10 * _pdf_mm,
        f"Strona {doc.page}",
    )

    canvas.restoreState()


def _custom_sections(
    custom_text: str,
) -> list:
    raw_parts = [
        value.strip()
        for value in _pdf_re.split(
            r"\n\s*\n",
            custom_text.strip(),
        )
        if value.strip()
    ]

    if not raw_parts:
        return []

    sections = []

    for index, part in enumerate(
        raw_parts,
        start=1,
    ):
        lines = [
            line.strip()
            for line in part.splitlines()
            if line.strip()
        ]

        if not lines:
            continue

        heading = (
            f"{index}. {lines[0]}"
            if len(lines) > 1
            else f"{index}. Informacja"
        )

        items = (
            lines[1:]
            if len(lines) > 1
            else lines
        )

        sections.append(
            (
                heading,
                items,
            )
        )

    return sections


def _build_order_instruction_pdf(
    output_path: _PdfPath,
    order: dict,
    instruction_type: str,
    custom_title: str | None,
    custom_text: str | None,
) -> dict:
    _register_pdf_fonts()

    catalog = _instruction_catalog()

    if instruction_type == "custom":
        title = (
            (custom_title or "").strip()
            or "Instrukcja dla klienta"
        )

        text = (
            custom_text
            or ""
        ).strip()

        if not text:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Własna instrukcja wymaga treści"
                ),
            )

        definition = {
            "title": title,
            "subtitle": (
                "Indywidualna instrukcja przygotowana "
                "dla tego zamówienia."
            ),
            "sections": _custom_sections(
                text
            ),
            "warning": (
                "W razie wątpliwości skontaktuj się "
                "z YOKAI WRAP przed wykonaniem czynności "
                "opisanych w instrukcji."
            ),
        }

    else:
        definition = catalog.get(
            instruction_type
        )

        if definition is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Nieobsługiwany typ instrukcji"
                ),
            )

    styles = _pdf_styles()

    doc = _PdfSimpleDocTemplate(
        str(output_path),
        pagesize=_PDF_A4,
        rightMargin=18 * _pdf_mm,
        leftMargin=18 * _pdf_mm,
        topMargin=17 * _pdf_mm,
        bottomMargin=16 * _pdf_mm,
        title=definition["title"],
        author="YOKAI WRAP",
        subject=(
            f"Instrukcja do zamówienia "
            f"{order.get('order_number') or order.get('id')}"
        ),
    )

    story = [
        _PdfParagraph(
            "YOKAI WRAP",
            styles["brand"],
        ),
        _PdfParagraph(
            _pdf_escape(
                definition["title"]
            ),
            styles["title"],
        ),
        _PdfParagraph(
            _pdf_escape(
                definition["subtitle"]
            ),
            styles["small"],
        ),
        _PdfSpacer(
            1,
            4 * _pdf_mm,
        ),
    ]

    order_number = (
        order.get("order_number")
        or f"#{order.get('id')}"
    )

    client_name = (
        order.get("client_name")
        or "Brak danych"
    )

    order_name = (
        order.get("name")
        or "Zamówienie"
    )

    meta = _PdfTable(
        [
            [
                _PdfParagraph(
                    (
                        "<b>Zamówienie</b><br/>"
                        + _pdf_escape(
                            str(order_number)
                        )
                    ),
                    styles["base"],
                ),
                _PdfParagraph(
                    (
                        "<b>Klient</b><br/>"
                        + _pdf_escape(
                            str(client_name)
                        )
                    ),
                    styles["base"],
                ),
                _PdfParagraph(
                    (
                        "<b>Produkt</b><br/>"
                        + _pdf_escape(
                            str(order_name)
                        )
                    ),
                    styles["base"],
                ),
            ]
        ],
        colWidths=[
            55 * _pdf_mm,
            55 * _pdf_mm,
            64 * _pdf_mm,
        ],
    )

    meta.setStyle(
        _PdfTableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (-1, -1),
                    _PDF_LIGHT,
                ),
                (
                    "BOX",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    _PDF_BORDER,
                ),
                (
                    "INNERGRID",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    _PDF_BORDER,
                ),
                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "TOP",
                ),
                (
                    "LEFTPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
                (
                    "RIGHTPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
                (
                    "TOPPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
                (
                    "BOTTOMPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
            ]
        )
    )

    story.extend(
        [
            meta,
            _PdfSpacer(
                1,
                4 * _pdf_mm,
            ),
        ]
    )

    for (
        section_title,
        items,
    ) in definition["sections"]:
        block = [
            _PdfParagraph(
                _pdf_escape(
                    section_title
                ),
                styles["section"],
            )
        ]

        for (
            item_index,
            item,
        ) in enumerate(
            items,
            start=1,
        ):
            row = _PdfTable(
                [
                    [
                        _PdfParagraph(
                            str(
                                item_index
                            ),
                            styles["number"],
                        ),
                        _PdfParagraph(
                            _pdf_escape(
                                str(item)
                            ),
                            styles["step"],
                        ),
                    ]
                ],
                colWidths=[
                    8 * _pdf_mm,
                    163 * _pdf_mm,
                ],
            )

            row.setStyle(
                _PdfTableStyle(
                    [
                        (
                            "BACKGROUND",
                            (0, 0),
                            (0, 0),
                            _PDF_ACCENT,
                        ),
                        (
                            "VALIGN",
                            (0, 0),
                            (-1, -1),
                            "TOP",
                        ),
                        (
                            "LEFTPADDING",
                            (0, 0),
                            (0, 0),
                            0,
                        ),
                        (
                            "RIGHTPADDING",
                            (0, 0),
                            (0, 0),
                            0,
                        ),
                        (
                            "TOPPADDING",
                            (0, 0),
                            (0, 0),
                            3,
                        ),
                        (
                            "BOTTOMPADDING",
                            (0, 0),
                            (0, 0),
                            3,
                        ),
                        (
                            "LEFTPADDING",
                            (1, 0),
                            (1, 0),
                            8,
                        ),
                        (
                            "RIGHTPADDING",
                            (1, 0),
                            (1, 0),
                            0,
                        ),
                        (
                            "TOPPADDING",
                            (1, 0),
                            (1, 0),
                            0,
                        ),
                        (
                            "BOTTOMPADDING",
                            (1, 0),
                            (1, 0),
                            1,
                        ),
                    ]
                )
            )

            block.extend(
                [
                    row,
                    _PdfSpacer(
                        1,
                        1 * _pdf_mm,
                    ),
                ]
            )

        story.append(
            _PdfKeepTogether(
                block
            )
        )

        story.append(
            _PdfSpacer(
                1,
                1 * _pdf_mm,
            )
        )

    warning = _PdfTable(
        [
            [
                _PdfParagraph(
                    "WAŻNE",
                    styles["warning"],
                ),
                _PdfParagraph(
                    _pdf_escape(
                        definition["warning"]
                    ),
                    styles["base"],
                ),
            ]
        ],
        colWidths=[
            27 * _pdf_mm,
            144 * _pdf_mm,
        ],
    )

    warning.setStyle(
        _PdfTableStyle(
            [
                (
                    "BACKGROUND",
                    (0, 0),
                    (0, 0),
                    _PDF_ACCENT,
                ),
                (
                    "TEXTCOLOR",
                    (0, 0),
                    (0, 0),
                    _pdf_colors.white,
                ),
                (
                    "BACKGROUND",
                    (1, 0),
                    (1, 0),
                    _PDF_LIGHT,
                ),
                (
                    "BOX",
                    (0, 0),
                    (-1, -1),
                    0.5,
                    _PDF_BORDER,
                ),
                (
                    "VALIGN",
                    (0, 0),
                    (-1, -1),
                    "MIDDLE",
                ),
                (
                    "LEFTPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
                (
                    "RIGHTPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
                (
                    "TOPPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
                (
                    "BOTTOMPADDING",
                    (0, 0),
                    (-1, -1),
                    8,
                ),
            ]
        )
    )

    story.extend(
        [
            _PdfSpacer(
                1,
                2 * _pdf_mm,
            ),
            warning,
            _PdfSpacer(
                1,
                2 * _pdf_mm,
            ),
            _PdfParagraph(
                (
                    "Wygenerowano: "
                    + _pdf_datetime.now().strftime(
                        "%d.%m.%Y %H:%M"
                    )
                    + " • YOKAI OS"
                ),
                styles["small"],
            ),
        ]
    )

    doc.build(
        story,
        onFirstPage=_pdf_header_footer,
        onLaterPages=_pdf_header_footer,
    )

    return {
        "title": definition["title"],
    }


def _instruction_pdf_result(
    row: dict,
) -> dict:
    result = dict(row)

    result["file_size"] = int(
        result.get("file_size")
        or 0
    )

    result["version"] = int(
        result.get("version")
        or 1
    )

    return result


def _get_instruction_pdf_or_404(
    cur,
    pdf_id: int,
) -> dict:
    cur.execute(
        """
        SELECT
            p.*,
            o.order_number,
            o.client_name,
            o.name AS order_name
        FROM order_instruction_pdfs p
        JOIN orders o
            ON o.id = p.order_id
        WHERE p.id = %s
        """,
        (pdf_id,),
    )

    row = cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Nie znaleziono instrukcji PDF"
            ),
        )

    return row


@app.on_event("startup")
def startup_order_instruction_pdfs():
    _ensure_pdf_storage()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS
                order_instruction_pdfs (
                    id BIGSERIAL PRIMARY KEY,
                    order_id BIGINT NOT NULL
                        REFERENCES orders(id)
                        ON DELETE CASCADE,
                    instruction_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    version INTEGER NOT NULL
                        DEFAULT 1,
                    stored_filename TEXT UNIQUE
                        NOT NULL,
                    file_path TEXT UNIQUE
                        NOT NULL,
                    file_size BIGINT NOT NULL
                        DEFAULT 0,
                    custom_title TEXT,
                    custom_text TEXT,
                    created_at TIMESTAMPTZ
                        NOT NULL DEFAULT NOW()
                )
                """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS
                order_instruction_pdfs_order_index
                ON order_instruction_pdfs (
                    order_id,
                    created_at DESC
                )
                """
            )

        conn.commit()


@app.get(
    "/orders/{order_id}/instructions"
)
def get_order_instruction_pdfs(
    order_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                SELECT
                    p.*,
                    o.order_number,
                    o.client_name,
                    o.name AS order_name
                FROM order_instruction_pdfs p
                JOIN orders o
                    ON o.id = p.order_id
                WHERE p.order_id = %s
                ORDER BY
                    p.created_at DESC,
                    p.id DESC
                """,
                (order_id,),
            )

            rows = cur.fetchall()

    return [
        _instruction_pdf_result(
            row
        )
        for row in rows
    ]


@app.post(
    "/orders/{order_id}/instructions/generate",
    status_code=status.HTTP_201_CREATED,
)
def generate_order_instruction_pdf(
    order_id: int,
    data: GenerateOrderInstructionPdf,
    user: dict = Depends(
        get_current_user
    ),
):
    instruction_type = (
        data.instruction_type
        .strip()
        .lower()
    )

    allowed = {
        "application",
        "care",
        "social",
        "nfc",
        "custom",
    }

    if instruction_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieobsługiwany typ instrukcji"
            ),
        )

    custom_title = (
        data.custom_title.strip()
        if data.custom_title
        else None
    )

    custom_text = (
        data.custom_text.strip()
        if data.custom_text
        else None
    )

    if (
        instruction_type == "custom"
        and not custom_text
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Wpisz treść własnej instrukcji"
            ),
        )

    _ensure_pdf_storage()

    with get_connection() as conn:
        with conn.cursor() as cur:
            order = get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                SELECT
                    COALESCE(
                        MAX(version),
                        0
                    ) + 1 AS next_version
                FROM order_instruction_pdfs
                WHERE
                    order_id = %s
                    AND instruction_type = %s
                """,
                (
                    order_id,
                    instruction_type,
                ),
            )

            version_row = (
                cur.fetchone()
                or {}
            )

            version = int(
                version_row.get(
                    "next_version"
                )
                or 1
            )

            order_number = (
                order.get(
                    "order_number"
                )
                or f"order-{order_id}"
            )

            safe_order = (
                _pdf_clean_filename(
                    str(order_number)
                )
            )

            unique = (
                _pdf_uuid.uuid4()
                .hex[:8]
            )

            stored_filename = (
                f"{safe_order}-"
                f"{instruction_type}-"
                f"v{version}-"
                f"{unique}.pdf"
            )

            output_path = (
                PDF_STORAGE_DIR
                / stored_filename
            )

            try:
                generated = (
                    _build_order_instruction_pdf(
                        output_path,
                        order,
                        instruction_type,
                        custom_title,
                        custom_text,
                    )
                )

                file_size = (
                    output_path.stat()
                    .st_size
                )

                cur.execute(
                    """
                    INSERT INTO
                        order_instruction_pdfs (
                            order_id,
                            instruction_type,
                            title,
                            version,
                            stored_filename,
                            file_path,
                            file_size,
                            custom_title,
                            custom_text
                        )
                    VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s
                    )
                    RETURNING id
                    """,
                    (
                        order_id,
                        instruction_type,
                        generated["title"],
                        version,
                        stored_filename,
                        str(output_path),
                        file_size,
                        custom_title,
                        custom_text,
                    ),
                )

                inserted = cur.fetchone()

                row = (
                    _get_instruction_pdf_or_404(
                        cur,
                        inserted["id"],
                    )
                )

                conn.commit()

            except HTTPException:
                conn.rollback()

                if output_path.exists():
                    output_path.unlink(
                        missing_ok=True
                    )

                raise

            except Exception as exc:
                conn.rollback()

                if output_path.exists():
                    output_path.unlink(
                        missing_ok=True
                    )

                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Nie udało się wygenerować PDF"
                    ),
                ) from exc

    return _instruction_pdf_result(
        row
    )


@app.get(
    "/order-instructions/{pdf_id}/file"
)
def get_order_instruction_pdf_file(
    pdf_id: int,
    download: bool = Query(
        default=False
    ),
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            row = (
                _get_instruction_pdf_or_404(
                    cur,
                    pdf_id,
                )
            )

    path = _PdfPath(
        row["file_path"]
    )

    try:
        resolved = (
            path.resolve()
        )

        storage = (
            PDF_STORAGE_DIR
            .resolve()
        )

        resolved.relative_to(
            storage
        )

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieprawidłowa ścieżka pliku PDF"
            ),
        ) from exc

    if not resolved.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                "Plik PDF nie istnieje na dysku"
            ),
        )

    disposition = (
        "attachment"
        if download
        else "inline"
    )

    filename = (
        row["stored_filename"]
    )

    return FileResponse(
        path=str(
            resolved
        ),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'{disposition}; '
                f'filename="{filename}"'
            )
        },
    )


@app.delete(
    "/order-instructions/{pdf_id}"
)
def delete_order_instruction_pdf(
    pdf_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            row = (
                _get_instruction_pdf_or_404(
                    cur,
                    pdf_id,
                )
            )

            path = _PdfPath(
                row["file_path"]
            )

            cur.execute(
                """
                DELETE FROM
                    order_instruction_pdfs
                WHERE id = %s
                """,
                (pdf_id,),
            )

        conn.commit()

    try:
        resolved = path.resolve()
        storage = (
            PDF_STORAGE_DIR.resolve()
        )

        resolved.relative_to(
            storage
        )

        resolved.unlink(
            missing_ok=True
        )

    except Exception:
        pass

    return {
        "ok": True,
        "message": (
            "Usunięto instrukcję PDF"
        ),
    }

# === YOKAI OPERATIONS AND FINANCE V0.22 ===

from datetime import date as _OpsDate
from datetime import timedelta as _OpsTimedelta
from decimal import Decimal as _OpsDecimal


class OrderPlanningUpdate(BaseModel):
    deadline: _OpsDate | None = None
    priority: str = Field(
        default="normal",
        min_length=1,
        max_length=20,
    )
    production_bucket: str = Field(
        default="later",
        min_length=1,
        max_length=20,
    )


class OrderMaterialUsageCreate(BaseModel):
    material_id: int = Field(gt=0)
    used_length_m: _OpsDecimal = Field(
        gt=0,
        le=100000,
    )
    notes: str | None = Field(
        default=None,
        max_length=1000,
    )


_OPS_PRIORITIES = {
    "low",
    "normal",
    "high",
    "urgent",
}

_OPS_BUCKETS = {
    "today",
    "tomorrow",
    "later",
}


def _ops_decimal(
    value: object,
) -> _OpsDecimal:
    return _OpsDecimal(
        str(value or 0)
    )


def _ops_money(
    value: object,
) -> float:
    return float(
        _ops_decimal(value)
        .quantize(
            _OpsDecimal("0.01")
        )
    )


def _ops_number(
    value: object,
    places: str = "0.0001",
) -> float:
    return float(
        _ops_decimal(value)
        .quantize(
            _OpsDecimal(places)
        )
    )


def _ops_is_overdue(
    deadline: object,
    order_status: object,
) -> bool:
    if deadline is None:
        return False

    if str(order_status or "") in {
        "Zrealizowane",
        "Anulowane",
    }:
        return False

    if isinstance(
        deadline,
        _OpsDate,
    ):
        due = deadline
    else:
        try:
            due = _OpsDate.fromisoformat(
                str(deadline)[:10]
            )
        except ValueError:
            return False

    return due < _OpsDate.today()


def _ensure_ops_schema(
    cur,
) -> None:
    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS
            priority TEXT
            NOT NULL
            DEFAULT 'normal'
        """
    )

    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS
            production_bucket TEXT
            NOT NULL
            DEFAULT 'later'
        """
    )

    cur.execute(
        """
        UPDATE orders
        SET priority = 'normal'
        WHERE
            priority IS NULL
            OR priority NOT IN (
                'low',
                'normal',
                'high',
                'urgent'
            )
        """
    )

    cur.execute(
        """
        UPDATE orders
        SET production_bucket = 'later'
        WHERE
            production_bucket IS NULL
            OR production_bucket NOT IN (
                'today',
                'tomorrow',
                'later'
            )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS
            order_material_usage (
                id BIGSERIAL PRIMARY KEY,
                order_id BIGINT NOT NULL
                    REFERENCES orders(id)
                    ON DELETE CASCADE,
                material_id BIGINT
                    REFERENCES materials(id)
                    ON DELETE SET NULL,
                material_name TEXT NOT NULL,
                material_color_name TEXT,
                material_color_code TEXT,
                used_length_m NUMERIC(14,4)
                    NOT NULL,
                cost_per_linear_m NUMERIC(14,6)
                    NOT NULL,
                cost_snapshot NUMERIC(14,2)
                    NOT NULL,
                stock_deducted BOOLEAN
                    NOT NULL
                    DEFAULT FALSE,
                stock_deducted_length_m
                    NUMERIC(14,4)
                    NOT NULL
                    DEFAULT 0,
                calculator_covered_length_m
                    NUMERIC(14,4)
                    NOT NULL
                    DEFAULT 0,
                notes TEXT,
                created_at TIMESTAMPTZ
                    NOT NULL
                    DEFAULT NOW(),
                updated_at TIMESTAMPTZ
                    NOT NULL
                    DEFAULT NOW()
            )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS
            order_material_usage_order_index
        ON order_material_usage (
            order_id,
            created_at DESC
        )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS
            order_material_usage_material_index
        ON order_material_usage (
            material_id
        )
        """
    )


def _ops_latest_calculation(
    cur,
    order_id: int,
) -> dict | None:
    cur.execute(
        """
        SELECT
            calculation_number,
            material_cost,
            labor_cost,
            total_cost,
            suggested_price,
            profit,
            stock_deducted,
            created_at
        FROM calculations
        WHERE
            order_id = %s
            AND COALESCE(
                is_deleted,
                FALSE
            ) = FALSE
        ORDER BY
            created_at DESC,
            id DESC
        LIMIT 1
        """,
        (order_id,),
    )

    return cur.fetchone()


def _ops_usage_total(
    cur,
    order_id: int,
) -> dict:
    cur.execute(
        """
        SELECT
            COUNT(*) AS usage_count,
            COALESCE(
                SUM(cost_snapshot),
                0
            ) AS material_cost,
            COALESCE(
                SUM(used_length_m),
                0
            ) AS used_length_m
        FROM order_material_usage
        WHERE order_id = %s
        """,
        (order_id,),
    )

    return (
        cur.fetchone()
        or {
            "usage_count": 0,
            "material_cost": 0,
            "used_length_m": 0,
        }
    )


def _ops_order_snapshot(
    cur,
    order_id: int,
) -> dict:
    order = get_order_or_404(
        cur,
        order_id,
    )

    usage = _ops_usage_total(
        cur,
        order_id,
    )

    calculation = (
        _ops_latest_calculation(
            cur,
            order_id,
        )
    )

    usage_count = int(
        usage.get(
            "usage_count"
        )
        or 0
    )

    if usage_count > 0:
        material_cost = _ops_decimal(
            usage.get(
                "material_cost"
            )
        )

        material_cost_source = (
            "actual_usage"
        )

    elif calculation:
        material_cost = _ops_decimal(
            calculation.get(
                "material_cost"
            )
        )

        material_cost_source = (
            "calculation"
        )

    else:
        material_cost = (
            _OpsDecimal("0")
        )

        material_cost_source = (
            "none"
        )

    labor_cost = (
        _ops_decimal(
            calculation.get(
                "labor_cost"
            )
        )
        if calculation
        else _OpsDecimal("0")
    )

    revenue = _ops_decimal(
        order.get(
            "price"
        )
    )

    paid = _ops_decimal(
        order.get(
            "paid_amount"
        )
    )

    total_cost = (
        material_cost
        + labor_cost
    )

    estimated_profit = (
        revenue
        - total_cost
    )

    margin_percent = (
        estimated_profit
        / revenue
        * _OpsDecimal("100")
        if revenue > 0
        else _OpsDecimal("0")
    )

    deadline = order.get(
        "deadline"
    )

    priority = (
        order.get(
            "priority"
        )
        or "normal"
    )

    production_bucket = (
        order.get(
            "production_bucket"
        )
        or "later"
    )

    return {
        "order_id": int(
            order["id"]
        ),
        "order_number": (
            order.get(
                "order_number"
            )
            or f"YK-{order_id:05d}"
        ),
        "client_name": (
            order.get(
                "client_name"
            )
            or ""
        ),
        "order_name": (
            order.get(
                "name"
            )
            or ""
        ),
        "status": (
            order.get(
                "status"
            )
            or ""
        ),
        "deadline": deadline,
        "priority": priority,
        "production_bucket":
            production_bucket,
        "is_overdue":
            _ops_is_overdue(
                deadline,
                order.get(
                    "status"
                ),
            ),
        "price":
            _ops_money(
                revenue
            ),
        "paid_amount":
            _ops_money(
                paid
            ),
        "material_cost":
            _ops_money(
                material_cost
            ),
        "labor_cost":
            _ops_money(
                labor_cost
            ),
        "total_estimated_cost":
            _ops_money(
                total_cost
            ),
        "estimated_profit":
            _ops_money(
                estimated_profit
            ),
        "margin_percent":
            _ops_number(
                margin_percent,
                "0.01",
            ),
        "material_cost_source":
            material_cost_source,
        "material_usage_count":
            usage_count,
        "used_length_m":
            _ops_number(
                usage.get(
                    "used_length_m"
                ),
                "0.0001",
            ),
        "calculation_number": (
            calculation.get(
                "calculation_number"
            )
            if calculation
            else None
        ),
    }


def _ops_calculator_covered_length(
    cur,
    order_id: int,
    material_id: int,
) -> _OpsDecimal:
    cur.execute(
        """
        SELECT
            COALESCE(
                SUM(
                    CASE
                        WHEN
                            (item->>'used_length_m')
                            ~ '^[0-9]+([.][0-9]+)?$'
                        THEN
                            (item->>'used_length_m')
                            ::NUMERIC
                        ELSE 0
                    END
                ),
                0
            ) AS covered_length_m
        FROM calculations c
        CROSS JOIN LATERAL
            jsonb_array_elements(
                c.material_breakdown
            ) AS item
        WHERE
            c.order_id = %s
            AND c.stock_deducted = TRUE
            AND COALESCE(
                c.is_deleted,
                FALSE
            ) = FALSE
            AND (
                item->>'material_id'
            ) = %s
        """,
        (
            order_id,
            str(material_id),
        ),
    )

    row = (
        cur.fetchone()
        or {}
    )

    return _ops_decimal(
        row.get(
            "covered_length_m"
        )
    )


@app.on_event("startup")
def startup_operations_and_finance():
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

        conn.commit()


@app.get(
    "/orders/{order_id}/operations-finance"
)
def get_order_operations_finance(
    order_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            result = (
                _ops_order_snapshot(
                    cur,
                    order_id,
                )
            )

        conn.commit()

    return result


@app.patch(
    "/orders/{order_id}/planning"
)
def update_order_planning(
    order_id: int,
    data: OrderPlanningUpdate,
    user: dict = Depends(
        get_current_user
    ),
):
    priority = (
        data.priority
        .strip()
        .lower()
    )

    production_bucket = (
        data.production_bucket
        .strip()
        .lower()
    )

    if (
        priority
        not in _OPS_PRIORITIES
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieprawidłowy priorytet"
            ),
        )

    if (
        production_bucket
        not in _OPS_BUCKETS
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieprawidłowy plan produkcji"
            ),
        )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                UPDATE orders
                SET
                    deadline = %s,
                    priority = %s,
                    production_bucket = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    data.deadline,
                    priority,
                    production_bucket,
                    order_id,
                ),
            )

            result = (
                _ops_order_snapshot(
                    cur,
                    order_id,
                )
            )

        conn.commit()

    return result


@app.get(
    "/orders/{order_id}/material-usage"
)
def get_order_material_usage(
    order_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                SELECT
                    u.*,
                    m.stock_length_m
                        AS current_stock_length_m
                FROM order_material_usage u
                LEFT JOIN materials m
                    ON m.id = u.material_id
                WHERE u.order_id = %s
                ORDER BY
                    u.created_at DESC,
                    u.id DESC
                """,
                (order_id,),
            )

            rows = cur.fetchall()

        conn.commit()

    result = []

    for row in rows:
        item = dict(row)

        for field in (
            "used_length_m",
            "cost_per_linear_m",
            "cost_snapshot",
            "stock_deducted_length_m",
            "calculator_covered_length_m",
            "current_stock_length_m",
        ):
            value = item.get(
                field
            )

            item[field] = (
                None
                if value is None
                else _ops_number(
                    value
                )
            )

        result.append(
            item
        )

    return result


@app.post(
    "/orders/{order_id}/material-usage",
    status_code=status.HTTP_201_CREATED,
)
def add_order_material_usage(
    order_id: int,
    data: OrderMaterialUsageCreate,
    user: dict = Depends(
        get_current_user
    ),
):
    used_length = _ops_decimal(
        data.used_length_m
    )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                SELECT *
                FROM materials
                WHERE
                    id = %s
                    AND is_archived = FALSE
                FOR UPDATE
                """,
                (data.material_id,),
            )

            material = (
                cur.fetchone()
            )

            if material is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Nie znaleziono aktywnego materiału"
                    ),
                )

            roll_length = _ops_decimal(
                material.get(
                    "roll_length_m"
                )
            )

            purchase_price = _ops_decimal(
                material.get(
                    "purchase_price"
                )
            )

            stock_length = _ops_decimal(
                material.get(
                    "stock_length_m"
                )
            )

            if roll_length <= 0:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Materiał ma nieprawidłową długość rolki"
                    ),
                )

            cost_per_linear_m = (
                purchase_price
                / roll_length
            )

            cost_snapshot = (
                used_length
                * cost_per_linear_m
            )

            calculator_covered = (
                _ops_calculator_covered_length(
                    cur,
                    order_id,
                    data.material_id,
                )
            )

            cur.execute(
                """
                SELECT
                    COALESCE(
                        SUM(used_length_m),
                        0
                    ) AS recorded_length_m
                FROM order_material_usage
                WHERE
                    order_id = %s
                    AND material_id = %s
                """,
                (
                    order_id,
                    data.material_id,
                ),
            )

            recorded_row = (
                cur.fetchone()
                or {}
            )

            recorded_length = (
                _ops_decimal(
                    recorded_row.get(
                        "recorded_length_m"
                    )
                )
            )

            remaining_covered = max(
                calculator_covered
                - recorded_length,
                _OpsDecimal("0"),
            )

            covered_for_this_row = min(
                used_length,
                remaining_covered,
            )

            deduct_length = (
                used_length
                - covered_for_this_row
            )

            if (
                deduct_length
                > stock_length
            ):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Za mało materiału na stanie. "
                        f"Trzeba odjąć "
                        f"{deduct_length.quantize(_OpsDecimal('0.01'))} m, "
                        f"a dostępne jest "
                        f"{stock_length.quantize(_OpsDecimal('0.01'))} m."
                    ),
                )

            if deduct_length > 0:
                cur.execute(
                    """
                    UPDATE materials
                    SET
                        stock_length_m =
                            stock_length_m - %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        deduct_length,
                        data.material_id,
                    ),
                )

            cur.execute(
                """
                INSERT INTO order_material_usage (
                    order_id,
                    material_id,
                    material_name,
                    material_color_name,
                    material_color_code,
                    used_length_m,
                    cost_per_linear_m,
                    cost_snapshot,
                    stock_deducted,
                    stock_deducted_length_m,
                    calculator_covered_length_m,
                    notes
                )
                VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s
                )
                RETURNING *
                """,
                (
                    order_id,
                    data.material_id,
                    material.get(
                        "name"
                    )
                    or (
                        f"Materiał "
                        f"#{data.material_id}"
                    ),
                    material.get(
                        "color_name"
                    ),
                    material.get(
                        "color_code"
                    ),
                    used_length,
                    cost_per_linear_m,
                    cost_snapshot,
                    deduct_length > 0,
                    deduct_length,
                    covered_for_this_row,
                    (
                        data.notes.strip()
                        if data.notes
                        else None
                    ),
                ),
            )

            created = dict(
                cur.fetchone()
            )

            cur.execute(
                """
                SELECT stock_length_m
                FROM materials
                WHERE id = %s
                """,
                (data.material_id,),
            )

            stock_row = (
                cur.fetchone()
                or {}
            )

            created[
                "current_stock_length_m"
            ] = stock_row.get(
                "stock_length_m"
            )

        conn.commit()

    for field in (
        "used_length_m",
        "cost_per_linear_m",
        "cost_snapshot",
        "stock_deducted_length_m",
        "calculator_covered_length_m",
        "current_stock_length_m",
    ):
        value = created.get(
            field
        )

        created[field] = (
            None
            if value is None
            else _ops_number(
                value
            )
        )

    if (
        covered_for_this_row
        >= used_length
    ):
        stock_note = (
            "Stan magazynowy nie został odjęty ponownie — "
            "to zużycie było już rozliczone przez kalkulator."
        )

    elif covered_for_this_row > 0:
        stock_note = (
            f"Kalkulator pokrywał "
            f"{_ops_number(covered_for_this_row)} m. "
            f"Ze stanu odjęto tylko "
            f"{_ops_number(deduct_length)} m różnicy."
        )

    else:
        stock_note = (
            f"Ze stanu magazynowego odjęto "
            f"{_ops_number(deduct_length)} m."
        )

    created[
        "stock_note"
    ] = stock_note

    return created


@app.delete(
    "/order-material-usage/{usage_id}"
)
def delete_order_material_usage(
    usage_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            cur.execute(
                """
                SELECT *
                FROM order_material_usage
                WHERE id = %s
                FOR UPDATE
                """,
                (usage_id,),
            )

            usage = (
                cur.fetchone()
            )

            if usage is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Nie znaleziono wpisu zużycia"
                    ),
                )

            restore_length = (
                _ops_decimal(
                    usage.get(
                        "stock_deducted_length_m"
                    )
                )
            )

            material_id = usage.get(
                "material_id"
            )

            if (
                material_id is not None
                and restore_length > 0
            ):
                cur.execute(
                    """
                    UPDATE materials
                    SET
                        stock_length_m =
                            stock_length_m + %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        restore_length,
                        material_id,
                    ),
                )

            cur.execute(
                """
                DELETE FROM order_material_usage
                WHERE id = %s
                """,
                (usage_id,),
            )

        conn.commit()

    return {
        "ok": True,
        "restored_stock_m":
            _ops_number(
                restore_length
            ),
        "message": (
            "Usunięto zużycie materiału"
        ),
    }


@app.get(
    "/production/planning"
)
def get_production_planning(
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            cur.execute(
                """
                SELECT
                    id,
                    order_number,
                    client_name,
                    name,
                    status,
                    deadline,
                    priority,
                    production_bucket,
                    price,
                    created_at
                FROM orders
                WHERE
                    is_archived = FALSE
                    AND status NOT IN (
                        'Zrealizowane',
                        'Anulowane'
                    )
                ORDER BY
                    CASE priority
                        WHEN 'urgent' THEN 1
                        WHEN 'high' THEN 2
                        WHEN 'normal' THEN 3
                        WHEN 'low' THEN 4
                        ELSE 5
                    END,
                    deadline NULLS LAST,
                    created_at ASC
                """
            )

            rows = cur.fetchall()

        conn.commit()

    result = []

    for row in rows:
        item = dict(row)

        item[
            "is_overdue"
        ] = _ops_is_overdue(
            item.get(
                "deadline"
            ),
            item.get(
                "status"
            ),
        )

        item[
            "price"
        ] = _ops_money(
            item.get(
                "price"
            )
        )

        result.append(
            item
        )

    return result


@app.get(
    "/finance/dashboard"
)
def get_finance_dashboard(
    days: int = Query(
        default=30,
        ge=1,
        le=3650,
    ),
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            cur.execute(
                """
                WITH usage AS (
                    SELECT
                        order_id,
                        COUNT(*) AS usage_count,
                        SUM(cost_snapshot)
                            AS actual_material_cost
                    FROM order_material_usage
                    GROUP BY order_id
                ),
                latest_calculation AS (
                    SELECT DISTINCT ON (
                        order_id
                    )
                        order_id,
                        calculation_number,
                        material_cost,
                        labor_cost,
                        total_cost,
                        created_at
                    FROM calculations
                    WHERE
                        order_id IS NOT NULL
                        AND COALESCE(
                            is_deleted,
                            FALSE
                        ) = FALSE
                    ORDER BY
                        order_id,
                        created_at DESC,
                        id DESC
                )
                SELECT
                    o.id,
                    o.order_number,
                    o.client_name,
                    o.name,
                    o.status,
                    o.price,
                    o.paid_amount,
                    o.deadline,
                    o.priority,
                    o.production_bucket,
                    o.created_at,
                    COALESCE(
                        u.usage_count,
                        0
                    ) AS usage_count,
                    COALESCE(
                        u.actual_material_cost,
                        0
                    ) AS actual_material_cost,
                    COALESCE(
                        lc.material_cost,
                        0
                    ) AS calculated_material_cost,
                    COALESCE(
                        lc.labor_cost,
                        0
                    ) AS labor_cost,
                    lc.calculation_number
                FROM orders o
                LEFT JOIN usage u
                    ON u.order_id = o.id
                LEFT JOIN latest_calculation lc
                    ON lc.order_id = o.id
                WHERE
                    o.is_archived = FALSE
                    AND o.created_at >=
                        NOW()
                        - (
                            %s
                            * INTERVAL '1 day'
                        )
                ORDER BY
                    o.created_at DESC
                """,
                (days,),
            )

            rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                    id,
                    deadline,
                    priority,
                    production_bucket,
                    status
                FROM orders
                WHERE
                    is_archived = FALSE
                    AND status NOT IN (
                        'Zrealizowane',
                        'Anulowane'
                    )
                """
            )

            active_rows = (
                cur.fetchall()
            )

        conn.commit()

    revenue = _OpsDecimal("0")
    paid = _OpsDecimal("0")
    material_cost = _OpsDecimal("0")
    labor_cost = _OpsDecimal("0")
    estimated_profit = _OpsDecimal("0")

    orders = []

    for row in rows:
        item = dict(row)

        row_revenue = _ops_decimal(
            item.get(
                "price"
            )
        )

        row_paid = _ops_decimal(
            item.get(
                "paid_amount"
            )
        )

        usage_count = int(
            item.get(
                "usage_count"
            )
            or 0
        )

        row_material = (
            _ops_decimal(
                item.get(
                    "actual_material_cost"
                )
            )
            if usage_count > 0
            else _ops_decimal(
                item.get(
                    "calculated_material_cost"
                )
            )
        )

        row_labor = _ops_decimal(
            item.get(
                "labor_cost"
            )
        )

        row_profit = (
            row_revenue
            - row_material
            - row_labor
        )

        row_margin = (
            row_profit
            / row_revenue
            * _OpsDecimal("100")
            if row_revenue > 0
            else _OpsDecimal("0")
        )

        revenue += row_revenue
        paid += row_paid
        material_cost += row_material
        labor_cost += row_labor
        estimated_profit += row_profit

        orders.append(
            {
                "id": int(
                    item["id"]
                ),
                "order_number": (
                    item.get(
                        "order_number"
                    )
                    or (
                        f"YK-"
                        f"{int(item['id']):05d}"
                    )
                ),
                "client_name": (
                    item.get(
                        "client_name"
                    )
                    or ""
                ),
                "name": (
                    item.get(
                        "name"
                    )
                    or ""
                ),
                "status": (
                    item.get(
                        "status"
                    )
                    or ""
                ),
                "price":
                    _ops_money(
                        row_revenue
                    ),
                "paid_amount":
                    _ops_money(
                        row_paid
                    ),
                "material_cost":
                    _ops_money(
                        row_material
                    ),
                "labor_cost":
                    _ops_money(
                        row_labor
                    ),
                "estimated_profit":
                    _ops_money(
                        row_profit
                    ),
                "margin_percent":
                    _ops_number(
                        row_margin,
                        "0.01",
                    ),
                "deadline":
                    item.get(
                        "deadline"
                    ),
                "priority": (
                    item.get(
                        "priority"
                    )
                    or "normal"
                ),
                "production_bucket": (
                    item.get(
                        "production_bucket"
                    )
                    or "later"
                ),
                "created_at":
                    item.get(
                        "created_at"
                    ),
                "cost_source": (
                    "actual_usage"
                    if usage_count > 0
                    else (
                        "calculation"
                        if item.get(
                            "calculation_number"
                        )
                        else "none"
                    )
                ),
            }
        )

    overall_margin = (
        estimated_profit
        / revenue
        * _OpsDecimal("100")
        if revenue > 0
        else _OpsDecimal("0")
    )

    planning = {
        "today": 0,
        "tomorrow": 0,
        "later": 0,
        "overdue": 0,
        "urgent": 0,
    }

    overdue_orders = []

    for row in active_rows:
        bucket = (
            row.get(
                "production_bucket"
            )
            or "later"
        )

        if bucket not in {
            "today",
            "tomorrow",
            "later",
        }:
            bucket = "later"

        planning[
            bucket
        ] += 1

        if (
            row.get(
                "priority"
            )
            == "urgent"
        ):
            planning[
                "urgent"
            ] += 1

        if _ops_is_overdue(
            row.get(
                "deadline"
            ),
            row.get(
                "status"
            ),
        ):
            planning[
                "overdue"
            ] += 1

            overdue_orders.append(
                int(
                    row["id"]
                )
            )

    top_orders = sorted(
        orders,
        key=lambda item:
            item[
                "estimated_profit"
            ],
        reverse=True,
    )[:8]

    return {
        "days": days,
        "orders_count":
            len(orders),
        "revenue":
            _ops_money(
                revenue
            ),
        "paid_amount":
            _ops_money(
                paid
            ),
        "outstanding":
            _ops_money(
                max(
                    revenue - paid,
                    _OpsDecimal("0"),
                )
            ),
        "material_cost":
            _ops_money(
                material_cost
            ),
        "labor_cost":
            _ops_money(
                labor_cost
            ),
        "total_estimated_cost":
            _ops_money(
                material_cost
                + labor_cost
            ),
        "estimated_profit":
            _ops_money(
                estimated_profit
            ),
        "margin_percent":
            _ops_number(
                overall_margin,
                "0.01",
            ),
        "planning":
            planning,
        "top_orders":
            top_orders,
        "orders":
            orders[:50],
        "note": (
            "Szacowany zysk = wartość zamówień "
            "- koszt materiałów "
            "- koszt pracy z ostatniej kalkulacji. "
            "Nie uwzględnia podatków."
        ),
    }

# === YOKAI ORDER WORKFLOW V0.23 ===

import uuid as _workflow_uuid


class OrderFulfillmentUpdate(BaseModel):
    fulfillment_method: str = Field(
        default="none",
        min_length=1,
        max_length=20,
    )
    fulfillment_status: str = Field(
        default="pending",
        min_length=1,
        max_length=20,
    )


class OrderInternalNoteCreate(BaseModel):
    content: str = Field(
        min_length=1,
        max_length=6000,
    )


class OrderChecklistCreate(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=180,
    )


class OrderChecklistUpdate(BaseModel):
    is_done: bool


_WORKFLOW_METHODS = {
    "none",
    "shipping",
    "pickup",
}

_WORKFLOW_STATUSES = {
    "pending",
    "ready",
    "completed",
}

_WORKFLOW_DEFAULT_CHECKLIST = [
    "Projekt zweryfikowany",
    "Materiał przygotowany",
    "Wycięte",
    "Wybrane",
    "Nałożony transfer",
    "Kontrola jakości",
    "Zapakowane",
]


def _workflow_actor(
    user: dict,
) -> str:
    for key in (
        "email",
        "username",
        "sub",
    ):
        value = user.get(
            key
        )

        if value:
            return str(value)

    return "YOKAI OS"


def _workflow_add_activity(
    cur,
    order_id: int,
    event_type: str,
    title: str,
    details: str | None = None,
    actor: str | None = None,
    changes: dict | None = None,
) -> None:
    cur.execute(
        """
        INSERT INTO order_activity (
            order_id,
            event_type,
            title,
            details,
            actor,
            changes
        )
        VALUES (
            %s, %s, %s, %s, %s, %s
        )
        """,
        (
            order_id,
            event_type,
            title,
            details,
            actor,
            Jsonb(
                changes or {}
            ),
        ),
    )


def _ensure_workflow_schema(
    cur,
) -> None:
    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS
            fulfillment_method TEXT
            NOT NULL
            DEFAULT 'none'
        """
    )

    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS
            fulfillment_status TEXT
            NOT NULL
            DEFAULT 'pending'
        """
    )

    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS
            checklist_initialized BOOLEAN
            NOT NULL
            DEFAULT FALSE
        """
    )

    cur.execute(
        """
        UPDATE orders
        SET fulfillment_method = 'none'
        WHERE
            fulfillment_method IS NULL
            OR fulfillment_method NOT IN (
                'none',
                'shipping',
                'pickup'
            )
        """
    )

    cur.execute(
        """
        UPDATE orders
        SET fulfillment_status = 'pending'
        WHERE
            fulfillment_status IS NULL
            OR fulfillment_status NOT IN (
                'pending',
                'ready',
                'completed'
            )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS
            order_internal_notes (
                id BIGSERIAL PRIMARY KEY,
                order_id BIGINT NOT NULL
                    REFERENCES orders(id)
                    ON DELETE CASCADE,
                content TEXT NOT NULL,
                author TEXT,
                created_at TIMESTAMPTZ
                    NOT NULL
                    DEFAULT NOW(),
                updated_at TIMESTAMPTZ
                    NOT NULL
                    DEFAULT NOW()
            )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS
            order_internal_notes_order_index
        ON order_internal_notes (
            order_id,
            created_at DESC
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS
            order_checklist_items (
                id BIGSERIAL PRIMARY KEY,
                order_id BIGINT NOT NULL
                    REFERENCES orders(id)
                    ON DELETE CASCADE,
                title TEXT NOT NULL,
                is_done BOOLEAN NOT NULL
                    DEFAULT FALSE,
                sort_order INTEGER NOT NULL
                    DEFAULT 0,
                created_at TIMESTAMPTZ
                    NOT NULL
                    DEFAULT NOW(),
                updated_at TIMESTAMPTZ
                    NOT NULL
                    DEFAULT NOW()
            )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS
            order_checklist_items_order_index
        ON order_checklist_items (
            order_id,
            sort_order,
            id
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS
            order_activity (
                id BIGSERIAL PRIMARY KEY,
                order_id BIGINT NOT NULL
                    REFERENCES orders(id)
                    ON DELETE CASCADE,
                event_type TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT,
                actor TEXT,
                changes JSONB NOT NULL
                    DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ
                    NOT NULL
                    DEFAULT NOW()
            )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS
            order_activity_order_index
        ON order_activity (
            order_id,
            created_at DESC,
            id DESC
        )
        """
    )

    cur.execute(
        """
        CREATE OR REPLACE FUNCTION
            yokai_log_order_update()
        RETURNS TRIGGER AS $$
        DECLARE
            old_row JSONB;
            new_row JSONB;
            field_name TEXT;
            changed JSONB := '{}'::JSONB;
        BEGIN
            old_row := to_jsonb(OLD);
            new_row := to_jsonb(NEW);

            FOREACH field_name IN ARRAY ARRAY[
                'client_name',
                'name',
                'dimension',
                'dimensions',
                'quantity',
                'price',
                'paid_amount',
                'payment_status',
                'status',
                'deadline',
                'priority',
                'production_bucket',
                'fulfillment_method',
                'fulfillment_status',
                'is_archived'
            ]
            LOOP
                IF (
                    old_row -> field_name
                ) IS DISTINCT FROM (
                    new_row -> field_name
                )
                THEN
                    changed := changed
                        || jsonb_build_object(
                            field_name,
                            jsonb_build_object(
                                'old',
                                old_row -> field_name,
                                'new',
                                new_row -> field_name
                            )
                        );
                END IF;
            END LOOP;

            IF changed <> '{}'::JSONB
            THEN
                INSERT INTO order_activity (
                    order_id,
                    event_type,
                    title,
                    details,
                    actor,
                    changes
                )
                VALUES (
                    NEW.id,
                    'order_updated',
                    'Zmieniono zamówienie',
                    NULL,
                    'System',
                    changed
                );
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )

    cur.execute(
        """
        DROP TRIGGER IF EXISTS
            orders_activity_update
        ON orders
        """
    )

    cur.execute(
        """
        CREATE TRIGGER
            orders_activity_update
        AFTER UPDATE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION
            yokai_log_order_update()
        """
    )


def _workflow_initialize_checklist(
    cur,
    order_id: int,
) -> None:
    cur.execute(
        """
        SELECT
            checklist_initialized
        FROM orders
        WHERE id = %s
        FOR UPDATE
        """,
        (order_id,),
    )

    row = cur.fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Nie znaleziono zamówienia"
            ),
        )

    if row.get(
        "checklist_initialized"
    ):
        return

    for index, title in enumerate(
        _WORKFLOW_DEFAULT_CHECKLIST,
        start=10,
    ):
        cur.execute(
            """
            INSERT INTO
                order_checklist_items (
                    order_id,
                    title,
                    sort_order
                )
            VALUES (
                %s, %s, %s
            )
            """,
            (
                order_id,
                title,
                index * 10,
            ),
        )

    cur.execute(
        """
        UPDATE orders
        SET
            checklist_initialized = TRUE,
            updated_at = NOW()
        WHERE id = %s
        """,
        (order_id,),
    )


@app.on_event("startup")
def startup_order_workflow():
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

        conn.commit()


@app.get(
    "/orders/{order_id}/workflow"
)
def get_order_workflow(
    order_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            cur.execute(
                """
                SELECT
                    id,
                    order_number,
                    client_name,
                    name,
                    status,
                    fulfillment_method,
                    fulfillment_status
                FROM orders
                WHERE id = %s
                """,
                (order_id,),
            )

            row = cur.fetchone()

            if row is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Nie znaleziono zamówienia"
                    ),
                )

        conn.commit()

    return dict(
        row
    )


@app.patch(
    "/orders/{order_id}/fulfillment"
)
def update_order_fulfillment(
    order_id: int,
    data: OrderFulfillmentUpdate,
    user: dict = Depends(
        get_current_user
    ),
):
    method = (
        data.fulfillment_method
        .strip()
        .lower()
    )

    fulfillment_status = (
        data.fulfillment_status
        .strip()
        .lower()
    )

    if method not in (
        _WORKFLOW_METHODS
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieprawidłowy sposób przekazania"
            ),
        )

    if fulfillment_status not in (
        _WORKFLOW_STATUSES
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieprawidłowy status wydania"
            ),
        )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                UPDATE orders
                SET
                    fulfillment_method = %s,
                    fulfillment_status = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING
                    id,
                    order_number,
                    client_name,
                    name,
                    status,
                    fulfillment_method,
                    fulfillment_status
                """,
                (
                    method,
                    fulfillment_status,
                    order_id,
                ),
            )

            result = dict(
                cur.fetchone()
            )

        conn.commit()

    return result


@app.post(
    "/orders/{order_id}/duplicate",
    status_code=status.HTTP_201_CREATED,
)
def duplicate_order(
    order_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            cur.execute(
                """
                SELECT *
                FROM orders
                WHERE id = %s
                FOR SHARE
                """,
                (order_id,),
            )

            source = cur.fetchone()

            if source is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Nie znaleziono zamówienia"
                    ),
                )

            copy_fields = [
                "client_id",
                "client_name",
                "name",
                "dimension",
                "dimensions",
                "quantity",
                "price",
                "notes",
            ]

            values = {}

            for field_name in copy_fields:
                if field_name in source:
                    values[
                        field_name
                    ] = source.get(
                        field_name
                    )

            overrides = {
                "source":
                    "Ponowienie",
                "paid_amount":
                    0,
                "payment_status":
                    "Nieopłacone",
                "status":
                    "Nowe",
                "deadline":
                    None,
                "priority":
                    "normal",
                "production_bucket":
                    "later",
                "fulfillment_method":
                    "none",
                "fulfillment_status":
                    "pending",
                "checklist_initialized":
                    False,
                "is_archived":
                    False,
            }

            for (
                field_name,
                value,
            ) in overrides.items():
                if field_name in source:
                    values[
                        field_name
                    ] = value

            if (
                "order_number"
                in source
            ):
                values[
                    "order_number"
                ] = (
                    "TEMP-"
                    + _workflow_uuid
                    .uuid4()
                    .hex[:12]
                )

            if not values:
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "Nie udało się przygotować kopii zamówienia"
                    ),
                )

            columns = list(
                values.keys()
            )

            placeholders = ", ".join(
                ["%s"] * len(
                    columns
                )
            )

            column_sql = ", ".join(
                columns
            )

            cur.execute(
                f"""
                INSERT INTO orders (
                    {column_sql}
                )
                VALUES (
                    {placeholders}
                )
                RETURNING id
                """,
                tuple(
                    values[
                        column
                    ]
                    for column
                    in columns
                ),
            )

            created_id = int(
                cur.fetchone()[
                    "id"
                ]
            )

            if (
                "order_number"
                in source
            ):
                new_number = (
                    f"YK-{created_id:05d}"
                )

                cur.execute(
                    """
                    UPDATE orders
                    SET
                        order_number = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        new_number,
                        created_id,
                    ),
                )

            _workflow_add_activity(
                cur,
                order_id,
                "duplicated",
                "Utworzono ponowne zamówienie",
                (
                    f"Nowe zamówienie: "
                    f"YK-{created_id:05d}"
                ),
                _workflow_actor(
                    user
                ),
            )

            _workflow_add_activity(
                cur,
                created_id,
                "duplicate_created",
                "Zamówienie utworzone jako kopia",
                (
                    f"Źródło: "
                    f"{source.get('order_number') or order_id}"
                ),
                _workflow_actor(
                    user
                ),
            )

            result = (
                get_order_or_404(
                    cur,
                    created_id,
                )
            )

        conn.commit()

    return result


@app.get(
    "/orders/{order_id}/internal-notes"
)
def get_order_internal_notes(
    order_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                SELECT *
                FROM order_internal_notes
                WHERE order_id = %s
                ORDER BY
                    created_at DESC,
                    id DESC
                """,
                (order_id,),
            )

            rows = cur.fetchall()

        conn.commit()

    return [
        dict(row)
        for row in rows
    ]


@app.post(
    "/orders/{order_id}/internal-notes",
    status_code=status.HTTP_201_CREATED,
)
def add_order_internal_note(
    order_id: int,
    data: OrderInternalNoteCreate,
    user: dict = Depends(
        get_current_user
    ),
):
    content = (
        data.content.strip()
    )

    if not content:
        raise HTTPException(
            status_code=400,
            detail=(
                "Notatka jest pusta"
            ),
        )

    actor = _workflow_actor(
        user
    )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                INSERT INTO
                    order_internal_notes (
                        order_id,
                        content,
                        author
                    )
                VALUES (
                    %s, %s, %s
                )
                RETURNING *
                """,
                (
                    order_id,
                    content,
                    actor,
                ),
            )

            created = dict(
                cur.fetchone()
            )

            _workflow_add_activity(
                cur,
                order_id,
                "note_added",
                "Dodano notatkę wewnętrzną",
                (
                    content[:160]
                    + (
                        "…"
                        if len(
                            content
                        ) > 160
                        else ""
                    )
                ),
                actor,
            )

        conn.commit()

    return created


@app.delete(
    "/order-internal-notes/{note_id}"
)
def delete_order_internal_note(
    note_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    actor = _workflow_actor(
        user
    )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            cur.execute(
                """
                SELECT *
                FROM order_internal_notes
                WHERE id = %s
                FOR UPDATE
                """,
                (note_id,),
            )

            note = cur.fetchone()

            if note is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Nie znaleziono notatki"
                    ),
                )

            order_id = int(
                note["order_id"]
            )

            cur.execute(
                """
                DELETE FROM
                    order_internal_notes
                WHERE id = %s
                """,
                (note_id,),
            )

            _workflow_add_activity(
                cur,
                order_id,
                "note_deleted",
                "Usunięto notatkę wewnętrzną",
                None,
                actor,
            )

        conn.commit()

    return {
        "ok": True,
    }


@app.get(
    "/orders/{order_id}/checklist"
)
def get_order_checklist(
    order_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            _workflow_initialize_checklist(
                cur,
                order_id,
            )

            cur.execute(
                """
                SELECT *
                FROM order_checklist_items
                WHERE order_id = %s
                ORDER BY
                    sort_order,
                    id
                """,
                (order_id,),
            )

            rows = cur.fetchall()

        conn.commit()

    return [
        dict(row)
        for row in rows
    ]


@app.post(
    "/orders/{order_id}/checklist",
    status_code=status.HTTP_201_CREATED,
)
def add_order_checklist_item(
    order_id: int,
    data: OrderChecklistCreate,
    user: dict = Depends(
        get_current_user
    ),
):
    title = (
        data.title.strip()
    )

    if not title:
        raise HTTPException(
            status_code=400,
            detail=(
                "Nazwa zadania jest pusta"
            ),
        )

    actor = _workflow_actor(
        user
    )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            _workflow_initialize_checklist(
                cur,
                order_id,
            )

            cur.execute(
                """
                SELECT
                    COALESCE(
                        MAX(sort_order),
                        0
                    ) + 10 AS next_sort
                FROM order_checklist_items
                WHERE order_id = %s
                """,
                (order_id,),
            )

            next_sort = int(
                (
                    cur.fetchone()
                    or {}
                ).get(
                    "next_sort"
                )
                or 10
            )

            cur.execute(
                """
                INSERT INTO
                    order_checklist_items (
                        order_id,
                        title,
                        sort_order
                    )
                VALUES (
                    %s, %s, %s
                )
                RETURNING *
                """,
                (
                    order_id,
                    title,
                    next_sort,
                ),
            )

            created = dict(
                cur.fetchone()
            )

            _workflow_add_activity(
                cur,
                order_id,
                "checklist_added",
                "Dodano zadanie do checklisty",
                title,
                actor,
            )

        conn.commit()

    return created


@app.patch(
    "/order-checklist/{item_id}"
)
def update_order_checklist_item(
    item_id: int,
    data: OrderChecklistUpdate,
    user: dict = Depends(
        get_current_user
    ),
):
    actor = _workflow_actor(
        user
    )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            cur.execute(
                """
                SELECT *
                FROM order_checklist_items
                WHERE id = %s
                FOR UPDATE
                """,
                (item_id,),
            )

            current = cur.fetchone()

            if current is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Nie znaleziono zadania checklisty"
                    ),
                )

            cur.execute(
                """
                UPDATE order_checklist_items
                SET
                    is_done = %s,
                    updated_at = NOW()
                WHERE id = %s
                RETURNING *
                """,
                (
                    data.is_done,
                    item_id,
                ),
            )

            updated = dict(
                cur.fetchone()
            )

            if (
                bool(
                    current.get(
                        "is_done"
                    )
                )
                != data.is_done
            ):
                _workflow_add_activity(
                    cur,
                    int(
                        current[
                            "order_id"
                        ]
                    ),
                    "checklist_changed",
                    (
                        "Wykonano zadanie"
                        if data.is_done
                        else "Cofnięto zadanie"
                    ),
                    str(
                        current[
                            "title"
                        ]
                    ),
                    actor,
                )

        conn.commit()

    return updated


@app.delete(
    "/order-checklist/{item_id}"
)
def delete_order_checklist_item(
    item_id: int,
    user: dict = Depends(
        get_current_user
    ),
):
    actor = _workflow_actor(
        user
    )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            cur.execute(
                """
                SELECT *
                FROM order_checklist_items
                WHERE id = %s
                FOR UPDATE
                """,
                (item_id,),
            )

            item = cur.fetchone()

            if item is None:
                raise HTTPException(
                    status_code=404,
                    detail=(
                        "Nie znaleziono zadania checklisty"
                    ),
                )

            cur.execute(
                """
                DELETE FROM
                    order_checklist_items
                WHERE id = %s
                """,
                (item_id,),
            )

            _workflow_add_activity(
                cur,
                int(
                    item[
                        "order_id"
                    ]
                ),
                "checklist_deleted",
                "Usunięto zadanie z checklisty",
                str(
                    item[
                        "title"
                    ]
                ),
                actor,
            )

        conn.commit()

    return {
        "ok": True,
    }


@app.get(
    "/orders/{order_id}/activity"
)
def get_order_activity(
    order_id: int,
    limit: int = Query(
        default=80,
        ge=1,
        le=300,
    ),
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_workflow_schema(
                cur
            )

            get_order_or_404(
                cur,
                order_id,
            )

            cur.execute(
                """
                SELECT *
                FROM order_activity
                WHERE order_id = %s
                ORDER BY
                    created_at DESC,
                    id DESC
                LIMIT %s
                """,
                (
                    order_id,
                    limit,
                ),
            )

            rows = cur.fetchall()

        conn.commit()

    return [
        dict(row)
        for row in rows
    ]

# === YOKAI DAILY COMMAND CENTER V0.24 ===


class DashboardQuickAction(BaseModel):
    action: str = Field(
        min_length=1,
        max_length=40,
    )


_DASHBOARD_QUICK_ACTIONS = {
    "move_today",
    "move_tomorrow",
    "next_status",
    "mark_ready",
    "mark_paid",
    "mark_fulfilled",
}


def _dashboard_column_exists(
    cur,
    table_name: str,
    column_name: str,
) -> bool:
    cur.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE
                table_schema = 'public'
                AND table_name = %s
                AND column_name = %s
        ) AS exists
        """,
        (
            table_name,
            column_name,
        ),
    )

    row = (
        cur.fetchone()
        or {}
    )

    return bool(
        row.get(
            "exists"
        )
    )


def _dashboard_low_stock(
    cur,
) -> list[dict]:
    threshold_candidates = [
        "low_stock_threshold_m",
        "low_threshold_m",
        "low_stock_threshold",
        "low_threshold",
    ]

    threshold_column = None

    for column_name in threshold_candidates:
        if _dashboard_column_exists(
            cur,
            "materials",
            column_name,
        ):
            threshold_column = (
                column_name
            )
            break

    if threshold_column is None:
        return []

    cur.execute(
        f"""
        SELECT
            id,
            name,
            color_name,
            color_code,
            stock_length_m,
            {threshold_column}
                AS threshold_m
        FROM materials
        WHERE
            is_archived = FALSE
            AND COALESCE(
                stock_length_m,
                0
            ) <= COALESCE(
                {threshold_column},
                0
            )
            AND COALESCE(
                {threshold_column},
                0
            ) > 0
        ORDER BY
            COALESCE(
                stock_length_m,
                0
            ) ASC,
            name
        LIMIT 30
        """
    )

    rows = cur.fetchall()

    result = []

    for row in rows:
        item = dict(
            row
        )

        item[
            "stock_length_m"
        ] = _ops_number(
            item.get(
                "stock_length_m"
            )
        )

        item[
            "threshold_m"
        ] = _ops_number(
            item.get(
                "threshold_m"
            )
        )

        result.append(
            item
        )

    return result


def _dashboard_priority_weight(
    value: object,
) -> int:
    return {
        "urgent": 0,
        "high": 1,
        "normal": 2,
        "low": 3,
    }.get(
        str(value or "normal"),
        4,
    )


def _dashboard_order_sort_key(
    item: dict,
) -> tuple:
    deadline = item.get(
        "deadline"
    )

    deadline_key = (
        str(deadline)
        if deadline
        else "9999-12-31"
    )

    return (
        0
        if item.get(
            "is_overdue"
        )
        else 1,
        _dashboard_priority_weight(
            item.get(
                "priority"
            )
        ),
        0
        if item.get(
            "production_bucket"
        ) == "today"
        else 1,
        deadline_key,
        str(
            item.get(
                "created_at"
            )
            or ""
        ),
    )


def _dashboard_order_row(
    cur,
    row: dict,
) -> dict:
    item = dict(
        row
    )

    item[
        "id"
    ] = int(
        item[
            "id"
        ]
    )

    item[
        "price"
    ] = _ops_money(
        item.get(
            "price"
        )
    )

    item[
        "paid_amount"
    ] = _ops_money(
        item.get(
            "paid_amount"
        )
    )

    item[
        "is_overdue"
    ] = _ops_is_overdue(
        item.get(
            "deadline"
        ),
        item.get(
            "status"
        ),
    )

    item[
        "is_unpaid"
    ] = (
        _ops_decimal(
            item.get(
                "price"
            )
        )
        > _ops_decimal(
            item.get(
                "paid_amount"
            )
        )
    )

    item[
        "missing_client"
    ] = (
        item.get(
            "client_id"
        )
        is None
    )

    cur.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM svg_assets
            WHERE
                order_id = %s
                AND is_archived = FALSE
        ) AS has_svg
        """,
        (
            item[
                "id"
            ],
        ),
    )

    svg_row = (
        cur.fetchone()
        or {}
    )

    item[
        "missing_svg"
    ] = not bool(
        svg_row.get(
            "has_svg"
        )
    )

    try:
        snapshot = (
            _ops_order_snapshot(
                cur,
                item[
                    "id"
                ],
            )
        )

        item[
            "estimated_profit"
        ] = snapshot.get(
            "estimated_profit",
            0,
        )

        item[
            "margin_percent"
        ] = snapshot.get(
            "margin_percent",
            0,
        )

    except Exception:
        item[
            "estimated_profit"
        ] = 0

        item[
            "margin_percent"
        ] = 0

    return item


@app.on_event("startup")
def startup_daily_command_center():
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            _ensure_workflow_schema(
                cur
            )

            cur.execute(
                """
                CREATE OR REPLACE FUNCTION
                    yokai_checklist_auto_ready()
                RETURNS TRIGGER AS $$
                DECLARE
                    target_order_id BIGINT;
                    total_count INTEGER;
                    open_count INTEGER;
                BEGIN
                    IF TG_OP = 'DELETE'
                    THEN
                        target_order_id :=
                            OLD.order_id;
                    ELSE
                        target_order_id :=
                            NEW.order_id;
                    END IF;

                    SELECT
                        COUNT(*),
                        COUNT(*) FILTER (
                            WHERE is_done = FALSE
                        )
                    INTO
                        total_count,
                        open_count
                    FROM order_checklist_items
                    WHERE
                        order_id =
                            target_order_id;

                    IF
                        total_count > 0
                        AND open_count = 0
                    THEN
                        UPDATE orders
                        SET
                            status = 'Gotowe',
                            fulfillment_status =
                                CASE
                                    WHEN
                                        fulfillment_method
                                        IN (
                                            'shipping',
                                            'pickup'
                                        )
                                    THEN 'ready'
                                    ELSE
                                        fulfillment_status
                                END,
                            updated_at = NOW()
                        WHERE
                            id = target_order_id
                            AND status NOT IN (
                                'Gotowe',
                                'Zrealizowane',
                                'Anulowane'
                            );
                    END IF;

                    IF TG_OP = 'DELETE'
                    THEN
                        RETURN OLD;
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql
                """
            )

            cur.execute(
                """
                DROP TRIGGER IF EXISTS
                    order_checklist_auto_ready
                ON order_checklist_items
                """
            )

            cur.execute(
                """
                CREATE TRIGGER
                    order_checklist_auto_ready
                AFTER INSERT OR UPDATE OR DELETE
                ON order_checklist_items
                FOR EACH ROW
                EXECUTE FUNCTION
                    yokai_checklist_auto_ready()
                """
            )

        conn.commit()


@app.get(
    "/dashboard/today"
)
def get_dashboard_today(
    user: dict = Depends(
        get_current_user
    ),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            _ensure_workflow_schema(
                cur
            )

            cur.execute(
                """
                SELECT
                    id,
                    order_number,
                    client_id,
                    client_name,
                    name,
                    status,
                    payment_status,
                    price,
                    paid_amount,
                    deadline,
                    priority,
                    production_bucket,
                    fulfillment_method,
                    fulfillment_status,
                    created_at
                FROM orders
                WHERE
                    is_archived = FALSE
                    AND status NOT IN (
                        'Zrealizowane',
                        'Anulowane'
                    )
                ORDER BY
                    created_at ASC
                LIMIT 500
                """
            )

            rows = (
                cur.fetchall()
            )

            orders = [
                _dashboard_order_row(
                    cur,
                    row,
                )
                for row in rows
            ]

            low_stock = (
                _dashboard_low_stock(
                    cur
                )
            )

        conn.commit()

    today_orders = [
        item
        for item in orders
        if item.get(
            "production_bucket"
        ) == "today"
    ]

    urgent_orders = [
        item
        for item in orders
        if item.get(
            "priority"
        ) == "urgent"
    ]

    overdue_orders = [
        item
        for item in orders
        if item.get(
            "is_overdue"
        )
    ]

    ready_orders = [
        item
        for item in orders
        if item.get(
            "fulfillment_status"
        ) == "ready"
    ]

    unpaid_orders = [
        item
        for item in orders
        if item.get(
            "is_unpaid"
        )
    ]

    missing_svg_orders = [
        item
        for item in orders
        if item.get(
            "missing_svg"
        )
    ]

    missing_client_orders = [
        item
        for item in orders
        if item.get(
            "missing_client"
        )
    ]

    focus_map = {}

    for item in (
        today_orders
        + overdue_orders
        + urgent_orders
    ):
        focus_map[
            item[
                "id"
            ]
        ] = item

    focus_orders = sorted(
        focus_map.values(),
        key=_dashboard_order_sort_key,
    )[:30]

    attention = []

    for item in overdue_orders:
        attention.append(
            {
                "key": (
                    f"overdue-"
                    f"{item['id']}"
                ),
                "type":
                    "overdue",
                "severity":
                    "danger",
                "order_id":
                    item[
                        "id"
                    ],
                "title":
                    (
                        f"{item['order_number']} "
                        f"po terminie"
                    ),
                "detail":
                    (
                        f"{item.get('client_name') or 'Bez klienta'}"
                        f" · termin "
                        f"{item.get('deadline') or 'brak'}"
                    ),
            }
        )

    for item in urgent_orders:
        if item.get(
            "is_overdue"
        ):
            continue

        attention.append(
            {
                "key": (
                    f"urgent-"
                    f"{item['id']}"
                ),
                "type":
                    "urgent",
                "severity":
                    "warning",
                "order_id":
                    item[
                        "id"
                    ],
                "title":
                    (
                        f"{item['order_number']} "
                        f"ma priorytet PILNY"
                    ),
                "detail":
                    (
                        item.get(
                            "client_name"
                        )
                        or "Bez klienta"
                    ),
            }
        )

    for item in missing_svg_orders:
        attention.append(
            {
                "key": (
                    f"svg-"
                    f"{item['id']}"
                ),
                "type":
                    "missing_svg",
                "severity":
                    "warning",
                "order_id":
                    item[
                        "id"
                    ],
                "title":
                    (
                        f"{item['order_number']} "
                        f"nie ma SVG"
                    ),
                "detail":
                    (
                        item.get(
                            "client_name"
                        )
                        or "Bez klienta"
                    ),
            }
        )

    for item in ready_orders:
        if not item.get(
            "is_unpaid"
        ):
            continue

        attention.append(
            {
                "key": (
                    f"ready-unpaid-"
                    f"{item['id']}"
                ),
                "type":
                    "ready_unpaid",
                "severity":
                    "danger",
                "order_id":
                    item[
                        "id"
                    ],
                "title":
                    (
                        f"{item['order_number']} "
                        f"gotowe, ale nieopłacone"
                    ),
                "detail":
                    (
                        f"Pozostało "
                        f"{_ops_money(
                            _ops_decimal(item.get('price'))
                            - _ops_decimal(item.get('paid_amount'))
                        ):.2f} zł"
                    ),
            }
        )

    for item in missing_client_orders:
        attention.append(
            {
                "key": (
                    f"client-"
                    f"{item['id']}"
                ),
                "type":
                    "missing_client",
                "severity":
                    "info",
                "order_id":
                    item[
                        "id"
                    ],
                "title":
                    (
                        f"{item['order_number']} "
                        f"nie ma przypisanej karty klienta"
                    ),
                "detail":
                    (
                        item.get(
                            "client_name"
                        )
                        or "Brak nazwy klienta"
                    ),
            }
        )

    for material in low_stock:
        attention.append(
            {
                "key": (
                    f"material-"
                    f"{material['id']}"
                ),
                "type":
                    "low_stock",
                "severity":
                    "warning",
                "material_id":
                    material[
                        "id"
                    ],
                "title":
                    (
                        f"Niski stan: "
                        f"{material.get('name') or 'Materiał'}"
                    ),
                "detail":
                    (
                        f"{material.get('color_name') or ''}"
                        f" · stan "
                        f"{material.get('stock_length_m')} m"
                        f" / próg "
                        f"{material.get('threshold_m')} m"
                    ).strip(
                        " ·"
                    ),
            }
        )

    severity_weight = {
        "danger": 0,
        "warning": 1,
        "info": 2,
    }

    attention = sorted(
        attention,
        key=lambda item: (
            severity_weight.get(
                item.get(
                    "severity"
                ),
                3,
            ),
            item.get(
                "title"
            )
            or "",
        ),
    )[:60]

    today_revenue = sum(
        (
            _ops_decimal(
                item.get(
                    "price"
                )
            )
            for item
            in today_orders
        ),
        _OpsDecimal("0"),
    )

    today_profit = sum(
        (
            _ops_decimal(
                item.get(
                    "estimated_profit"
                )
            )
            for item
            in today_orders
        ),
        _OpsDecimal("0"),
    )

    return {
        "generated_at":
            datetime.now(),
        "stats": {
            "today":
                len(
                    today_orders
                ),
            "urgent":
                len(
                    urgent_orders
                ),
            "overdue":
                len(
                    overdue_orders
                ),
            "ready":
                len(
                    ready_orders
                ),
            "unpaid":
                len(
                    unpaid_orders
                ),
            "missing_svg":
                len(
                    missing_svg_orders
                ),
            "missing_client":
                len(
                    missing_client_orders
                ),
            "low_stock":
                len(
                    low_stock
                ),
            "attention_count":
                len(
                    attention
                ),
            "today_revenue":
                _ops_money(
                    today_revenue
                ),
            "today_profit":
                _ops_money(
                    today_profit
                ),
        },
        "focus_orders":
            focus_orders,
        "attention":
            attention,
        "low_stock":
            low_stock,
    }


@app.post(
    "/orders/{order_id}/quick-action"
)
def run_dashboard_quick_action(
    order_id: int,
    data: DashboardQuickAction,
    user: dict = Depends(
        get_current_user
    ),
):
    action = (
        data.action
        .strip()
        .lower()
    )

    if (
        action
        not in _DASHBOARD_QUICK_ACTIONS
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Nieobsługiwana szybka akcja"
            ),
        )

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_ops_schema(
                cur
            )

            _ensure_workflow_schema(
                cur
            )

            order = get_order_or_404(
                cur,
                order_id,
            )

            message = ""

            if action == "move_today":
                cur.execute(
                    """
                    UPDATE orders
                    SET
                        production_bucket = 'today',
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        order_id,
                    ),
                )

                message = (
                    "Przeniesiono na dziś"
                )

            elif action == "move_tomorrow":
                cur.execute(
                    """
                    UPDATE orders
                    SET
                        production_bucket = 'tomorrow',
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        order_id,
                    ),
                )

                message = (
                    "Przeniesiono na jutro"
                )

            elif action == "mark_paid":
                cur.execute(
                    """
                    UPDATE orders
                    SET
                        paid_amount = price,
                        payment_status = 'Opłacone',
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        order_id,
                    ),
                )

                message = (
                    "Oznaczono jako opłacone"
                )

            elif action == "mark_ready":
                cur.execute(
                    """
                    UPDATE orders
                    SET
                        status = 'Gotowe',
                        fulfillment_status = 'ready',
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        order_id,
                    ),
                )

                message = (
                    "Oznaczono jako gotowe"
                )

            elif action == "mark_fulfilled":
                cur.execute(
                    """
                    UPDATE orders
                    SET
                        status = 'Zrealizowane',
                        fulfillment_status = 'completed',
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        order_id,
                    ),
                )

                message = (
                    "Oznaczono jako wydane / wysłane"
                )

            elif action == "next_status":
                status_sequence = {
                    "Nowe":
                        "Projekt",
                    "Projekt":
                        "Produkcja",
                    "Produkcja":
                        "Gotowe",
                    "Gotowe":
                        "Zrealizowane",
                }

                current_status = str(
                    order.get(
                        "status"
                    )
                    or "Nowe"
                )

                next_status = (
                    status_sequence.get(
                        current_status
                    )
                )

                if next_status is None:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Dla tego statusu nie ma kolejnego kroku"
                        ),
                    )

                fulfillment_status = (
                    "ready"
                    if next_status
                    == "Gotowe"
                    else (
                        "completed"
                        if next_status
                        == "Zrealizowane"
                        else None
                    )
                )

                if (
                    fulfillment_status
                    is None
                ):
                    cur.execute(
                        """
                        UPDATE orders
                        SET
                            status = %s,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (
                            next_status,
                            order_id,
                        ),
                    )
                else:
                    cur.execute(
                        """
                        UPDATE orders
                        SET
                            status = %s,
                            fulfillment_status = %s,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (
                            next_status,
                            fulfillment_status,
                            order_id,
                        ),
                    )

                message = (
                    f"Status: "
                    f"{next_status}"
                )

            result = get_order_or_404(
                cur,
                order_id,
            )

        conn.commit()

    return {
        "ok": True,
        "message":
            message,
        "order":
            result,
    }

# === YOKAI WOOCOMMERCE AUTOMATION + INVENTORY PRO V0.26 ===

import base64 as _yw_b64
import json as _yw_json
import re as _yw_re
import threading as _yw_threading
import time as _yw_time
import urllib.error as _yw_urlerror
import urllib.parse as _yw_urlparse
import urllib.request as _yw_urlrequest
import uuid as _yw_uuid
from decimal import Decimal as _YWDecimal


class InventoryReceiptCreate(BaseModel):
    quantity_m: _YWDecimal = Field(gt=0, le=100000)
    note: str | None = Field(default=None, max_length=1000)


class InventoryCorrectionCreate(BaseModel):
    target_stock_m: _YWDecimal = Field(ge=0, le=1000000)
    note: str | None = Field(default=None, max_length=1000)


def _yw_dec(value):
    return _YWDecimal(str(value or 0))


def _yw_num(value, places="0.0001"):
    return float(_yw_dec(value).quantize(_YWDecimal(places)))


def _yw_money(value):
    return float(_yw_dec(value).quantize(_YWDecimal("0.01")))


def _yw_columns(cur, table_name: str) -> set[str]:
    cur.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=%s
        """,
        (table_name,),
    )
    return {str(row["column_name"]) for row in cur.fetchall()}


def _yw_threshold_column(cur) -> str:
    columns = _yw_columns(cur, "materials")
    for name in (
        "low_stock_threshold_m",
        "low_threshold_m",
        "low_stock_threshold",
        "low_threshold",
    ):
        if name in columns:
            return name

    cur.execute(
        """
        ALTER TABLE materials
        ADD COLUMN IF NOT EXISTS low_stock_threshold_m
            NUMERIC(14,4) NOT NULL DEFAULT 2
        """
    )
    return "low_stock_threshold_m"


def _ensure_inventory_pro_schema(cur):
    threshold_column = _yw_threshold_column(cur)

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS inventory_movements (
            id BIGSERIAL PRIMARY KEY,
            material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
            material_name TEXT NOT NULL,
            movement_type TEXT NOT NULL,
            delta_m NUMERIC(14,4) NOT NULL,
            stock_before_m NUMERIC(14,4) NOT NULL,
            stock_after_m NUMERIC(14,4) NOT NULL,
            source_type TEXT,
            source_id TEXT,
            note TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS inventory_movements_material_idx
        ON inventory_movements(material_id, created_at DESC)
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS inventory_movements_created_idx
        ON inventory_movements(created_at DESC)
        """
    )

    cur.execute(
        """
        CREATE OR REPLACE FUNCTION yokai_log_material_stock_movement()
        RETURNS TRIGGER AS $$
        DECLARE
            movement_kind TEXT;
            source_kind TEXT;
            source_value TEXT;
            movement_note TEXT;
        BEGIN
            IF NEW.stock_length_m IS DISTINCT FROM OLD.stock_length_m THEN
                movement_kind := NULLIF(
                    current_setting('yokai.movement_type', TRUE), ''
                );
                source_kind := NULLIF(
                    current_setting('yokai.source_type', TRUE), ''
                );
                source_value := NULLIF(
                    current_setting('yokai.source_id', TRUE), ''
                );
                movement_note := NULLIF(
                    current_setting('yokai.movement_note', TRUE), ''
                );

                IF movement_kind IS NULL THEN
                    movement_kind := 'system_adjustment';
                END IF;
                IF source_kind IS NULL THEN
                    source_kind := 'system';
                END IF;

                INSERT INTO inventory_movements (
                    material_id, material_name, movement_type,
                    delta_m, stock_before_m, stock_after_m,
                    source_type, source_id, note
                )
                VALUES (
                    NEW.id,
                    COALESCE(NEW.name, 'Materiał #' || NEW.id),
                    movement_kind,
                    COALESCE(NEW.stock_length_m, 0)
                        - COALESCE(OLD.stock_length_m, 0),
                    COALESCE(OLD.stock_length_m, 0),
                    COALESCE(NEW.stock_length_m, 0),
                    source_kind,
                    source_value,
                    movement_note
                );
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    cur.execute(
        """
        DROP TRIGGER IF EXISTS materials_stock_movement ON materials
        """
    )
    cur.execute(
        """
        CREATE TRIGGER materials_stock_movement
        AFTER UPDATE OF stock_length_m ON materials
        FOR EACH ROW
        EXECUTE FUNCTION yokai_log_material_stock_movement()
        """
    )

    cur.execute(
        """
        INSERT INTO inventory_movements (
            material_id, material_name, movement_type,
            delta_m, stock_before_m, stock_after_m,
            source_type, note
        )
        SELECT
            m.id,
            COALESCE(m.name, 'Materiał #' || m.id),
            'opening_balance',
            COALESCE(m.stock_length_m, 0),
            0,
            COALESCE(m.stock_length_m, 0),
            'migration',
            'Stan początkowy przy uruchomieniu Magazynu PRO'
        FROM materials m
        WHERE NOT EXISTS (
            SELECT 1
            FROM inventory_movements im
            WHERE im.material_id = m.id
        )
        """
    )

    # Walidacja zgodności kolumny progu.
    cur.execute(
        f"""
        SELECT COUNT(*) AS count
        FROM materials
        WHERE COALESCE({threshold_column}, 0) >= 0
        """
    )


def _inventory_overview_rows(cur):
    threshold_column = _yw_threshold_column(cur)
    cur.execute(
        f"""
        WITH usage_30 AS (
            SELECT
                material_id,
                COALESCE(SUM(
                    CASE
                        WHEN delta_m < 0
                             AND movement_type NOT IN ('correction','opening_balance')
                        THEN ABS(delta_m)
                        ELSE 0
                    END
                ), 0) AS used_30d,
                COALESCE(SUM(
                    CASE
                        WHEN delta_m > 0 AND movement_type='receipt'
                        THEN delta_m
                        ELSE 0
                    END
                ), 0) AS received_30d
            FROM inventory_movements
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY material_id
        )
        SELECT
            m.id, m.name, m.color_name, m.color_code,
            m.width_cm, m.roll_length_m, m.purchase_price,
            m.stock_length_m,
            m.{threshold_column} AS threshold_m,
            COALESCE(u.used_30d, 0) AS used_30d,
            COALESCE(u.received_30d, 0) AS received_30d
        FROM materials m
        LEFT JOIN usage_30 u ON u.material_id=m.id
        WHERE m.is_archived=FALSE
        ORDER BY m.name, m.color_name NULLS LAST, m.id
        """
    )

    result = []
    for raw in cur.fetchall():
        item = dict(raw)
        stock = _yw_dec(item.get("stock_length_m"))
        threshold = _yw_dec(item.get("threshold_m"))
        used = _yw_dec(item.get("used_30d"))
        received = _yw_dec(item.get("received_30d"))
        roll_length = _yw_dec(item.get("roll_length_m"))
        price = _yw_dec(item.get("purchase_price"))

        cost_per_m = price / roll_length if roll_length > 0 else _YWDecimal("0")
        stock_value = stock * cost_per_m
        avg_daily = used / _YWDecimal("30")
        days_left = stock / avg_daily if avg_daily > 0 else None
        target = max(
            threshold * _YWDecimal("2"),
            avg_daily * _YWDecimal("60"),
        )
        recommended = max(target - stock, _YWDecimal("0"))
        needs_purchase = (
            stock <= threshold
            or (days_left is not None and days_left <= _YWDecimal("21"))
        )

        item.update(
            {
                "id": int(item["id"]),
                "stock_length_m": _yw_num(stock),
                "threshold_m": _yw_num(threshold),
                "used_30d": _yw_num(used),
                "received_30d": _yw_num(received),
                "avg_daily_usage_m": _yw_num(avg_daily),
                "days_left": (
                    None
                    if days_left is None
                    else _yw_num(days_left, "0.01")
                ),
                "cost_per_m": _yw_money(cost_per_m),
                "stock_value": _yw_money(stock_value),
                "recommended_purchase_m": _yw_num(recommended, "0.01"),
                "needs_purchase": needs_purchase,
            }
        )

        for field in ("width_cm", "roll_length_m", "purchase_price"):
            if item.get(field) is not None:
                item[field] = _yw_num(item[field])

        result.append(item)

    return result


def _ensure_woo_pro_schema(cur):
    cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS woo_order_id BIGINT")
    cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS woo_order_number TEXT")
    cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS woo_status TEXT")
    cur.execute(
        """
        ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS woo_last_synced_at TIMESTAMPTZ
        """
    )
    cur.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS woo_sync_error TEXT")
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS orders_woo_order_id_idx
        ON orders(woo_order_id)
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS woo_order_automation (
            id BIGSERIAL PRIMARY KEY,
            local_order_id BIGINT NOT NULL UNIQUE
                REFERENCES orders(id) ON DELETE CASCADE,
            woo_order_id BIGINT NOT NULL UNIQUE,
            woo_order_number TEXT,
            woo_status TEXT,
            woo_currency TEXT,
            woo_total NUMERIC(14,2),
            payment_method TEXT,
            payment_method_title TEXT,
            billing_email TEXT,
            customer_name TEXT,
            sync_status TEXT NOT NULL DEFAULT 'pending',
            sync_error TEXT,
            warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            woo_modified_at TEXT,
            last_sync_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS woo_sync_log (
            id BIGSERIAL PRIMARY KEY,
            local_order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
            woo_order_id BIGINT,
            direction TEXT NOT NULL DEFAULT 'woo_to_yokai',
            status TEXT NOT NULL,
            message TEXT,
            changes JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS woo_sync_log_order_idx
        ON woo_sync_log(local_order_id, created_at DESC)
        """
    )

    columns = _yw_columns(cur, "orders")
    for candidate in (
        "woocommerce_order_id",
        "wc_order_id",
        "external_order_id",
        "external_id",
    ):
        if candidate not in columns:
            continue
        cur.execute(
            f"""
            UPDATE orders
            SET woo_order_id = CASE
                WHEN BTRIM({candidate}::TEXT) ~ '^[0-9]+$'
                THEN BTRIM({candidate}::TEXT)::BIGINT
                ELSE NULL
            END
            WHERE woo_order_id IS NULL AND {candidate} IS NOT NULL
            """
        )

    if "source" in columns:
        cur.execute(
            """
            UPDATE orders
            SET woo_order_id = (
                SUBSTRING(source FROM '#([0-9]+)')
            )::BIGINT
            WHERE
                woo_order_id IS NULL
                AND source ILIKE '%woo%'
                AND source ~ '#[0-9]+'
            """
        )

    cur.execute(
        """
        INSERT INTO woo_order_automation (
            local_order_id, woo_order_id,
            woo_order_number, woo_status, sync_status
        )
        SELECT DISTINCT ON (o.woo_order_id)
            o.id, o.woo_order_id,
            o.woo_order_number, o.woo_status, 'pending'
        FROM orders o
        WHERE o.woo_order_id IS NOT NULL
        ORDER BY o.woo_order_id, o.id
        ON CONFLICT DO NOTHING
        """
    )


def _woo_settings():
    base_url = os.environ.get("WC_URL", "").strip().rstrip("/")
    key = os.environ.get("WC_CONSUMER_KEY", "").strip()
    secret = os.environ.get("WC_CONSUMER_SECRET", "").strip()
    if not base_url or not key or not secret:
        raise RuntimeError("Brakuje konfiguracji WooCommerce API")
    return base_url, key, secret


def _woo_api(path: str, params: dict | None = None):
    base_url, key, secret = _woo_settings()
    url = f"{base_url}/wp-json/wc/v3/{path.lstrip('/')}"
    if params:
        url += "?" + _yw_urlparse.urlencode(params, doseq=True)

    token = _yw_b64.b64encode(
        f"{key}:{secret}".encode("utf-8")
    ).decode("ascii")

    request = _yw_urlrequest.Request(
        url,
        headers={
            "Authorization": f"Basic {token}",
            "Accept": "application/json",
            "User-Agent": "YOKAI-OS/0.26",
        },
        method="GET",
    )

    try:
        with _yw_urlrequest.urlopen(request, timeout=20) as response:
            raw = response.read()
    except _yw_urlerror.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        raise RuntimeError(
            f"WooCommerce API HTTP {exc.code}"
            + (f": {body[:220]}" if body else "")
        ) from exc
    except _yw_urlerror.URLError as exc:
        raise RuntimeError("Brak połączenia z WooCommerce API") from exc

    try:
        return _yw_json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise RuntimeError("WooCommerce zwrócił nieprawidłowy JSON") from exc


def _woo_digits(value) -> str:
    return _yw_re.sub(r"\D+", "", str(value or ""))


def _woo_nip(payload: dict):
    billing = payload.get("billing") or {}
    for key in ("nip", "vat_number", "tax_id", "company_vat"):
        value = _woo_digits(billing.get(key))
        if len(value) == 10:
            return value

    for meta in payload.get("meta_data") or []:
        key = str(meta.get("key") or "").lower()
        if not ("nip" in key or "vat_number" in key or "tax_id" in key):
            continue
        value = _woo_digits(meta.get("value"))
        if len(value) == 10:
            return value

    return None


def _woo_address(data: dict) -> str:
    parts = [
        str(data.get("address_1") or "").strip(),
        str(data.get("address_2") or "").strip(),
        " ".join(
            [
                str(data.get("postcode") or "").strip(),
                str(data.get("city") or "").strip(),
            ]
        ).strip(),
        str(data.get("country") or "").strip(),
    ]
    return ", ".join([part for part in parts if part])


def _woo_meta(items):
    result = []
    for meta in items or []:
        key = str(meta.get("display_key") or meta.get("key") or "")
        if not key or key.startswith("_"):
            continue
        value = meta.get("display_value")
        if value is None:
            value = meta.get("value")
        if isinstance(value, (dict, list)):
            try:
                value = _yw_json.dumps(value, ensure_ascii=False)
            except Exception:
                value = str(value)
        result.append({"key": key[:160], "value": str(value or "")[:1000]})
        if len(result) >= 30:
            break
    return result


def _woo_summary(payload: dict) -> dict:
    billing = payload.get("billing") or {}
    shipping = payload.get("shipping") or {}

    company = str(billing.get("company") or "").strip()
    full_name = " ".join(
        [
            str(billing.get("first_name") or "").strip(),
            str(billing.get("last_name") or "").strip(),
        ]
    ).strip()
    customer_name = company or full_name or "Klient WooCommerce"

    items = []
    for item in payload.get("line_items") or []:
        items.append(
            {
                "id": item.get("id"),
                "name": item.get("name") or "",
                "product_id": item.get("product_id"),
                "variation_id": item.get("variation_id"),
                "quantity": item.get("quantity") or 0,
                "subtotal": item.get("subtotal") or "0",
                "total": item.get("total") or "0",
                "sku": item.get("sku") or "",
                "meta": _woo_meta(item.get("meta_data") or []),
            }
        )

    warnings = []
    if not items:
        warnings.append("Brak produktów w zamówieniu")
    if not str(billing.get("email") or "").strip():
        warnings.append("Brak adresu e-mail")
    if (
        str(payload.get("shipping_total") or "0") not in {"0", "0.00"}
        and not _woo_address(shipping)
        and not _woo_address(billing)
    ):
        warnings.append("Brak adresu dostawy")

    return {
        "woo_order_id": int(payload.get("id") or 0),
        "woo_order_number": str(
            payload.get("number") or payload.get("id") or ""
        ),
        "status": str(payload.get("status") or ""),
        "currency": str(payload.get("currency") or "PLN"),
        "total": str(payload.get("total") or "0"),
        "date_created": payload.get("date_created"),
        "date_modified": payload.get("date_modified"),
        "date_paid": payload.get("date_paid"),
        "payment_method": payload.get("payment_method") or "",
        "payment_method_title": payload.get("payment_method_title") or "",
        "customer_note": payload.get("customer_note") or "",
        "customer_name": customer_name,
        "nip": _woo_nip(payload),
        "billing": {
            "first_name": billing.get("first_name") or "",
            "last_name": billing.get("last_name") or "",
            "company": company,
            "email": billing.get("email") or "",
            "phone": billing.get("phone") or "",
            "address": _woo_address(billing),
            "postcode": billing.get("postcode") or "",
            "city": billing.get("city") or "",
            "country": billing.get("country") or "",
        },
        "shipping": {
            "first_name": shipping.get("first_name") or "",
            "last_name": shipping.get("last_name") or "",
            "company": shipping.get("company") or "",
            "address": _woo_address(shipping),
            "postcode": shipping.get("postcode") or "",
            "city": shipping.get("city") or "",
            "country": shipping.get("country") or "",
        },
        "shipping_method": ", ".join(
            [
                str(
                    line.get("method_title")
                    or line.get("method_id")
                    or ""
                )
                for line in payload.get("shipping_lines") or []
                if line.get("method_title") or line.get("method_id")
            ]
        ),
        "items": items,
        "order_meta": _woo_meta(payload.get("meta_data") or []),
        "warnings": warnings,
    }


def _woo_upsert_client(cur, summary: dict):
    billing = summary.get("billing") or {}
    nip = summary.get("nip") or None
    email = str(billing.get("email") or "").strip()
    phone = str(billing.get("phone") or "").strip()
    company = str(billing.get("company") or "").strip()
    first_name = str(billing.get("first_name") or "").strip()
    last_name = str(billing.get("last_name") or "").strip()
    display_name = company or " ".join([first_name, last_name]).strip()

    if not display_name and not email and not phone and not nip:
        return None

    client = None

    if nip:
        cur.execute(
            """
            SELECT * FROM clients
            WHERE nip=%s AND is_archived=FALSE
            ORDER BY id LIMIT 1
            """,
            (nip,),
        )
        client = cur.fetchone()

    if client is None and email:
        cur.execute(
            """
            SELECT * FROM clients
            WHERE LOWER(COALESCE(email,''))=LOWER(%s)
              AND is_archived=FALSE
            ORDER BY id LIMIT 1
            """,
            (email,),
        )
        client = cur.fetchone()

    if client is None and display_name:
        cur.execute(
            """
            SELECT * FROM clients
            WHERE LOWER(BTRIM(display_name))=LOWER(BTRIM(%s))
              AND is_archived=FALSE
            ORDER BY id LIMIT 1
            """,
            (display_name,),
        )
        client = cur.fetchone()

    client_type = "company" if company else "person"
    address = str(billing.get("address") or "").strip()
    postal = str(billing.get("postcode") or "").strip()
    city = str(billing.get("city") or "").strip()
    country = str(billing.get("country") or "").strip()

    if client is not None:
        client_id = int(client["id"])
        cur.execute(
            """
            UPDATE clients
            SET
                client_type=%s,
                first_name=COALESCE(NULLIF(%s,''), first_name),
                last_name=COALESCE(NULLIF(%s,''), last_name),
                company_name=COALESCE(NULLIF(%s,''), company_name),
                display_name=COALESCE(NULLIF(%s,''), display_name),
                nip=COALESCE(NULLIF(%s,''), nip),
                email=COALESCE(NULLIF(%s,''), email),
                phone=COALESCE(NULLIF(%s,''), phone),
                address=COALESCE(NULLIF(%s,''), address),
                postal_code=COALESCE(NULLIF(%s,''), postal_code),
                city=COALESCE(NULLIF(%s,''), city),
                country=COALESCE(NULLIF(%s,''), country),
                updated_at=NOW()
            WHERE id=%s
            """,
            (
                client_type,
                first_name,
                last_name,
                company,
                display_name,
                nip or "",
                email,
                phone,
                address,
                postal,
                city,
                country,
                client_id,
            ),
        )
        return client_id

    temp_number = "AUTO-" + _yw_uuid.uuid4().hex[:12]
    cur.execute(
        """
        INSERT INTO clients (
            client_number, client_type,
            first_name, last_name, company_name, display_name,
            nip, email, phone, address, postal_code, city, country, notes
        )
        VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
        )
        RETURNING id
        """,
        (
            temp_number,
            client_type,
            first_name or None,
            last_name or None,
            company or None,
            display_name or email or phone or "Klient WooCommerce",
            nip,
            email or None,
            phone or None,
            address or None,
            postal or None,
            city or None,
            country or None,
            "Utworzono automatycznie z WooCommerce.",
        ),
    )
    client_id = int(cur.fetchone()["id"])
    cur.execute(
        """
        UPDATE clients
        SET client_number=%s, updated_at=NOW()
        WHERE id=%s
        """,
        (f"KL-{client_id:05d}", client_id),
    )
    return client_id


def _woo_local_for_remote(cur, woo_order_id: int):
    cur.execute(
        """
        SELECT local_order_id
        FROM woo_order_automation
        WHERE woo_order_id=%s
        LIMIT 1
        """,
        (woo_order_id,),
    )
    row = cur.fetchone()
    if row:
        return int(row["local_order_id"])

    cur.execute(
        """
        SELECT id
        FROM orders
        WHERE woo_order_id=%s
        ORDER BY id LIMIT 1
        """,
        (woo_order_id,),
    )
    row = cur.fetchone()
    if row:
        return int(row["id"])

    columns = _yw_columns(cur, "orders")
    if "source" in columns:
        cur.execute(
            """
            SELECT id
            FROM orders
            WHERE source ILIKE '%woo%' AND source ILIKE %s
            ORDER BY id LIMIT 1
            """,
            (f"%#{woo_order_id}%",),
        )
        row = cur.fetchone()
        if row:
            return int(row["id"])

    return None


def _woo_remote_for_local(cur, local_order_id: int):
    cur.execute(
        """
        SELECT COALESCE(a.woo_order_id, o.woo_order_id) AS woo_order_id
        FROM orders o
        LEFT JOIN woo_order_automation a ON a.local_order_id=o.id
        WHERE o.id=%s
        """,
        (local_order_id,),
    )
    row = cur.fetchone()
    if row and row.get("woo_order_id") is not None:
        return int(row["woo_order_id"])
    return None


def _woo_apply(cur, local_order_id: int, payload: dict, actor="manual"):
    summary = _woo_summary(payload)
    woo_order_id = int(summary["woo_order_id"])

    cur.execute(
        """
        SELECT * FROM woo_order_automation
        WHERE local_order_id=%s
        """,
        (local_order_id,),
    )
    old = cur.fetchone()
    old_payload = (old.get("payload") if old else {}) or {}

    client_id = _woo_upsert_client(cur, summary)
    total = _yw_dec(summary.get("total"))
    customer_name = str(summary.get("customer_name") or "").strip()
    woo_status = str(summary.get("status") or "")

    cur.execute(
        """
        SELECT status, paid_amount, payment_status
        FROM orders
        WHERE id=%s
        FOR UPDATE
        """,
        (local_order_id,),
    )
    current = cur.fetchone() or {}

    paid_from_woo = bool(
        summary.get("date_paid")
        or woo_status == "completed"
    )
    next_paid = (
        total
        if paid_from_woo
        else _yw_dec(current.get("paid_amount"))
    )
    payment_status = (
        "Opłacone"
        if paid_from_woo
        else current.get("payment_status") or "Nieopłacone"
    )
    local_status_override = (
        "Anulowane"
        if woo_status in {"cancelled", "refunded", "failed"}
        else None
    )

    cur.execute(
        """
        UPDATE orders
        SET
            woo_order_id=%s,
            woo_order_number=%s,
            woo_status=%s,
            woo_last_synced_at=NOW(),
            woo_sync_error=NULL,
            client_id=COALESCE(%s, client_id),
            client_name=CASE WHEN %s<>'' THEN %s ELSE client_name END,
            price=CASE WHEN %s>0 THEN %s ELSE price END,
            paid_amount=%s,
            payment_status=%s,
            status=COALESCE(%s, status),
            updated_at=NOW()
        WHERE id=%s
        """,
        (
            woo_order_id,
            summary.get("woo_order_number"),
            woo_status,
            client_id,
            customer_name,
            customer_name,
            total,
            total,
            next_paid,
            payment_status,
            local_status_override,
            local_order_id,
        ),
    )

    warnings = list(summary.get("warnings") or [])
    if client_id is None:
        warnings.append("Nie udało się powiązać karty klienta")

    def tracked(data):
        if not isinstance(data, dict):
            return {}
        return {
            "status": data.get("status"),
            "total": data.get("total"),
            "date_paid": data.get("date_paid"),
            "customer_name": data.get("customer_name"),
            "billing_email": (data.get("billing") or {}).get("email"),
            "items": [
                (
                    item.get("product_id"),
                    item.get("variation_id"),
                    item.get("quantity"),
                    item.get("total"),
                )
                for item in data.get("items") or []
            ],
        }

    before = tracked(old_payload)
    after = tracked(summary)
    changes = {}
    for key, value in after.items():
        if old is None or before.get(key) != value:
            changes[key] = {"old": before.get(key), "new": value}

    cur.execute(
        """
        INSERT INTO woo_order_automation (
            local_order_id, woo_order_id, woo_order_number,
            woo_status, woo_currency, woo_total,
            payment_method, payment_method_title,
            billing_email, customer_name,
            sync_status, sync_error, warnings, payload,
            woo_modified_at, last_sync_at, updated_at
        )
        VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
            'ok',NULL,%s,%s,%s,NOW(),NOW()
        )
        ON CONFLICT(local_order_id)
        DO UPDATE SET
            woo_order_id=EXCLUDED.woo_order_id,
            woo_order_number=EXCLUDED.woo_order_number,
            woo_status=EXCLUDED.woo_status,
            woo_currency=EXCLUDED.woo_currency,
            woo_total=EXCLUDED.woo_total,
            payment_method=EXCLUDED.payment_method,
            payment_method_title=EXCLUDED.payment_method_title,
            billing_email=EXCLUDED.billing_email,
            customer_name=EXCLUDED.customer_name,
            sync_status='ok',
            sync_error=NULL,
            warnings=EXCLUDED.warnings,
            payload=EXCLUDED.payload,
            woo_modified_at=EXCLUDED.woo_modified_at,
            last_sync_at=NOW(),
            updated_at=NOW()
        """,
        (
            local_order_id,
            woo_order_id,
            summary.get("woo_order_number"),
            woo_status,
            summary.get("currency"),
            total,
            summary.get("payment_method"),
            summary.get("payment_method_title"),
            (summary.get("billing") or {}).get("email"),
            customer_name,
            Jsonb(warnings),
            Jsonb(summary),
            summary.get("date_modified"),
        ),
    )

    if changes or actor != "background":
        cur.execute(
            """
            INSERT INTO woo_sync_log (
                local_order_id, woo_order_id, direction,
                status, message, changes
            )
            VALUES (%s,%s,'woo_to_yokai','ok',%s,%s)
            """,
            (
                local_order_id,
                woo_order_id,
                (
                    "Synchronizacja WooCommerce"
                    if changes
                    else "Synchronizacja WooCommerce — bez zmian"
                ),
                Jsonb(changes),
            ),
        )

    return {
        "local_order_id": local_order_id,
        "woo_order_id": woo_order_id,
        "changes": changes,
        "warnings": warnings,
        "client_id": client_id,
    }


def _woo_record_error(cur, local_order_id: int, remote_id, message: str):
    cur.execute(
        """
        UPDATE orders
        SET woo_sync_error=%s, woo_last_synced_at=NOW(), updated_at=NOW()
        WHERE id=%s
        """,
        (message[:1000], local_order_id),
    )

    cur.execute(
        """
        INSERT INTO woo_sync_log (
            local_order_id, woo_order_id, direction,
            status, message, changes
        )
        VALUES (%s,%s,'woo_to_yokai','error',%s,'{}'::jsonb)
        """,
        (local_order_id, remote_id, message[:1000]),
    )


def _woo_sync_local(local_order_id: int, actor="manual"):
    remote_id = None
    with get_connection() as conn:
        try:
            with conn.cursor() as cur:
                _ensure_woo_pro_schema(cur)
                remote_id = _woo_remote_for_local(cur, local_order_id)
                if remote_id is None:
                    raise RuntimeError(
                        "Nie udało się ustalić ID zamówienia WooCommerce"
                    )
            conn.commit()

            payload = _woo_api(f"orders/{remote_id}")
            if not isinstance(payload, dict):
                raise RuntimeError("WooCommerce zwrócił nieprawidłowe dane")

            with conn.cursor() as cur:
                result = _woo_apply(cur, local_order_id, payload, actor)
            conn.commit()
            return result

        except Exception as exc:
            conn.rollback()
            try:
                with conn.cursor() as cur:
                    _woo_record_error(
                        cur,
                        local_order_id,
                        remote_id,
                        str(exc),
                    )
                conn.commit()
            except Exception:
                conn.rollback()
            raise


def _woo_sync_recent(actor="background"):
    payloads = _woo_api(
        "orders",
        {
            "per_page": 100,
            "orderby": "modified",
            "order": "desc",
            "status": "any",
        },
    )
    if not isinstance(payloads, list):
        raise RuntimeError("WooCommerce nie zwrócił listy zamówień")

    synced = 0
    changed = 0
    skipped = 0
    errors = []

    with get_connection() as conn:
        try:
            with conn.cursor() as cur:
                _ensure_woo_pro_schema(cur)

                for payload in payloads:
                    if not isinstance(payload, dict):
                        continue
                    remote_id = int(payload.get("id") or 0)
                    if remote_id <= 0:
                        continue

                    local_id = _woo_local_for_remote(cur, remote_id)
                    if local_id is None:
                        skipped += 1
                        continue

                    try:
                        result = _woo_apply(cur, local_id, payload, actor)
                        synced += 1
                        if result.get("changes"):
                            changed += 1
                    except Exception as exc:
                        errors.append(
                            {
                                "woo_order_id": remote_id,
                                "local_order_id": local_id,
                                "error": str(exc)[:400],
                            }
                        )

                conn.commit()
        except Exception:
            conn.rollback()
            raise

    return {
        "synced": synced,
        "changed": changed,
        "skipped_unlinked": skipped,
        "errors": errors,
    }


_yw_worker_started = False
_yw_worker_guard = _yw_threading.Lock()


def _yw_woo_worker():
    _yw_time.sleep(45)
    while True:
        try:
            _woo_sync_recent("background")
        except Exception as exc:
            print(
                "YOKAI Woo automation:",
                str(exc)[:400],
                flush=True,
            )
        _yw_time.sleep(600)


@app.on_event("startup")
def startup_woo_inventory_pro():
    global _yw_worker_started

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_inventory_pro_schema(cur)
            _ensure_woo_pro_schema(cur)
        conn.commit()

    with _yw_worker_guard:
        if not _yw_worker_started:
            worker = _yw_threading.Thread(
                target=_yw_woo_worker,
                daemon=True,
                name="yokai-woo-automation",
            )
            worker.start()
            _yw_worker_started = True


@app.get("/inventory/overview")
def inventory_overview(
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_inventory_pro_schema(cur)
            materials = _inventory_overview_rows(cur)

            cur.execute(
                """
                SELECT
                    COALESCE(SUM(
                        CASE
                            WHEN delta_m < 0
                                 AND movement_type NOT IN (
                                     'correction','opening_balance'
                                 )
                            THEN ABS(delta_m)
                            ELSE 0
                        END
                    ), 0) AS usage_30d,
                    COALESCE(SUM(
                        CASE
                            WHEN delta_m > 0 AND movement_type='receipt'
                            THEN delta_m
                            ELSE 0
                        END
                    ), 0) AS receipts_30d
                FROM inventory_movements
                WHERE created_at >= NOW() - INTERVAL '30 days'
                """
            )
            totals = cur.fetchone() or {}
        conn.commit()

    purchase = [item for item in materials if item.get("needs_purchase")]
    purchase.sort(
        key=lambda item: (
            0
            if item.get("stock_length_m", 0)
            <= item.get("threshold_m", 0)
            else 1,
            item.get("days_left")
            if item.get("days_left") is not None
            else 999999,
        )
    )

    return {
        "materials_count": len(materials),
        "stock_value": _yw_money(
            sum(
                (_yw_dec(item.get("stock_value")) for item in materials),
                _YWDecimal("0"),
            )
        ),
        "usage_30d_m": _yw_num(totals.get("usage_30d")),
        "receipts_30d_m": _yw_num(totals.get("receipts_30d")),
        "purchase_count": len(purchase),
        "purchase_list": purchase,
        "materials": materials,
    }


@app.get("/inventory/purchase-list")
def inventory_purchase_list(
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_inventory_pro_schema(cur)
            items = _inventory_overview_rows(cur)
        conn.commit()

    result = [item for item in items if item.get("needs_purchase")]
    result.sort(
        key=lambda item: (
            item.get("days_left")
            if item.get("days_left") is not None
            else 999999,
            item.get("stock_length_m", 0),
        )
    )
    return result


@app.get("/inventory/movements")
def inventory_movements(
    material_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_inventory_pro_schema(cur)
            if material_id is None:
                cur.execute(
                    """
                    SELECT * FROM inventory_movements
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
            else:
                cur.execute(
                    """
                    SELECT * FROM inventory_movements
                    WHERE material_id=%s
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (material_id, limit),
                )
            rows = cur.fetchall()
        conn.commit()

    result = []
    for row in rows:
        item = dict(row)
        for field in ("delta_m", "stock_before_m", "stock_after_m"):
            item[field] = _yw_num(item.get(field))
        result.append(item)
    return result


@app.post("/materials/{material_id}/stock-receipt")
def inventory_stock_receipt(
    material_id: int,
    data: InventoryReceiptCreate,
    user: dict = Depends(get_current_user),
):
    quantity = _yw_dec(data.quantity_m)
    note = data.note.strip() if data.note else ""

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_inventory_pro_schema(cur)
            cur.execute(
                """
                SELECT * FROM materials
                WHERE id=%s AND is_archived=FALSE
                FOR UPDATE
                """,
                (material_id,),
            )
            material = cur.fetchone()
            if material is None:
                raise HTTPException(status_code=404, detail="Nie znaleziono materiału")

            cur.execute(
                """
                SELECT
                    set_config('yokai.movement_type','receipt',TRUE),
                    set_config('yokai.source_type','manual_receipt',TRUE),
                    set_config('yokai.source_id',%s,TRUE),
                    set_config('yokai.movement_note',%s,TRUE)
                """,
                (str(material_id), note),
            )
            cur.execute(
                """
                UPDATE materials
                SET
                    stock_length_m=COALESCE(stock_length_m,0)+%s,
                    updated_at=NOW()
                WHERE id=%s
                RETURNING *
                """,
                (quantity, material_id),
            )
            updated = dict(cur.fetchone())
        conn.commit()

    updated["stock_length_m"] = _yw_num(updated.get("stock_length_m"))
    return updated


@app.post("/materials/{material_id}/stock-correction")
def inventory_stock_correction(
    material_id: int,
    data: InventoryCorrectionCreate,
    user: dict = Depends(get_current_user),
):
    target = _yw_dec(data.target_stock_m)
    note = data.note.strip() if data.note else ""

    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_inventory_pro_schema(cur)
            cur.execute(
                """
                SELECT * FROM materials
                WHERE id=%s AND is_archived=FALSE
                FOR UPDATE
                """,
                (material_id,),
            )
            material = cur.fetchone()
            if material is None:
                raise HTTPException(status_code=404, detail="Nie znaleziono materiału")

            cur.execute(
                """
                SELECT
                    set_config('yokai.movement_type','correction',TRUE),
                    set_config('yokai.source_type','manual_correction',TRUE),
                    set_config('yokai.source_id',%s,TRUE),
                    set_config('yokai.movement_note',%s,TRUE)
                """,
                (str(material_id), note),
            )
            cur.execute(
                """
                UPDATE materials
                SET stock_length_m=%s, updated_at=NOW()
                WHERE id=%s
                RETURNING *
                """,
                (target, material_id),
            )
            updated = dict(cur.fetchone())
        conn.commit()

    updated["stock_length_m"] = _yw_num(updated.get("stock_length_m"))
    return updated


@app.get("/orders/{order_id}/woo-automation")
def order_woo_automation(
    order_id: int,
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_woo_pro_schema(cur)

            cur.execute(
                """
                SELECT
                    id, order_number, source,
                    woo_order_id, woo_order_number, woo_status,
                    woo_last_synced_at, woo_sync_error
                FROM orders
                WHERE id=%s
                """,
                (order_id,),
            )
            order = cur.fetchone()
            if order is None:
                raise HTTPException(status_code=404, detail="Nie znaleziono zamówienia")

            cur.execute(
                """
                SELECT * FROM woo_order_automation
                WHERE local_order_id=%s
                """,
                (order_id,),
            )
            automation = cur.fetchone()

            cur.execute(
                """
                SELECT * FROM woo_sync_log
                WHERE local_order_id=%s
                ORDER BY created_at DESC, id DESC
                LIMIT 30
                """,
                (order_id,),
            )
            logs = cur.fetchall()
        conn.commit()

    source = str(order.get("source") or "")
    is_woo = bool(
        order.get("woo_order_id")
        or automation
        or "woo" in source.lower()
    )

    return {
        "is_woo": is_woo,
        "local_order": {
            "id": int(order["id"]),
            "order_number": order.get("order_number"),
            "source": source,
            "woo_order_id": (
                int(order["woo_order_id"])
                if order.get("woo_order_id") is not None
                else None
            ),
            "woo_order_number": order.get("woo_order_number"),
            "woo_status": order.get("woo_status"),
            "woo_last_synced_at": order.get("woo_last_synced_at"),
            "woo_sync_error": order.get("woo_sync_error"),
        },
        "automation": dict(automation) if automation else None,
        "logs": [dict(row) for row in logs],
    }


@app.post("/orders/{order_id}/woo-automation/sync")
def order_woo_sync(
    order_id: int,
    user: dict = Depends(get_current_user),
):
    try:
        result = _woo_sync_local(order_id, "manual")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:1000]) from exc

    return {
        "ok": True,
        "message": "Synchronizacja WooCommerce zakończona",
        **result,
    }


@app.post("/woocommerce/automation/sync")
def woo_automation_sync(
    user: dict = Depends(get_current_user),
):
    try:
        result = _woo_sync_recent("manual")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:1000]) from exc

    return {
        "ok": True,
        "message": "Synchronizacja automatyczna zakończona",
        **result,
    }


@app.get("/woocommerce/automation/status")
def woo_automation_status(
    user: dict = Depends(get_current_user),
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _ensure_woo_pro_schema(cur)
            cur.execute(
                """
                SELECT
                    COUNT(*) AS linked_orders,
                    COUNT(*) FILTER (WHERE sync_status='error') AS errors,
                    MAX(last_sync_at) AS last_sync_at
                FROM woo_order_automation
                """
            )
            stats = cur.fetchone() or {}

            cur.execute(
                """
                SELECT COUNT(*) AS changes_24h
                FROM woo_sync_log
                WHERE
                    created_at >= NOW() - INTERVAL '24 hours'
                    AND status='ok'
                    AND changes <> '{}'::jsonb
                """
            )
            recent = cur.fetchone() or {}
        conn.commit()

    return {
        "linked_orders": int(stats.get("linked_orders") or 0),
        "errors": int(stats.get("errors") or 0),
        "last_sync_at": stats.get("last_sync_at"),
        "changes_24h": int(recent.get("changes_24h") or 0),
        "interval_seconds": 600,
    }
