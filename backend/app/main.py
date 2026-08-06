import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import bcrypt
import jwt
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

DATABASE_URL = os.environ["DATABASE_URL"]
SECRET_KEY = os.environ["SECRET_KEY"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].lower().strip()
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

app = FastAPI(title="YOKAI OS API", version="0.3.0")


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
    deadline: date | None = None
    notes: str | None = Field(default=None, max_length=5000)


def get_connection():
    return psycopg.connect(DATABASE_URL)


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
        "version": "0.3.0",
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

    if not user or not user[4]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy login lub hasło",
        )

    if not bcrypt.checkpw(data.password.encode(), user[2].encode()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nieprawidłowy login lub hasło",
        )

    return {
        "access_token": create_token(user[0], user[1], user[3]),
        "token_type": "bearer",
        "user": {
            "id": user[0],
            "email": user[1],
            "role": user[3],
        },
    }


@app.get("/auth/me")
def me(user: dict = Depends(get_current_user)):
    return user


@app.get("/orders")
def list_orders(
    limit: int = 100,
    user: dict = Depends(get_current_user),
):
    safe_limit = min(max(limit, 1), 500)

    with get_connection() as conn:
        with conn.cursor() as cur:
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
                    deadline,
                    notes,
                    status,
                    created_at
                FROM orders
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (safe_limit,),
            )
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "order_number": row[1],
            "client_name": row[2],
            "name": row[3],
            "source": row[4],
            "size": row[5],
            "quantity": row[6],
            "price": row[7],
            "deadline": row[8],
            "notes": row[9],
            "status": row[10],
            "created_at": row[11],
        }
        for row in rows
    ]


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
                    deadline,
                    notes
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    data.client_name.strip(),
                    data.name.strip(),
                    data.source.strip(),
                    data.size.strip() if data.size else None,
                    data.quantity,
                    data.price,
                    data.deadline,
                    data.notes.strip() if data.notes else None,
                ),
            )
            order_id = cur.fetchone()[0]
            order_number = f"YK-{order_id:05d}"

            cur.execute(
                """
                UPDATE orders
                SET order_number = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (order_number, order_id),
            )

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
                    deadline,
                    notes,
                    status,
                    created_at
                FROM orders
                WHERE id = %s
                """,
                (order_id,),
            )
            row = cur.fetchone()

        conn.commit()

    return {
        "id": row[0],
        "order_number": row[1],
        "client_name": row[2],
        "name": row[3],
        "source": row[4],
        "size": row[5],
        "quantity": row[6],
        "price": row[7],
        "deadline": row[8],
        "notes": row[9],
        "status": row[10],
        "created_at": row[11],
    }
