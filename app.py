import json
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, flash, g, redirect, render_template, request, session, url_for


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = Path(os.environ.get("VIDHYALABS_DATABASE", BASE_DIR / "vidhyalabs.db"))
DATABASE_URL = os.environ.get("DATABASE_URL")
VERCEL_RUNTIME = bool(os.environ.get("VERCEL"))

if VERCEL_RUNTIME:
    missing_settings = [
        name
        for name in ("DATABASE_URL", "FLASK_SECRET_KEY", "ADMIN_PASSWORD")
        if not os.environ.get(name)
    ]
    if missing_settings:
        raise RuntimeError(
            "Configure these Vercel environment variables before deploying: "
            + ", ".join(missing_settings)
        )

app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "public" / "static"),
    static_url_path="/static",
)
app.config.update(
    SECRET_KEY=os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=VERCEL_RUNTIME or os.environ.get("SESSION_COOKIE_SECURE") == "1",
)

INTEREST_OPTIONS = {
    "milk": "Milk & dairy",
    "groceries": "Groceries & daily essentials",
    "newspapers": "Newspapers",
    "water": "Drinking water",
    "home-cleaning": "Home cleaning",
    "vehicle-cleaning": "Vehicle cleaning",
    "electrician": "Electrician",
    "plumbing": "Plumbing",
    "appliance-repair": "Appliance repair",
}


def get_db():
    if "db" not in g:
        if DATABASE_URL:
            from psycopg.rows import dict_row

            import psycopg

            g.db = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        else:
            g.db = sqlite3.connect(DATABASE_PATH, timeout=10)
            g.db.row_factory = sqlite3.Row
    return g.db


def execute_db(query, parameters=()):
    if DATABASE_URL:
        query = query.replace("?", "%s")
    return get_db().execute(query, parameters)


@app.teardown_appcontext
def close_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def initialize_database():
    if DATABASE_URL:
        import psycopg

        with psycopg.connect(DATABASE_URL) as db:
            db.execute(
                """
                CREATE TABLE IF NOT EXISTS launch_signups (
                    id BIGSERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    address TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    email TEXT NOT NULL,
                    interests TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
        return

    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE_PATH) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS launch_signups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL,
                interests TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


@app.before_request
def ensure_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)


def valid_email(email):
    return len(email) <= 254 and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) is not None


def valid_csrf_token():
    return hmac.compare_digest(
        request.form.get("csrf_token", ""),
        session.get("csrf_token", ""),
    )


@app.errorhandler(404)
def page_not_found(_error):
    return render_template("404.html"), 404


@app.route("/", methods=["GET", "POST"])
def home():
    if request.method == "POST":
        if not valid_csrf_token():
            return render_template(
                "index.html",
                errors=["Your form session expired. Please try submitting again."],
                values=request.form,
                selected_interests=request.form.getlist("interests"),
                interest_options=INTEREST_OPTIONS,
            ), 400

        name = request.form.get("name", "").strip()
        address = request.form.get("address", "").strip()
        phone = request.form.get("phone", "").strip()
        email = request.form.get("email", "").strip()
        selected_interests = request.form.getlist("interests")
        consent = request.form.get("consent") == "yes"

        errors = []
        if not name or len(name) > 100:
            errors.append("Enter your name (up to 100 characters).")
        if not address or len(address) > 500:
            errors.append("Enter your address (up to 500 characters).")
        if not re.fullmatch(r"\+?[0-9][0-9\s()-]{7,18}", phone):
            errors.append("Enter a valid phone number, including your country code if needed.")
        if not valid_email(email):
            errors.append("Enter a valid email address.")
        if any(item not in INTEREST_OPTIONS for item in selected_interests):
            errors.append("One or more selected interests are invalid.")
        if not consent:
            errors.append("Please agree to be contacted about the launch offers.")

        if errors:
            return render_template(
                "index.html",
                errors=errors,
                values=request.form,
                selected_interests=selected_interests,
                interest_options=INTEREST_OPTIONS,
            ), 400

        execute_db(
            """
            INSERT INTO launch_signups (name, address, phone, email, interests, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                address,
                phone,
                email,
                json.dumps(selected_interests),
                datetime.now(timezone.utc).isoformat(timespec="seconds"),
            ),
        )
        get_db().commit()
        session["csrf_token"] = secrets.token_urlsafe(32)
        flash("Thanks for signing up! We’ll be in touch with pre-launch offers.", "success")
        return redirect(url_for("home", _anchor="signup"))

    return render_template(
        "index.html",
        errors=[],
        values={},
        selected_interests=[],
        interest_options=INTEREST_OPTIONS,
    )


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    configured_password = os.environ.get("ADMIN_PASSWORD")
    if not configured_password:
        return render_template("admin_login.html", configured=False, error=None), 503

    if session.get("is_admin"):
        return redirect(url_for("admin_dashboard"))

    error = None
    if request.method == "POST":
        if not valid_csrf_token():
            error = "Your session expired. Refresh the page and try again."
        elif hmac.compare_digest(request.form.get("password", ""), configured_password):
            session.clear()
            session["is_admin"] = True
            session["csrf_token"] = secrets.token_urlsafe(32)
            return redirect(url_for("admin_dashboard"))
        else:
            error = "The password was not accepted."

    response = app.make_response(
        render_template("admin_login.html", configured=True, error=error)
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/admin", methods=["GET"])
def admin_dashboard():
    if not os.environ.get("ADMIN_PASSWORD"):
        return render_template("admin_login.html", configured=False, error=None), 503
    if not session.get("is_admin"):
        return redirect(url_for("admin_login"))

    rows = execute_db(
        """
        SELECT id, name, address, phone, email, interests, created_at
        FROM launch_signups
        ORDER BY created_at DESC, id DESC
        """
    ).fetchall()
    customers = []
    for row in rows:
        interest_keys = json.loads(row["interests"])
        customers.append(
            {
                "id": row["id"],
                "name": row["name"],
                "address": row["address"],
                "phone": row["phone"],
                "email": row["email"],
                "interests": [
                    INTEREST_OPTIONS.get(key, key) for key in interest_keys
                ],
                "created_at": row["created_at"],
            }
        )

    response = app.make_response(
        render_template(
            "admin.html",
            customers=customers,
            csrf_token=session["csrf_token"],
        )
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    if not valid_csrf_token():
        return "Your session expired. Refresh the page and try again.", 400
    session.clear()
    return redirect(url_for("admin_login"))


initialize_database()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)
