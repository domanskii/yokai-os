import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import psycopg
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, EmailStr

DATABASE_URL = os.environ["DATABASE_URL"]
SECRET_KEY = os.environ["SECRET_KEY"]
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].lower().strip()
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

app = FastAPI(title="YOKAI OS API", version="0.2.0")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def get_connection():
    return psycopg.connect(DATABASE_URL)


def create_token(user_id: int, email: str) -> str:
    now = datetime.now(timezone.utc)

    return jwt.encode(
        {
            "sub": str(user_id),
            "email": email,
            "iat": now,
            "exp": now + timedelta(hours=12),
        },
        SECRET_KEY,
        algorithm="HS256",
    )


@app.on_event("startup")
def startup():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id BIGSERIAL PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'admin',
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)

            cur.execute(
                "SELECT id FROM users WHERE email = %s",
                (ADMIN_EMAIL,),
            )

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
        "version": "0.2.0",
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
        raise HTTPException(status_code=401, detail="Nieprawidłowy login lub hasło")

    if not bcrypt.checkpw(data.password.encode(), user[2].encode()):
        raise HTTPException(status_code=401, detail="Nieprawidłowy login lub hasło")

    return {
        "access_token": create_token(user[0], user[1]),
        "token_type": "bearer",
        "user": {
            "id": user[0],
            "email": user[1],
            "role": user[3],
        },
    }


@app.get("/auth/me")
def me(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Brak tokenu")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Nieprawidłowy token")

    return {
        "id": int(payload["sub"]),
        "email": payload["email"],
    }
