# Preflight Data Migration Audit Report

**Document:** `docs/DATA_MIGRATION_PREFLIGHT.md`  
**Execution Date:** 2026-09-23  
**Target Environment:** Local MySQL Database (`hotel_db`)  
**Audit Mode:** READ-ONLY Inspection (Non-mutating)  
**Reference Specification:** `docs/DATA_MIGRATION_PLAN.md`  

---

## 1. Executive Summary & Verdict

A comprehensive, non-mutating preflight audit of the live legacy MySQL database (`hotel_db`) was performed to evaluate its readiness for the 3-phase Alembic migration.

### Final Preflight Status: **PASS WITH WARNINGS**

* **Blocker Count:** **0** (No active schema or data integrity blockers detected).
* **Warning Count:** **1** (Legacy `rooms.room_id` primary key lacks `AUTO_INCREMENT` attribute).
* **Info Findings:** **6** (Clean baseline states across users, room types, bookings, guests, and bills).

All existing database rows and schema constraints are 100% compatible with the deterministic transformation rules defined in [`docs/DATA_MIGRATION_PLAN.md`](file:///c:/Devesh/Devesh_Chauhan/projects/hotel-management/docs/DATA_MIGRATION_PLAN.md).

---

## 2. Detailed Audit Findings by Category

### 2.1 Duplicate Bills & Folio Integrity

Evaluated whether legacy `bills` records violate the production 1:1 booking folio constraint (`UNIQUE(booking_id)`).

* **Inspection Query**:
  ```sql
  SELECT booking_id, COUNT(*) AS bill_count, GROUP_CONCAT(bill_id) AS bill_ids, SUM(amount) AS total_amount
  FROM bills
  GROUP BY booking_id
  HAVING bill_count > 1;
  ```
* **Severity**: **`INFO`**
* **Affected Row Count**: `0` rows (Total bills in database: `0`).
* **Example IDs / Values**: None (Table is currently empty).
* **Migration Plan Coverage**: Yes. Section 2.5 and Section 8 of `DATA_MIGRATION_PLAN.md` explicitly define pre-flight duplicate consolidation rules.
* **Required Action Before Migration**: None required. Zero duplicate bookings exist.

---

### 2.2 Guest Data Integrity

Evaluated legacy `guests` for missing phone numbers, blank names, and duplicate contact information.

* **Inspection Queries**:
  ```sql
  -- Missing or blank phones
  SELECT COUNT(*) FROM guests WHERE phone IS NULL OR TRIM(phone) = '';

  -- Missing or blank names
  SELECT COUNT(*) FROM guests WHERE name IS NULL OR TRIM(name) = '';

  -- Duplicate emails
  SELECT email, COUNT(*) AS cnt FROM guests WHERE email IS NOT NULL AND TRIM(email) != '' GROUP BY email HAVING cnt > 1;

  -- Name length violations (> 50 chars)
  SELECT COUNT(*) FROM guests WHERE LENGTH(TRIM(name)) > 50;
  ```
* **Severity**: **`INFO`**
* **Affected Row Count**: `0` rows (Total guests in database: `0`).
* **Example IDs / Values**: None (Table is currently empty).
* **Migration Plan Coverage**: Yes.
  - Name tokenization uses `SUBSTRING_INDEX` with fallback defaults (`'Unknown'`, `'Guest'`).
  - Missing phones are assigned the explicit semantic sentinel `'UNSPECIFIED'`, avoiding fake numbers while satisfying `NOT NULL` and `CHECK (LENGTH(TRIM(phone)) > 0)`.
* **Required Action Before Migration**: None.

---

### 2.3 Legacy Room Types & Classification Coverage

Evaluated every distinct value in `rooms.room_type` against the explicit deterministic lookup dictionary specified in Section 3.3A of `DATA_MIGRATION_PLAN.md`.

* **Inspection Query**:
  ```sql
  SELECT room_type, COUNT(*) AS room_count, GROUP_CONCAT(room_id) AS room_ids
  FROM rooms
  GROUP BY room_type;
  ```
* **Live Query Results**:

  | Distinct `rooms.room_type` | Count | Room IDs | Explicit Mapping Status | Target `name` | Target `code` | Target `base_price` | Target `max_occupancy` | Target `bed_config` |
  | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
  | `'Single'` | `1` | `1` | **Fully Covered** | `'Single'` | `'SINGLE'` | `100.00` | `1` | `'1 Single Bed'` |
  | `'Deluxe'` | `1` | `2` | **Fully Covered** | `'Deluxe'` | `'DELUXE'` | `250.00` | `2` | `'1 King Bed'` |

* **Unmapped Values Identified**: **None** (`0`).
* **Severity**: **`INFO`**
* **Affected Row Count**: `2` rows inspected, `0` unmapped.
* **Migration Plan Coverage**: Yes. Both existing room types match explicit dictionary keys in `DATA_MIGRATION_PLAN.md` with 100% deterministic pricing and occupancy assignments.
* **Required Action Before Migration**: None.

---

### 2.4 Booking Integrity & Chronology

Evaluated legacy `bookings` for missing dates, invalid date ranges, and foreign key reference integrity.

* **Inspection Queries**:
  ```sql
  -- Missing check-in or check-out dates
  SELECT COUNT(*) FROM bookings WHERE check_in_date IS NULL;
  SELECT COUNT(*) FROM bookings WHERE check_out_date IS NULL;

  -- Chronological inversions (check-out <= check-in)
  SELECT COUNT(*) FROM bookings WHERE check_out_date IS NOT NULL AND check_out_date <= check_in_date;

  -- Orphaned bookings referencing non-existent guests
  SELECT COUNT(*) FROM bookings b LEFT JOIN guests g ON b.guest_id = g.guest_id WHERE g.guest_id IS NULL AND b.guest_id IS NOT NULL;

  -- Orphaned bookings referencing non-existent rooms
  SELECT COUNT(*) FROM bookings b LEFT JOIN rooms r ON b.room_id = r.room_id WHERE r.room_id IS NULL AND b.room_id IS NOT NULL;
  ```
* **Severity**: **`INFO`**
* **Affected Row Count**: `0` rows (Total bookings in database: `0`).
* **Example IDs / Values**: None.
* **Migration Plan Coverage**: Yes. Chronological repairs (`DATE_ADD(check_in_date, INTERVAL 1 DAY)`) and fallback guest associations are defined in `DATA_MIGRATION_PLAN.md`.
* **Required Action Before Migration**: None.

---

### 2.5 Bill Integrity & Amounts

Evaluated legacy `bills` for missing booking links, negative/NULL amounts, and primary key sequencing.

* **Inspection Queries**:
  ```sql
  -- Orphaned bills referencing non-existent bookings
  SELECT COUNT(*) FROM bills bl LEFT JOIN bookings b ON bl.booking_id = b.booking_id WHERE b.booking_id IS NULL AND bl.booking_id IS NOT NULL;

  -- NULL or negative amounts
  SELECT COUNT(*) FROM bills WHERE amount IS NULL OR amount < 0;

  -- Duplicate bill_id primary keys
  SELECT bill_id, COUNT(*) FROM bills GROUP BY bill_id HAVING COUNT(*) > 1;
  ```
* **Severity**: **`INFO`**
* **Affected Row Count**: `0` rows (Total bills in database: `0`).
* **Example IDs / Values**: None.
* **Migration Plan Coverage**: Yes. Handled by the revised deterministic receivables mapping (`paid_amount = 0.00`, `balance_due = total_amount`, `status = 'issued'`).
* **Required Action Before Migration**: None.

---

### 2.6 User Integrity & Role Enumeration

Evaluated legacy `users` credentials, username uniqueness, and role values against production `user_role_enum`.

* **Inspection Queries**:
  ```sql
  -- Duplicate usernames
  SELECT username, COUNT(*) FROM users GROUP BY username HAVING COUNT(*) > 1;

  -- Unrecognized roles outside user_role_enum
  SELECT DISTINCT role FROM users WHERE role NOT IN ('admin', 'manager', 'receptionist', 'housekeeper', 'maintenance');

  -- Password hash length check (> 255 chars)
  SELECT user_id, username, LENGTH(password) AS pw_len FROM users WHERE LENGTH(password) > 255;
  ```
* **Live Query Results**:
  - Total users: `1` row (`user_id = 1`, `username = 'admin'`, `role = 'admin'`).
  - Password Hash: PBKDF2 SHA-256 hash, length: `95` characters (fits within `VARCHAR(255)`).
  - Role: `'admin'` (valid member of `user_role_enum`).
  - Username duplicates: `0`.
* **Severity**: **`INFO`**
* **Affected Row Count**: `1` row inspected, `0` anomalies.
* **Migration Plan Coverage**: Yes. Password column widening (`VARCHAR(100)` to `VARCHAR(255)`) and role enum mapping completely accommodate this user.
* **Required Action Before Migration**: None.

---

### 2.7 Schema Constraint Compatibility

Evaluated existing DDL and row data against all target SQLAlchemy model constraints (`NOT NULL`, `UNIQUE`, `FK`, `CHECK`, enums, column widths).

#### Finding 2.7.1: Legacy `rooms.room_id` Lacks `AUTO_INCREMENT`
* **Inspection**: Inspected MySQL DDL via `SHOW CREATE TABLE rooms`:
  ```sql
  CREATE TABLE `rooms` (
    `room_id` int NOT NULL,
    `room_type` varchar(50) DEFAULT NULL,
    `status` varchar(20) DEFAULT NULL,
    `cleaned` tinyint DEFAULT NULL,
    PRIMARY KEY (`room_id`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
  ```
* **Target Model Definition**:
  [`backend/app/models/room_model.py:18`](file:///c:/Devesh/Devesh_Chauhan/projects/hotel-management/backend/app/models/room_model.py#L18):
  `room_id = db.Column(db.Integer, primary_key=True, autoincrement=True)`
* **Severity**: **`WARNING`**
* **Affected Row Count**: `2` existing rows (`room_id=1`, `room_id=2`).
* **Impact**:
  - Existing rows are unaffected because they already possess explicit primary keys.
  - However, post-migration room creation in the production Flask application (`db.session.add(Room(...))`) relies on MySQL `AUTO_INCREMENT`. If not modified, inserting new rooms without explicit IDs will fail with `Error 1364: Field 'room_id' doesn't have a default value`.
* **Migration Plan Coverage**: The Alembic migration script should include:
  ```sql
  ALTER TABLE rooms MODIFY room_id INT AUTO_INCREMENT;
  ```
* **Required Action Before Migration**: Incorporate `AUTO_INCREMENT` modification into the Phase 1 Alembic DDL migration.

#### Finding 2.7.2: Room Number Surrogate Key Feasibility
* **Target Constraint**: `rooms.room_number VARCHAR(20) NOT NULL UNIQUE`
* **Evaluation**:
  - `CAST(room_id AS CHAR)` produces `'1'` and `'2'`.
  - Length is 1 character (fits well within `VARCHAR(20)`).
  - Uniqueness is strictly guaranteed by the `room_id` integer primary key.
* **Severity**: **`INFO`**
* **Affected Row Count**: `2` rows.
* **Migration Plan Coverage**: Yes (Phase 2 deterministic backfill).

---

## 3. Summary of Findings & Action Items

| Category | Finding Description | Severity | Affected Rows | Handled by Plan? | Action Required |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Bills** | Duplicate `booking_id` in `bills` | `INFO` | `0` | Yes | None |
| **Guests** | Missing / blank phone numbers | `INFO` | `0` | Yes (`'UNSPECIFIED'`) | None |
| **Guests** | Missing / blank guest names | `INFO` | `0` | Yes (`'Unknown'`) | None |
| **Room Types** | Unmapped `rooms.room_type` values | `INFO` | `0` (Both `Single`, `Deluxe` mapped) | Yes | None |
| **Bookings** | Inverted check-in / check-out dates | `INFO` | `0` | Yes | None |
| **Bookings** | Orphaned foreign keys (guests/rooms) | `INFO` | `0` | Yes | None |
| **Users** | Duplicate usernames / invalid roles | `INFO` | `0` (`admin` clean) | Yes | None |
| **Schema DDL** | `rooms.room_id` lacks `AUTO_INCREMENT` | **`WARNING`** | `2` rows (all rooms) | Partial | Add `MODIFY room_id INT AUTO_INCREMENT` to Phase 1 Alembic DDL |

---

## 4. Exact Pre-Migration Blockers

### Active Blockers: **0**

There are **zero blockers** preventing the generation or execution of the phased Alembic data migration.

### Advisory Pre-conditions for Alembic Migration Scripting:
1. Ensure the Phase 1 Alembic migration script alters `rooms.room_id` to include `AUTO_INCREMENT`.
2. Proceed with Phase 1 migration generation adhering to the deterministic rules in [`docs/DATA_MIGRATION_PLAN.md`](file:///c:/Devesh/Devesh_Chauhan/projects/hotel-management/docs/DATA_MIGRATION_PLAN.md).
