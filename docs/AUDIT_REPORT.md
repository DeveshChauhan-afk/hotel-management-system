# Backend Architecture & Security Audit Report

**Date:** 2026-09-10  
**Target:** Hotel Management System — Flask Backend (`backend/`)  
**Scope:** Backend source code, configuration, database models, authentication, business logic, security, tests, and deployment readiness.

---

## Executive Summary

A comprehensive architectural, functional, and security audit was conducted on the Flask backend located in the `backend/` directory. The application intends to provide core hotel management capabilities—user authentication, room inventory, booking management, and dashboard reporting—via a RESTful API.

The audit revealed severe structural, security, and functional deficiencies. The backend in its current state is a fragile, incomplete prototype. Critical findings include:
- A completely empty `requirements.txt` (0 bytes) and a broken `venv` containing host-specific absolute paths.
- Active secrets (`SECRET_KEY`, `JWT_SECRET_KEY`, and database root credentials) committed into version control in `backend/.env` alongside compiled Python bytecode (`.pyc`).
- Critical unauthenticated endpoints: room auto-assignment and room booking can be invoked by any anonymous user without a JWT.
- Time-of-Check to Time-of-Use (TOCTOU) race conditions in the booking service that permit double-booking the same room.
- Fundamental domain model flaws: no guest verification, missing `Guest` and `Bill` models, inability to book rooms in advance, no check-out mechanism, and absence of database transaction rollbacks.
- Zero unit, integration, or regression test coverage.

---

## Audit Findings by Category

### 1. Project Structure

#### Issue 1.1: Empty `requirements.txt` Dependency Manifest
- **Severity:** CRITICAL
- **File / Location:** `backend/requirements.txt`
- **Problem:** The `requirements.txt` file is 0 bytes (empty). It contains no dependencies, version constraints, or package specifications.
- **Why It Matters:** Any deployment pipeline (Docker, CI/CD, cloud host) or team member cloning the repository cannot install the required environment. Running `pip install -r requirements.txt` does nothing, causing immediate import failures (`ModuleNotFoundError`) when starting the application.
- **Recommended Fix:** Populate `requirements.txt` with pinned dependency versions required by the application (e.g., `Flask`, `Flask-SQLAlchemy`, `Flask-JWT-Extended`, `Flask-Bcrypt`, `Flask-CORS`, `PyMySQL`, `python-dotenv`).

#### Issue 1.2: Host-Specific Broken Virtual Environment Committed / Preserved
- **Severity:** HIGH
- **File / Location:** `backend/venv/`
- **Problem:** The `backend/venv/` directory exists and points to hardcoded absolute paths from an external development machine (`C:\Users\ACER\AppData\Local\Programs\Python\Python313\python.exe`). Attempting to execute `python` or `pip` within this environment fails with `The system cannot find the path specified`.
- **Why It Matters:** The virtual environment is completely non-functional on any machine other than the original creator's machine. If retained or tracked, it bloats repository size and misleads developers/deployment scripts into using a broken Python runtime.
- **Recommended Fix:** Delete `backend/venv/`, ensure `venv/` and `.venv/` are strictly ignored via `.gitignore`, and document standard virtual environment creation steps (`python -m venv venv`) in a setup guide.

#### Issue 1.3: Compiled Bytecode (`__pycache__` / `.pyc`) Tracked in Version Control
- **Severity:** MEDIUM
- **File / Location:** `backend/__pycache__/`, `backend/app/**/__pycache__/`
- **Problem:** Python bytecode cache files (such as `config.cpython-313.pyc`, `auth_routes.cpython-313.pyc`, etc.) are tracked and committed into Git.
- **Why It Matters:** Committing `.pyc` files creates merge conflicts, bloats Git history, and can cause unpredictable runtime behavior when moving between different Python minor versions or patch releases.
- **Recommended Fix:** Untrack all `.pyc` files from Git using `git rm --cached -r **/__pycache__` and create a proper `.gitignore` at the repository root and `backend/` directory.

#### Issue 1.4: Repository Bloat & Dual Legacy Codebase Ambiguity
- **Severity:** MEDIUM
- **File / Location:** `hotel-management-system/` (root sibling to `backend/`)
- **Problem:** An obsolete legacy Tkinter desktop application (`hotel-management-system/`) sits at the root alongside `backend/`. The legacy directory contains old scripts (`app.py`, `billing.py`, `booking.py`, `guests.py`, `rooms.py`, `hotel_db.sql`).
- **Why It Matters:** Having two disparate codebases in one repository without clear monorepo boundaries or documentation causes severe developer confusion regarding which files constitute the active system, where database schemas originate, and how services interact.
- **Recommended Fix:** Archive or move the legacy desktop application into a dedicated `/legacy` directory or separate repository, and place backend schema setup/migrations inside `backend/`.

---

### 2. Flask Configuration

#### Issue 2.1: Committed `.env` File Containing Secrets in Version Control
- **Severity:** CRITICAL
- **File / Location:** `backend/.env`
- **Problem:** The `.env` file containing plaintext database credentials (`DB_USER=root`, `DB_PASSWORD=0000`, `DB_HOST=localhost`, `DB_NAME=hotel_db`), application secret key (`SECRET_KEY=supersecretkey`), and JWT secret (`JWT_SECRET_KEY=jwtsecret`) is committed directly into the Git repository.
- **Why It Matters:** Anyone with read access to the repository has administrative database credentials and JWT signing keys. Attackers can forge arbitrary JWT authentication tokens with administrator privileges or compromise the database.
- **Recommended Fix:** Immediately revoke and rotate all compromised secrets. Remove `backend/.env` from Git tracking (`git rm --cached backend/.env`), add `.env` to `.gitignore`, and provide a sanitized `.env.example` template with placeholder values.

#### Issue 2.2: Missing Environment Fallbacks & Missing Database Connection Pool Settings
- **Severity:** HIGH
- **File / Location:** `backend/config.py`
- **Problem:** `Config` constructs `SQLALCHEMY_DATABASE_URI` using direct string formatting from `os.getenv` without checking if variables exist. If an environment variable is missing, `None` is inserted as a literal string (e.g. `mysql+pymysql://None:None@None/None`). Furthermore, passwords with special characters (e.g., `@`, `/`, `:`) are not URL-encoded, and no SQLAlchemy engine options (`pool_pre_ping`, `pool_recycle`, `pool_size`) are set.
- **Why It Matters:** MySQL drops idle connections after `wait_timeout` (typically 8 hours or lower). Without `pool_pre_ping=True` and `pool_recycle`, any request arriving after an idle period fails with `OperationalError: (pymysql.err.OperationalError) (2006, 'MySQL server has gone away')`. Additionally, missing environment variables lead to misleading connection failure stack traces.
- **Recommended Fix:** Validate all required environment variables at startup, URL-encode credentials using `urllib.parse.quote_plus`, and configure engine options:
  ```python
  SQLALCHEMY_ENGINE_OPTIONS = {
      "pool_pre_ping": True,
      "pool_recycle": 1800,
      "pool_size": 10,
      "max_overflow": 20
  }
  ```

#### Issue 2.3: Unrestricted Wildcard CORS Configuration
- **Severity:** HIGH
- **File / Location:** `backend/app/__init__.py`
- **Problem:** CORS is enabled globally via `CORS(app)` without specifying allowed origins, methods, or headers.
- **Why It Matters:** Any malicious third-party site visited by a user can make cross-origin requests to the API. In production, CORS must be explicitly locked down to authorized frontend domains.
- **Recommended Fix:** Restrict origins via environment configuration:
  ```python
  CORS(app, resources={r"/api/*": {"origins": os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")}})
  ```

#### Issue 2.4: Duplicate Imports & Unused Extensions in App Factory
- **Severity:** LOW
- **File / Location:** `backend/app/__init__.py`
- **Problem:** Line 3 imports `db, jwt` and Line 5 duplicates the import as `db, jwt, bcrypt`. Furthermore, `bcrypt.init_app(app)` is initialized on Line 17, but `bcrypt` is never utilized anywhere in the codebase (the authentication service uses `werkzeug.security`).
- **Why It Matters:** Clutters initialization logic, creates dead dependencies, and indicates lack of code review and cleanup.
- **Recommended Fix:** Consolidate imports and either standardize on `flask_bcrypt` across all services or remove `Bcrypt` entirely in favor of `werkzeug.security`.

---

### 3. Database & Models

#### Issue 3.1: Missing `Guest` and `Bill` Domain Models
- **Severity:** CRITICAL
- **File / Location:** `backend/app/models/`
- **Problem:** The database schema (`hotel_db.sql`) defines `guests` and `bills` tables. However, the Flask backend has no corresponding `Guest` or `Bill` SQLAlchemy models.
- **Why It Matters:** The backend has no mechanism to create, query, validate, or manage guests or billing invoices via ORM. Operations that require guest details (contact information, address, identification) or billing generation cannot be performed programmatically in Flask.
- **Recommended Fix:** Implement `Guest` (`guest_model.py`) and `Bill` (`bill_model.py`) models with appropriate columns, constraints, and relationships.

#### Issue 3.2: Missing Foreign Key Constraints and Relationships in `Booking` Model
- **Severity:** HIGH
- **File / Location:** `backend/app/models/booking_model.py`
- **Problem:** `guest_id = db.Column(db.Integer)` and `room_id = db.Column(db.Integer)` are declared as plain integer columns without `db.ForeignKey('guests.guest_id')` and `db.ForeignKey('rooms.room_id')`. No `db.relationship` declarations exist.
- **Why It Matters:** 
  1. SQLAlchemy will not enforce referential integrity or emit foreign keys in auto-generated DDL.
  2. Developers cannot navigate relationships (e.g., `booking.room` or `booking.guest`).
  3. Queries require manual joins rather than idiomatic ORM relationships, increasing query complexity and bug density.
- **Recommended Fix:** Add explicit foreign keys and relationship definitions:
  ```python
  guest_id = db.Column(db.Integer, db.ForeignKey('guests.guest_id'), nullable=False)
  room_id = db.Column(db.Integer, db.ForeignKey('rooms.room_id'), nullable=False)
  room = db.relationship('Room', backref=db.backref('bookings', lazy=True))
  guest = db.relationship('Guest', backref=db.backref('bookings', lazy=True))
  ```

#### Issue 3.3: Missing Critical Domain Fields in `Room` and `Booking` Models
- **Severity:** HIGH
- **File / Location:** `backend/app/models/room_model.py`, `backend/app/models/booking_model.py`
- **Problem:**
  - `Room` lacks `price_per_night` (or `price`), `room_number`, `capacity`, `description`, and `created_at`.
  - `Booking` lacks `total_amount`, `status` (e.g., `confirmed`, `checked_in`, `checked_out`, `cancelled`), and `created_at`.
  - In `Booking`, `check_in_date` defaults to `date.today` on the application server rather than database-level defaulting, and `check_out_date` is nullable and never set during booking.
- **Why It Matters:** Without room pricing, the system cannot compute bills. Without booking status, the system cannot distinguish between an active stay, a reserved stay, and a past booking. Without room numbers, hotel staff cannot know which physical room is assigned if `room_id` is an internal surrogate key.
- **Recommended Fix:** Add the missing columns, enforce `nullable=False` where appropriate, add a status `Enum`, and include `created_at`/`updated_at` audit timestamps on all entities.

#### Issue 3.4: Complete Absence of Database Migration Tooling
- **Severity:** HIGH
- **File / Location:** `backend/`
- **Problem:** No database migration framework (e.g. Flask-Migrate / Alembic) is configured.
- **Why It Matters:** There is no version-controlled mechanism to apply schema updates, indexes, or column changes across environments. Schema changes must be manually applied via raw SQL scripts, leading to schema drift between development, staging, and production databases.
- **Recommended Fix:** Integrate `Flask-Migrate`, initialize Alembic (`flask db init`), and generate baseline migration scripts.

---

### 4. Authentication & JWT

#### Issue 4.1: Username Enumeration Vulnerability on Login
- **Severity:** MEDIUM
- **File / Location:** `backend/app/services/auth_service.py`
- **Problem:** The authentication service returns distinct error messages depending on failure cause:
  - If username does not exist: `{"error": "Invalid username"}, 401`
  - If password does not match: `{"error": "Invalid password"}, 401`
- **Why It Matters:** Attackers can perform automated username enumeration to discover valid usernames on the system before launching brute-force password attacks.
- **Recommended Fix:** Return a generic error message for both cases:
  ```python
  if not user or not check_password_hash(user.password, password):
      return {"error": "Invalid username or password"}, 401
  ```

#### Issue 4.2: Missing JWT Expiration, Refresh Token Mechanism, and Revocation
- **Severity:** HIGH
- **File / Location:** `backend/config.py`, `backend/app/services/auth_service.py`
- **Problem:** `JWT_ACCESS_TOKEN_EXPIRES` is not configured in `config.py` (defaulting to Flask-JWT-Extended's 15 minutes). No refresh token generation or refresh endpoint exists. Furthermore, no token blocklist/revocation mechanism is implemented.
- **Why It Matters:** Users will be abruptly logged out every 15 minutes with no seamless token renewal. Conversely, if a token is compromised or a user logs out, the token remains valid until expiry with no way to invalidate it server-side.
- **Recommended Fix:** Configure explicit access token and refresh token lifetimes (e.g., access: 15-30 mins, refresh: 7-30 days), provide a `/refresh` endpoint, and implement a Redis-backed or database token blocklist (`@jwt.token_in_blocklist_loader`).

#### Issue 4.3: Missing JWT Error Handlers
- **Severity:** MEDIUM
- **File / Location:** `backend/app/__init__.py`
- **Problem:** No custom error loaders (`expired_token_loader`, `invalid_token_loader`, `unauthorized_loader`) are registered with `jwt`.
- **Why It Matters:** If a token is expired or missing, Flask-JWT-Extended emits default responses which may not match the rest of the API's JSON response contract, leading to inconsistent client-side error handling.
- **Recommended Fix:** Register standard callback handlers on `jwt` in `create_app()` returning `{ "error": "...", "code": "TOKEN_EXPIRED" }`.

#### Issue 4.4: Incompatible Plaintext Passwords in Seed Data
- **Severity:** HIGH
- **File / Location:** `hotel-management-system/hotel_db.sql`, `backend/app/services/auth_service.py`
- **Problem:** The SQL seed file inserts an admin user with a plaintext password:
  `INSERT INTO users (username, password, role) VALUES ('admin', 'admin123', 'admin');`
  However, `auth_service.py` evaluates passwords using `check_password_hash(user.password, password)`.
- **Why It Matters:** When the database is initialized using `hotel_db.sql`, `check_password_hash` fails against the raw `'admin123'` string (or Werkzeug logs a warning/raises an error because `'admin123'` is not a valid hash format). Admin login will fail immediately on a freshly seeded database.
- **Recommended Fix:** Create a CLI command or seed script (`flask seed-db` or `python seed.py`) that hashes passwords using `generate_password_hash()` before inserting default users.

---

### 5. Authorization & Roles

#### Issue 5.1: Fragile `role_required` Decorator with Unhandled `KeyError`
- **Severity:** HIGH
- **File / Location:** `backend/app/utils/role_required.py`
- **Problem:**
  ```python
  claims = get_jwt()
  if claims["role"] != required_role:
      return jsonify({"error": "Access denied"}), 403
  ```
  1. `claims["role"]` uses direct dictionary lookup. If a token lacks the `"role"` claim, it raises an unhandled `KeyError: 'role'`, causing a 500 Internal Server Error instead of a 403 Forbidden.
  2. If `@role_required` is accidentally placed before `@jwt_required()` on a route, `get_jwt()` will fail or return an empty dictionary.
  3. The decorator only supports a single exact role (`required_role`). It cannot accept a list of roles (e.g., `["admin", "manager"]`) or support role hierarchy.
- **Why It Matters:** Minor token payload variations or missing claims crash worker threads with 500 errors. Inflexible role authorization prevents staff from accessing endpoints when multiple roles need permission.
- **Recommended Fix:** Use `claims.get("role")`, verify `@jwt_required()` status, and allow multiple allowed roles:
  ```python
  def role_required(*allowed_roles):
      def decorator(fn):
          @wraps(fn)
          def wrapper(*args, **kwargs):
              claims = get_jwt()
              user_role = claims.get("role")
              if not user_role or user_role not in allowed_roles:
                  return jsonify({"error": "Access denied"}), 403
              return fn(*args, **kwargs)
          return wrapper
      return decorator
  ```

#### Issue 5.2: Role Lockout: `GET /rooms` Restricted Exclusively to Admin
- **Severity:** HIGH
- **File / Location:** `backend/app/routes/room_routes.py`
- **Problem:**
  ```python
  @room_bp.route("/rooms", methods=["GET"])
  @jwt_required()
  @role_required("admin")
  def get_rooms():
  ```
- **Why It Matters:** In a hotel management system, receptionists are the primary staff members who need to view room listings, check statuses, and assign rooms to arriving guests. Restricting `GET /rooms` exclusively to `"admin"` prevents receptionists from performing core front-desk duties.
- **Recommended Fix:** Allow both `"admin"` and `"receptionist"` roles to query room listings (`@role_required("admin", "receptionist")`).

---

### 6. API Routes

#### Issue 6.1: Missing Blueprint URL Prefixes & Inconsistent URL Conventions
- **Severity:** MEDIUM
- **File / Location:** `backend/app/__init__.py`
- **Problem:** All blueprints are registered at the application root without URL prefixes or API versioning:
  ```python
  app.register_blueprint(auth_bp)       # exposes /login
  app.register_blueprint(booking_bp)    # exposes /book-room
  app.register_blueprint(room_bp)       # exposes /rooms, /auto-assign-room
  app.register_blueprint(dashboard_bp)  # exposes /dashboard/stats
  ```
  Furthermore, route names violate REST conventions by using verbs in URIs (`/book-room`, `/auto-assign-room`).
- **Why It Matters:** Lack of prefixes (`/api/v1/...`) makes API versioning impossible, prevents reverse proxies from properly routing API traffic, and risks route collisions between different modules.
- **Recommended Fix:** Register blueprints with versioned prefixes (e.g. `app.register_blueprint(booking_bp, url_prefix="/api/v1/bookings")`) and adopt standard REST resource endpoints (e.g. `POST /api/v1/bookings` instead of `/book-room`).

#### Issue 6.2: Missing Essential CRUD Endpoints Across All Resources
- **Severity:** HIGH
- **File / Location:** `backend/app/routes/`
- **Problem:** The API only exposes 5 endpoints in total:
  - `POST /login`
  - `GET /rooms`
  - `POST /auto-assign-room`
  - `POST /book-room`
  - `GET /dashboard/stats`
  The system lacks:
  - Rooms: No `POST /rooms` (create), `GET /rooms/<id>`, `PUT /rooms/<id>` (update status/cleanliness), `DELETE /rooms/<id>`.
  - Bookings: No `GET /bookings` (list bookings), `GET /bookings/<id>`, `PUT /bookings/<id>`, `DELETE /bookings/<id>`, `POST /bookings/<id>/check-out`.
  - Guests: 0 endpoints (no way to list, search, or create guests).
  - Bills / Billing: 0 endpoints.
  - Users / Staff: 0 endpoints (no way to manage staff accounts).
- **Why It Matters:** The backend only covers fractional fragments of a hotel workflow. Once a room is booked, staff cannot even list existing bookings or check a guest out.
- **Recommended Fix:** Implement standard RESTful CRUD routes across Rooms, Bookings, Guests, and Users.

#### Issue 6.3: Production Print Statements in Route Handlers
- **Severity:** LOW
- **File / Location:** `backend/app/routes/room_routes.py`
- **Problem:**
  ```python
  print("Username:", current_user)
  print("Claims:", claims)
  ```
- **Why It Matters:** Hardcoded `print()` statements clutter stdout in production, cannot be filtered by log levels, and expose user identity and token claims in console logs.
- **Recommended Fix:** Replace `print` statements with Python's standard `logging` module configured with appropriate log levels (`logger.debug(...)`).

---

### 7. Services & Business Logic

#### Issue 7.1: Architectural Leak: Route Bypasses Service Layer
- **Severity:** MEDIUM
- **File / Location:** `backend/app/routes/room_routes.py`
- **Problem:** `get_rooms()` executes `Room.query.all()` directly inside the route handler, bypassing `room_service.py` entirely.
- **Why It Matters:** Violates the separation of concerns established throughout the rest of the application. Business logic, filtering, and query optimizations should reside in the service layer, keeping routes thin.
- **Recommended Fix:** Move room query and serialization logic to a `get_all_rooms()` function in `room_service.py`.

#### Issue 7.2: `auto_assign_room` Does Not Assign Any Room (Misleading Read-Only Logic)
- **Severity:** HIGH
- **File / Location:** `backend/app/services/room_service.py`
- **Problem:** The function `auto_assign_room(room_type)` merely queries:
  ```python
  room = Room.query.filter_by(
      room_type=room_type,
      status="available",
      cleaned=True
  ).first()
  ```
  It does not reserve the room, change its status, attach a guest, or create any booking lock.
- **Why It Matters:** Calling `POST /auto-assign-room` performs a read query mislabeled as an assignment. If two users request room auto-assignment, both receive the exact same room ID, creating an immediate collision when they proceed to book.
- **Recommended Fix:** Rename to `find_available_room` if meant as a query, or if it is meant to assign, perform an atomic reservation with a temporary hold status or associate it immediately with a booking transaction.

#### Issue 7.3: Inefficient Multiple Count Queries in Dashboard Service
- **Severity:** LOW
- **File / Location:** `backend/app/services/dashboard_service.py`
- **Problem:** `get_dashboard_stats()` runs 4 independent `SELECT COUNT(*)` queries across `rooms` and `bookings`.
- **Why It Matters:** Each count query requires a round-trip to the database. As room inventory and booking history expand, sequential round-trips add unnecessary latency.
- **Recommended Fix:** Aggregate room counts in a single query using `func.count()` grouped by `status`, or run a combined query.

---

### 8. Error Handling

#### Issue 8.1: Missing Global Error Handlers
- **Severity:** HIGH
- **File / Location:** `backend/app/__init__.py`
- **Problem:** No application error handlers (`@app.errorhandler(404)`, `@app.errorhandler(500)`, `@app.errorhandler(Exception)`) are registered.
- **Why It Matters:** When unhandled exceptions occur (e.g. database connection failure, uncaught type error, or database integrity error), Flask returns an HTML page containing internal error details or stack traces instead of a structured JSON response. API clients (such as single-page web apps or mobile apps) cannot parse HTML error responses.
- **Recommended Fix:** Register centralized JSON error handlers for `400`, `404`, `422`, `500`, and `SQLAlchemyError`.

#### Issue 8.2: Missing Database Transaction Rollback on Failure
- **Severity:** CRITICAL
- **File / Location:** `backend/app/services/booking_service.py`
- **Problem:**
  ```python
  db.session.add(booking)
  db.session.commit()
  ```
  There is no `try...except` block wrapping `db.session.commit()`, and no `db.session.rollback()`.
- **Why It Matters:** If `db.session.commit()` fails (e.g. due to database disconnection, deadlock, or foreign key violation on `guest_id`), the SQLAlchemy session remains in a poisoned, un-rolled-back state. Subsequent requests handled by that worker process may fail with `InvalidRequestError: This Session's transaction has been aborted due to a previous exception`.
- **Recommended Fix:** Wrap database operations in a try/except block with rollback:
  ```python
  try:
      db.session.add(booking)
      db.session.commit()
  except Exception as e:
      db.session.rollback()
      raise e
  ```

#### Issue 8.3: Unhandled `None` from `request.get_json()`
- **Severity:** HIGH
- **File / Location:** 
  - `backend/app/routes/auth_routes.py`
  - `backend/app/routes/room_routes.py`
  - `backend/app/routes/booking_routes.py`
- **Problem:** All POST route handlers execute:
  ```python
  data = request.get_json()
  val = data.get("...")
  ```
  If a request arrives without a `Content-Type: application/json` header, with an empty request body, or with malformed JSON, `request.get_json()` returns `None`. Calling `data.get(...)` immediately raises `AttributeError: 'NoneType' object has no attribute 'get'`.
- **Why It Matters:** Triggers an unhandled 500 Internal Server Error instead of returning a 400 Bad Request to the client.
- **Recommended Fix:** Guard against missing/malformed JSON:
  ```python
  data = request.get_json(silent=True)
  if not data:
      return jsonify({"error": "Invalid or missing JSON payload"}), 400
  ```

---

### 9. Validation

#### Issue 9.1: Total Absence of Request Payload Validation Schemas
- **Severity:** HIGH
- **File / Location:** Across all route handlers (`auth_routes.py`, `booking_routes.py`, `room_routes.py`)
- **Problem:** Validation is performed purely through ad-hoc checks such as `if not guest_id or not room_id:`. There is no schema validation library (e.g. Marshmallow, Pydantic, or Cerberus).
- **Why It Matters:** 
  1. No data type validation: If a client sends `"guest_id": "abc"` or `"guest_id": -5`, it passes the `if not guest_id` truthiness check and is passed directly into the database query, causing a database crash or unexpected behavior.
  2. No boundary checks: String lengths (e.g. username > 50 characters, which exceeds `db.String(50)`) are not checked, triggering unhandled MySQL truncation or data exception errors.
  3. No sanitization against injection or unexpected fields.
- **Recommended Fix:** Introduce a schema validation layer (such as `marshmallow` or `pydantic`) with strict typing, length constraints, and automated 400/422 error generation.

---

### 10. Booking and Room Logic

#### Issue 10.1: Concurrency Race Condition: TOCTOU Double-Booking
- **Severity:** CRITICAL
- **File / Location:** `backend/app/services/booking_service.py`
- **Problem:** The booking flow follows a "Time-of-Check to Time-of-Use" (TOCTOU) pattern:
  ```python
  room = Room.query.filter_by(room_id=room_id).first()
  if room.status != "available":
      return {"error": "Room not available"}, 400
  # ...
  booking = Booking(guest_id=guest_id, room_id=room_id)
  room.status = "occupied"
  db.session.add(booking)
  db.session.commit()
  ```
  There is no database-level row locking (`with_for_update()`), optimistic concurrency versioning, or database constraint.
- **Why It Matters:** If two concurrent requests attempt to book the same room at the same time:
  1. Request 1 reads `room.status == "available"`.
  2. Request 2 reads `room.status == "available"` before Request 1 commits.
  3. Both requests proceed to create a `Booking` record.
  4. Both commit successfully.
  Two separate guests are booked into the exact same room for the same date. In hospitality software, double-booking is a catastrophic business and reputational failure.
- **Recommended Fix:** Utilize pessimistic row locking within a transaction:
  ```python
  room = db.session.query(Room).filter_by(room_id=room_id).with_for_update().first()
  ```
  Or enforce a unique constraint / exclusion constraint on active room reservations.

#### Issue 10.2: Flawed Hotel Booking Domain Logic (No Date Ranges, No Advance Booking)
- **Severity:** CRITICAL
- **File / Location:** `backend/app/services/booking_service.py`
- **Problem:** 
  1. The booking service does not accept or validate `check_in_date` or `check_out_date`.
  2. It immediately sets `room.status = "occupied"` at booking creation time.
- **Why It Matters:**
  1. Advance booking is impossible: If a guest wants to book a room for next week, the room is immediately marked "occupied" today, preventing any guest from staying in it between now and next week.
  2. A booking represents a reservation for a date interval `[check_in, check_out]`, not an immediate status override. Physical room occupancy should only be marked when the guest actually arrives and checks in.
  3. Overlapping date availability checks are completely absent.
- **Recommended Fix:** Redesign the booking domain model:
  - Require `check_in_date` and `check_out_date` with validation (`check_out_date > check_in_date >= date.today()`).
  - Check availability by verifying that no overlapping confirmed booking exists for that room during the requested date range:
    ```sql
    WHERE room_id = :room_id 
      AND status = 'confirmed' 
      AND NOT (check_out_date <= :new_check_in OR check_in_date >= :new_check_out)
    ```
  - Separate `Booking.status` (`reserved`, `checked_in`, `completed`, `cancelled`) from `Room.status` (`available`, `occupied`, `maintenance`).

#### Issue 10.3: Missing Guest Existence Validation
- **Severity:** HIGH
- **File / Location:** `backend/app/services/booking_service.py`
- **Problem:** `create_booking(guest_id, room_id)` accepts `guest_id` without verifying whether the guest exists in the database.
- **Why It Matters:** If foreign key constraints are enforced in MySQL (`FOREIGN KEY (guest_id) REFERENCES guests(guest_id)` as declared in `hotel_db.sql`), providing an invalid `guest_id` causes MySQL to throw an `IntegrityError (1452)`. Because there is no error handler or transaction rollback, the request crashes with a 500 error. If foreign keys are not enforced, it creates corrupted orphaned booking records.
- **Recommended Fix:** Query and verify the guest record exists before creating the booking, returning a 404 if not found:
  ```python
  guest = Guest.query.get(guest_id)
  if not guest:
      return {"error": "Guest not found"}, 404
  ```

#### Issue 10.4: Complete Absence of Check-Out & Room Turnover Lifecycle
- **Severity:** HIGH
- **File / Location:** `backend/app/services/booking_service.py`
- **Problem:** Once a room is marked `status = "occupied"`, there is no service or route in the entire backend to check out a guest, release the room, mark it dirty (`cleaned = False`), or return it to available inventory.
- **Why It Matters:** After a room is booked once, it remains permanently "occupied" forever. The hotel runs out of rooms permanently after each room is booked a single time.
- **Recommended Fix:** Implement a check-out service that updates `Booking.status = "checked_out"`, sets `Booking.check_out_date`, updates `Room.status = "available"`, and sets `Room.cleaned = False` (triggering housekeeping workflow).

---

### 11. Security

#### Issue 11.1: Completely Unauthenticated Booking & Auto-Assignment Endpoints
- **Severity:** CRITICAL
- **File / Location:** 
  - `backend/app/routes/booking_routes.py`
  - `backend/app/routes/room_routes.py`
- **Problem:** Neither `POST /book-room` nor `POST /auto-assign-room` has `@jwt_required()` or any authentication decorator.
- **Why It Matters:** Any anonymous user on the internet can call `/book-room` and exhaust room inventory by booking every room in the hotel without logging in or providing any valid credentials.
- **Recommended Fix:** Protect both routes with `@jwt_required()` and appropriate role checks (`@role_required("admin", "receptionist")`).

#### Issue 11.2: Hardcoded Debug Mode Enabled in Application Runner
- **Severity:** CRITICAL
- **File / Location:** `backend/run.py`
- **Problem:**
  ```python
  if __name__ == "__main__":
      app.run(debug=True)
  ```
- **Why It Matters:** If `debug=True` is executed in a production environment, Werkzeug's interactive web debugger is enabled. If an unhandled exception occurs, an attacker can access the interactive console and execute arbitrary Python code directly on the host server.
- **Recommended Fix:** Set `debug` dynamically via environment variable (`debug=os.getenv("FLASK_DEBUG", "False").lower() == "true"`), and never use `app.run()` for production serving.

#### Issue 11.3: Lack of Rate Limiting (Brute-Force Vulnerability)
- **Severity:** HIGH
- **File / Location:** `backend/app/routes/auth_routes.py`
- **Problem:** The `/login` endpoint has no rate limiting (e.g. Flask-Limiter).
- **Why It Matters:** Attackers can send unlimited credential-stuffing and brute-force password guessing attempts without detection, throttling, or account lockout.
- **Recommended Fix:** Integrate `Flask-Limiter` and apply strict rate limits (e.g. 5 requests per minute per IP) to the `/login` endpoint.

#### Issue 11.4: Missing Security Headers
- **Severity:** MEDIUM
- **File / Location:** `backend/app/__init__.py`
- **Problem:** No HTTP security headers (`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`) are configured on responses.
- **Why It Matters:** Leaves clients vulnerable to MIME-sniffing, clickjacking, and man-in-the-middle downgrade attacks.
- **Recommended Fix:** Integrate `Flask-Talisman` or an `after_request` hook to inject standard OWASP recommended security headers.

---

### 12. Tests

#### Issue 12.1: Zero Test Coverage
- **Severity:** CRITICAL
- **File / Location:** Repository-wide (`backend/`)
- **Problem:** There are no tests in the repository (no `tests/` directory, no unit tests, no integration tests, no test fixtures). Code coverage is 0.0%.
- **Why It Matters:** There is zero verification that any route, authentication flow, or booking transaction works correctly. Any refactoring, bug fix, or dependency update can introduce regressions without detection.
- **Recommended Fix:** Create a `tests/` suite using `pytest`, configured with an in-memory SQLite database or isolated test MySQL instance, covering auth, authorization, booking race conditions, and error responses.

---

### 13. Production Readiness & Deployment

#### Issue 13.1: No Production WSGI Server Configuration
- **Severity:** HIGH
- **File / Location:** `backend/run.py`
- **Problem:** The only entry point is `run.py` invoking Flask's built-in single-threaded development server.
- **Why It Matters:** The Flask development server is not designed for production workloads, does not handle concurrent traffic reliably, and is prone to denial-of-service under high load.
- **Recommended Fix:** Use a production WSGI server such as `gunicorn` (Linux) or `waitress` (Windows/cross-platform) with configurable worker processes and threads (e.g. `gunicorn -w 4 -b 0.0.0.0:5000 "app:create_app()"`).

#### Issue 13.2: Missing Health Check & Monitoring Endpoints
- **Severity:** MEDIUM
- **File / Location:** `backend/app/routes/`
- **Problem:** There is no `/health` or `/ready` endpoint that checks application liveness and database connectivity.
- **Why It Matters:** Container orchestrators (Kubernetes, AWS ECS) and load balancers cannot perform health probes to determine whether an application container is healthy or should be restarted.
- **Recommended Fix:** Add a `/health` endpoint that executes a lightweight query (`db.session.execute(text('SELECT 1'))`) and reports service status.

---

## Production-Readiness Score

### **Score: 1.5 / 10**

| Dimension | Weight | Score (/10) | Weighted | Justification |
| :--- | :---: | :---: | :---: | :--- |
| **Project Structure & Dependencies** | 10% | 1.0 | 0.10 | Empty `requirements.txt`, broken `venv`, compiled `.pyc` tracked in git. |
| **Configuration & Secrets** | 10% | 1.0 | 0.10 | `.env` tracked with root credentials, hardcoded debug mode, no pooling. |
| **Database & Models** | 15% | 2.0 | 0.30 | Missing `Guest` & `Bill` models, missing FKs/relationships, no migrations. |
| **Authentication & Authorization** | 15% | 2.5 | 0.38 | Weak JWT setup, no refresh, fragile role check, receptionist locked out of rooms. |
| **Business Logic & Booking** | 20% | 1.0 | 0.20 | TOCTOU double-booking race condition, no date ranges, no checkout mechanism. |
| **API Design & Validation** | 10% | 2.0 | 0.20 | Unauthenticated booking/assign, no schema validation, unhandled `None` JSON. |
| **Security & Hardening** | 10% | 1.0 | 0.10 | Exposed credentials, unauthenticated actions, no rate limits, wildcard CORS. |
| **Testing & Quality** | 10% | 0.0 | 0.00 | Complete absence of tests (0% test coverage). |
| **Deployment & Ops Readiness** | 10% | 1.0 | 0.10 | No WSGI server, no health check, single-threaded dev server entry point. |
| **Overall Total** | **100%** | — | **1.48 / 10** | **Rounded: 1.5 / 10** |

---

## Top 5 Issues

1. **Unauthenticated Sensitive Endpoints & Committed Secrets (Security Disaster):**
   - Both `/book-room` and `/auto-assign-room` can be executed by anyone on the public internet without authentication. Simultaneously, production database passwords and JWT signing keys are checked directly into the public Git repository.
2. **Double-Booking TOCTOU Race Condition (Data Integrity & Business Failure):**
   - The booking transaction checks room availability and updates status without row-level locking or optimistic concurrency controls, allowing concurrent requests to double-book the exact same room.
3. **Flawed Booking Domain & Missing Lifecycle (Functional Breakdown):**
   - Bookings do not record check-out dates or check date overlaps, immediately setting rooms to "occupied". There is no check-out endpoint or room cleaning reset, meaning rooms can never be released back into inventory.
4. **Empty `requirements.txt` & Broken Runtime Environment (Deployability Blocker):**
   - The dependency manifest is 0 bytes and the bundled virtual environment contains invalid absolute paths from an external workstation, making deployment or reproduction impossible.
5. **Missing Domain Models & Referential Integrity (Schema Breakdown):**
   - `Guest` and `Bill` models are missing from the ORM. `Booking` has no foreign key relationships, leading to unhandled database exceptions and orphaned records.

---

## Recommended Fix Order

To transition this backend from an unstable prototype to a robust, secure, production-grade application, execute fixes in the following prioritized phases:

### Phase 1: Environment, Dependencies & Secret Remediation (Immediate / Day 1)
1. **Rotate and Clean Secrets:**
   - Remove `backend/.env` and `__pycache__` from Git tracking (`git rm --cached`).
   - Create a root `.gitignore` ignoring `.env`, `venv/`, `__pycache__/`, and `.pyc`.
   - Rotate database passwords and JWT secret keys.
   - Create a `.env.example` file.
2. **Dependency Manifest & Runtime Fix:**
   - Populate `backend/requirements.txt` with pinned dependencies.
   - Remove the broken `backend/venv/` directory.

### Phase 2: Security & Authentication Hardening (Days 2–3)
3. **Lock Down Endpoints:**
   - Add `@jwt_required()` to `POST /book-room` and `POST /auto-assign-room`.
   - Update `role_required` decorator to safely handle missing claims (`claims.get("role")`) and support multiple allowed roles.
   - Allow receptionists and admins to access `GET /rooms`.
4. **Harden Auth Service:**
   - Unify login error messages to prevent username enumeration.
   - Implement rate limiting (`Flask-Limiter`) on `/login`.
   - Seed database users with hashed passwords (`werkzeug.security` or `bcrypt`) instead of plaintext.

### Phase 3: Database Models & Migration Framework (Days 4–5)
5. **Complete ORM Models:**
   - Implement `Guest` and `Bill` models in `app/models/`.
   - Add `ForeignKey` and `db.relationship` on `Booking` (`guest_id`, `room_id`).
   - Add missing attributes: `price_per_night` to `Room`, `status`, `total_price`, and `created_at` to `Booking`.
6. **Integrate Migrations:**
   - Configure `Flask-Migrate` and generate an initial Alembic migration.

### Phase 4: Core Booking Logic & Concurrency Control (Days 6–7)
7. **Fix Double-Booking Race Condition:**
   - Wrap booking creation in an explicit transaction with pessimistic locking (`with_for_update()`).
8. **Re-Architect Booking Flow:**
   - Accept and validate `check_in_date` and `check_out_date`.
   - Implement date-range collision detection rather than instantaneous room status flipping.
   - Implement check-out service (`POST /bookings/<id>/check-out`) that releases rooms and marks them dirty for housekeeping.

### Phase 5: Architecture, Validation & Operational Readiness (Days 8–10)
9. **API Standardization & Validation:**
   - Add URL prefixes (`/api/v1`) to all blueprints.
   - Add input validation schemas (Marshmallow or Pydantic) to reject invalid/malformed payloads.
   - Register global error handlers returning standard JSON responses.
10. **Testing & Production Ops:**
    - Establish a `pytest` suite covering auth, booking concurrency, and room lifecycle.
    - Configure a production WSGI server (`gunicorn` / `waitress`).
    - Add a database-backed `/health` endpoint.
