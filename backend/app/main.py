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
    "Akceptacja",
    "Do cięcia",
    "Wycinanie",
    "Wybieranie",
    "Warstwowanie",
    "Transfer",
    "Pakowanie",
    "Wysyłka",
    "Zrealizowane",
    "Anulowane",
]

PaymentStatus = Literal[
    "Nieopłacone",
    "Zaliczka",
    "Opłacone",
    "Zwrot",
]

app = FastAPI(title="YOKAI OS API", version="0.6.0")


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
        "version": "0.6.0",
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
                        AND status IN ('Do cięcia', 'Wycinanie')
                    ) AS cutting,
                    COUNT(*) FILTER (
                        WHERE is_archived = FALSE
                        AND status = 'Wysyłka'
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
    "on-hold": "Akceptacja",
    "processing": "Do cięcia",
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
                "User-Agent": "YOKAI-OS/0.6",
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
