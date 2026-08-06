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

app = FastAPI(title="YOKAI OS API", version="0.4.0")


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
        "version": "0.4.0",
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
