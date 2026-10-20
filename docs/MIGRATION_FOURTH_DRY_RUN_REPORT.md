# Fourth Database Migration Dry Run Execution & Audit Report

**Document:** `docs/MIGRATION_FOURTH_DRY_RUN_REPORT.md`  
**Execution Date:** 2026-10-04  
**Target Environment:** Local MySQL Database (`hotel_db`)  
**Target Revision:** `a006861391be_migrate_legacy_to_production.py`  
**Execution Command:** `flask --app backend/run.py db upgrade`  

---

## 1. Executive Summary & Verdict

The fourth controlled production-schema database migration dry run was executed against the existing local MySQL database (`hotel_db`).

In accordance with strict operational directives:
1. The prior partially migrated database state resulting from previous dry runs was preserved without manual intervention, alteration, or database reset.
2. The dynamic schema inspection guards implemented in Fix 3 successfully prevented duplicate index, foreign key, and constraint creation errors across all tables.
3. The migration command `flask --app backend/run.py db upgrade` executed from start to finish with **zero errors** and completed successfully.
4. Comprehensive, non-mutating read-only post-upgrade verification was conducted across all 12 evaluation criteria:
   - Alembic revision status: `a006861391be (head)` stamped; zero pending migrations.
   - All 9 production tables exist with production schemas.
   - All 6 legacy columns were cleanly decommissioned.
   - Complete data preservation verified: legacy `admin` user intact with password hash and profile attributes; 2 legacy rooms preserved with `AUTO_INCREMENT`, surrogate keys, and foreign keys; 2 normalized `room_types` preserved with exact plan pricing and occupancy.
   - All 15 production foreign keys exist with production nomenclature; legacy `bookings_ibfk_2` and `bills_ibfk_1` are completely removed.
   - All required production indexes, unique constraints, check constraints (19 checks), and NOT NULL constraints are active and verified.
   - Zero orphaned records, zero duplicates, zero unexpected row loss, and zero NULL values in required columns.
   - Full application compatibility verified: Flask factory initializes, SQLAlchemy mapper configuration passes, all 9 models register, all 4 blueprints import cleanly, and `flask db check` reports clean synchronization.

### Final Migration Status: **MIGRATION VERIFIED**

**DATABASE READY FOR APPLICATION REGRESSION TESTING**

---

## 2. Database Identity & Pre-Upgrade Confirmation

Prior to executing the upgrade command, four mandatory pre-flight checks were conducted against the target environment:

1. **Active Database Target**:
   - Connection URI: `mysql+pymysql://root:0000@localhost/hotel_db`
   - Host: `Devesh_laptop`
   - User: `root@localhost`
   - Active Schema: `hotel_db`
2. **Production / Cloud Isolation**:
   - Confirmed no production, remote, or cloud database was targeted. All operations strictly isolated to local development instance.
3. **Alembic Version State**:
   - Query: `SELECT version_num FROM alembic_version;`
   - Result: `[]` (0 rows, unmigrated baseline).
4. **Pre-Upgrade Baseline Inventory**:
   - Total Tables: 10 (`alembic_version`, `bills`, `bookings`, `guests`, `housekeeping`, `maintenance`, `payments`, `room_types`, `rooms`, `users`)
   - Pre-Upgrade Row Counts:
     - `alembic_version`: 0
     - `users`: 1 (`user_id = 1`, `username = 'admin'`, `role = 'admin'`)
     - `rooms`: 2 (`room_id = 1`, `room_id = 2`)
     - `room_types`: 2 (`Single`, `Deluxe` seeded in previous run)
     - `guests`: 0
     - `bookings`: 0
     - `bills`: 0
     - `payments`: 0
     - `housekeeping`: 0
     - `maintenance`: 0
   - Pre-Upgrade Schema Status:
     - `rooms`: Contained legacy columns `room_type`, `status`, `cleaned`. `room_id` already had `AUTO_INCREMENT`.
     - `bookings`: Contained legacy column `booking_date`. Legacy `bookings_ibfk_2` was already dropped.
     - `guests`: Contained legacy column `name`.
     - `bills`: Contained legacy column `amount` and legacy foreign key `bills_ibfk_1`.

---

## 3. Migration Command & Execution Result

### 3.1 Invoked Command
```bash
flask --app backend/run.py db upgrade
```

### 3.2 Execution Output
```text
INFO  [alembic.runtime.migration] Context impl MySQLImpl.
INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> a006861391be, migrate_legacy_to_production
```
* **Exit Code:** `0` (Success)
* **Execution Duration:** ~21 seconds
* **Errors / Warnings:** None. All phases (Additive DDL, Deterministic Backfill, Hardening, and Column Decommissioning) executed cleanly.

---

## 4. Post-Upgrade Read-Only Verification

A comprehensive 12-point read-only audit was conducted immediately following migration completion.

### 4.1 Alembic Revision & Head Alignment
* `flask --app backend/run.py db current`
  ```text
  INFO  [alembic.runtime.migration] Context impl MySQLImpl.
  INFO  [alembic.runtime.migration] Will assume non-transactional DDL.
  a006861391be (head)
  ```
* `flask --app backend/run.py db heads`
  ```text
  a006861391be (head)
  ```
* `flask --app backend/run.py db check`
  - Exit code `0`. Confirms target database schema is in alignment with SQLAlchemy declarative metadata.
* Current Revision: `a006861391be`
* Pending Migrations: **None** (`0`).

### 4.2 Production Tables Verification
All 9 domain tables plus `alembic_version` confirmed present in `hotel_db`:

| Table Name | Present | Engine | Row Count | Status |
| :--- | :---: | :---: | :---: | :--- |
| `users` | Yes | InnoDB | 1 | Production Table Active |
| `guests` | Yes | InnoDB | 0 | Production Table Active |
| `room_types` | Yes | InnoDB | 2 | Production Table Active |
| `rooms` | Yes | InnoDB | 2 | Production Table Active |
| `bookings` | Yes | InnoDB | 0 | Production Table Active |
| `bills` | Yes | InnoDB | 0 | Production Table Active |
| `payments` | Yes | InnoDB | 0 | Production Table Active |
| `housekeeping` | Yes | InnoDB | 0 | Production Table Active |
| `maintenance` | Yes | InnoDB | 0 | Production Table Active |
| `alembic_version` | Yes | InnoDB | 1 | Stamped Revision `a006861391be` |

### 4.3 Legacy Columns Decommissioning
Confirmed obsolete legacy columns have been dropped in Phase 3.11:

| Table | Legacy Column | Column Exists in Schema? | Status |
| :--- | :--- | :---: | :--- |
| `rooms` | `room_type` | **No** (Removed) | Decommissioned |
| `rooms` | `status` | **No** (Removed) | Decommissioned (Preserved via hybrid `@status`) |
| `rooms` | `cleaned` | **No** (Removed) | Decommissioned (Preserved via hybrid `@cleaned`) |
| `guests` | `name` | **No** (Removed) | Decommissioned |
| `bookings` | `booking_date` | **No** (Removed) | Decommissioned (Preserved in `created_at`) |
| `bills` | `amount` | **No** (Removed) | Decommissioned (Preserved in `total_amount`) |

### 4.4 User Record Preservation
Inspection of `users` table:
* **Record Count**: `1`
* **Primary Key**: `user_id = 1`
* **Username**: `'admin'` (Preserved)
* **Password Hash**: `'pbkdf2:sha256:1000000$aJFv3MJO$...'` (Preserved intact; non-truncated)
* **Role**: `'admin'` (Enum value validated)
* **Full Name**: `'Admin'` (Backfilled)
* **Active Status**: `1` (`True`)
* **Email**: `NULL`
* **Timestamps**: `created_at = 2026-01-01 00:00:00`, `updated_at = 2026-01-01 00:00:00`

### 4.5 Physical Rooms Preservation & Hardening
Inspection of `rooms` table:
* **Record Count**: `2`
* **Primary Key Property**: `room_id` has `AUTO_INCREMENT` attribute enabled.
* **Room Records**:
  - **Room 1**:
    - `room_id`: `1`
    - `room_number`: `'1'`
    - `floor`: `1`
    - `room_type_id`: `1`
    - `room_type_name`: `'Single'`
    - `room_type_code`: `'SINGLE'`
    - `operational_status`: `'available'`
    - `cleanliness_status`: `'clean'`
    - `is_smoking`: `0` (`False`)
  - **Room 2**:
    - `room_id`: `2`
    - `room_number`: `'2'`
    - `floor`: `1`
    - `room_type_id`: `2`
    - `room_type_name`: `'Deluxe'`
    - `room_type_code`: `'DELUXE'`
    - `operational_status`: `'available'`
    - `cleanliness_status`: `'clean'`
    - `is_smoking`: `0` (`False`)
* **ORM Compatibility**: Python hybrid property `@status` returns `'available'` for both rooms; `@cleaned` returns `True`.

### 4.6 Room Types Ingestion & Lookup Integrity
Inspection of `room_types` table:
* **Record Count**: `2`
* **Duplicate Codes / Names**: `0`
* **Type Records**:
  - **Type 1**:
    - `room_type_id`: `1`
    - `name`: `'Single'`
    - `code`: `'SINGLE'`
    - `base_price`: `100.00`
    - `max_occupancy`: `1`
    - `bed_config`: `'1 Single Bed'`
    - `is_active`: `1` (`True`)
  - **Type 2**:
    - `room_type_id`: `2`
    - `name`: `'Deluxe'`
    - `code`: `'DELUXE'`
    - `base_price`: `250.00`
    - `max_occupancy`: `2`
    - `bed_config`: `'1 King Bed'`
    - `is_active`: `1` (`True`)
* All values exactly match specification in `docs/DATA_MIGRATION_PLAN.md` Section 3.3A.

### 4.7 Historical Data Tables
Inspection confirmed clean baseline across empty operational tables:
* `guests`: `0` rows
* `bookings`: `0` rows
* `bills`: `0` rows
* `payments`: `0` rows
* `housekeeping`: `0` rows
* `maintenance`: `0` rows

### 4.8 Foreign Key Architecture & Constraints
Every production foreign key was verified using `information_schema.KEY_COLUMN_USAGE`. Exactly 15 foreign keys exist across the database:

| Child Table | Foreign Key Name | Child Column | Referenced Table | Referenced Column | On Delete | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| `rooms` | `fk_rooms_room_type_id_room_types` | `room_type_id` | `room_types` | `room_type_id` | `RESTRICT` | Verified |
| `bookings` | `fk_bookings_room_id_rooms` | `room_id` | `rooms` | `room_id` | `SET NULL` | Verified |
| `bookings` | `fk_bookings_guest_id_guests` | `guest_id` | `guests` | `guest_id` | `RESTRICT` | Verified |
| `bookings` | `fk_bookings_room_type_id_room_types` | `room_type_id` | `room_types` | `room_type_id` | `RESTRICT` | Verified |
| `bookings` | `fk_bookings_created_by_user_id_users` | `created_by_user_id` | `users` | `user_id` | `SET NULL` | Verified |
| `bills` | `fk_bills_booking_id_bookings` | `booking_id` | `bookings` | `booking_id` | `RESTRICT` | Verified |
| `bills` | `fk_bills_guest_id_guests` | `guest_id` | `guests` | `guest_id` | `RESTRICT` | Verified |
| `payments` | `fk_payments_bill_id_bills` | `bill_id` | `bills` | `bill_id` | `RESTRICT` | Verified |
| `payments` | `fk_payments_recorded_by_user_id_users` | `recorded_by_user_id` | `users` | `user_id` | `SET NULL` | Verified |
| `housekeeping` | `fk_housekeeping_room_id_rooms` | `room_id` | `rooms` | `room_id` | `CASCADE` | Verified |
| `housekeeping` | `fk_housekeeping_assigned_to_user_id_users` | `assigned_to_user_id` | `users` | `user_id` | `SET NULL` | Verified |
| `housekeeping` | `fk_housekeeping_inspected_by_user_id_users` | `inspected_by_user_id` | `users` | `user_id` | `SET NULL` | Verified |
| `maintenance` | `fk_maintenance_room_id_rooms` | `room_id` | `rooms` | `room_id` | `CASCADE` | Verified |
| `maintenance` | `fk_maintenance_reported_by_user_id_users` | `reported_by_user_id` | `users` | `user_id` | `SET NULL` | Verified |
| `maintenance` | `fk_maintenance_assigned_to_user_id_users` | `assigned_to_user_id` | `users` | `user_id` | `SET NULL` | Verified |

* **Legacy FK Confirmation**:
  - Legacy `bookings_ibfk_2` does **not** exist.
  - Legacy `bills_ibfk_1` does **not** exist (replaced by `fk_bills_booking_id_bookings`).
  - Production foreign key `fk_bookings_room_id_rooms` with `ON DELETE SET NULL` is active.
  - Zero duplicate foreign key definitions.

### 4.9 Indexes, Unique Keys & Check Constraints
Inspection of `information_schema.STATISTICS` and `CHECK_CONSTRAINTS`:

#### Key Production Indexes & Uniqueness:
* `users`:
  - `ix_users_username` (UNIQUE on `username`) - Verified
  - `ix_users_email` (UNIQUE on `email`) - Verified
  - `idx_users_role_active` (NON-UNIQUE on `role`, `is_active`) - Verified
* `rooms`:
  - `ix_rooms_room_number` (UNIQUE on `room_number`) - Verified
  - `idx_rooms_floor` (NON-UNIQUE on `floor`) - Verified
  - `idx_rooms_type_status` (NON-UNIQUE on `room_type_id`, `operational_status`, `cleanliness_status`) - Verified
* `guests`:
  - `uq_guest_id_doc` (UNIQUE on `id_type`, `id_number`) - Verified
  - `ix_guests_email` (NON-UNIQUE on `email`) - Verified
  - `ix_guests_phone` (NON-UNIQUE on `phone`) - Verified
  - `idx_guests_name` (NON-UNIQUE on `last_name`, `first_name`) - Verified
* `room_types`:
  - `uq_room_types_name` (UNIQUE on `name`) - Verified
  - `ix_room_types_code` (UNIQUE on `code`) - Verified
  - `ix_room_types_is_active` (NON-UNIQUE on `is_active`) - Verified
* `bookings`:
  - `ix_bookings_booking_ref` (UNIQUE on `booking_ref`) - Verified
  - `ix_bookings_guest_id` (NON-UNIQUE on `guest_id`) - Verified
  - `ix_bookings_room_id` (NON-UNIQUE on `room_id`) - Verified
  - `ix_bookings_status` (NON-UNIQUE on `status`) - Verified
  - `idx_bookings_room_dates` (NON-UNIQUE on `room_id`, `check_in_date`, `check_out_date`, `status`) - Verified
  - `idx_bookings_dates` (NON-UNIQUE on `check_in_date`, `check_out_date`) - Verified
* `bills`:
  - `uq_bills_booking_id` (UNIQUE on `booking_id`) - Verified
  - `ix_bills_invoice_number` (UNIQUE on `invoice_number`) - Verified
  - `ix_bills_guest_id` (NON-UNIQUE on `guest_id`) - Verified
  - `ix_bills_status` (NON-UNIQUE on `status`) - Verified
* `payments`:
  - `ix_payments_payment_ref` (UNIQUE on `payment_ref`) - Verified
  - `ix_payments_bill_id` (NON-UNIQUE on `bill_id`) - Verified
  - `ix_payments_status` (NON-UNIQUE on `status`) - Verified
  - `idx_payments_gateway_txn` (NON-UNIQUE on `gateway_provider`, `gateway_txn_id`) - Verified
  - `idx_payments_status_paid` (NON-UNIQUE on `status`, `paid_at`) - Verified

#### Check Constraints (19 Active Constraints Verified):
* `guests`:
  - `ck_guests_chk_phone_not_empty`: `LENGTH(TRIM(phone)) > 0`
* `rooms`:
  - `ck_rooms_chk_room_floor`: `floor >= -2`
* `room_types`:
  - `ck_room_types_chk_room_type_base_price`: `base_price >= 0`
  - `ck_room_types_chk_room_type_max_occupancy`: `max_occupancy >= 1`
* `bookings`:
  - `ck_bookings_chk_booking_dates`: `check_out_date IS NULL OR check_out_date > check_in_date`
  - `ck_bookings_chk_actual_dates`: `actual_check_out IS NULL OR actual_check_out >= actual_check_in`
  - `ck_bookings_chk_booking_adults`: `num_adults > 0`
  - `ck_bookings_chk_booking_children`: `num_children >= 0`
* `bills`:
  - `ck_bills_chk_bill_subtotal`: `subtotal_amount >= 0`
  - `ck_bills_chk_bill_total`: `total_amount >= 0`
  - `ck_bills_chk_bill_paid`: `paid_amount >= 0`
  - `ck_bills_chk_bill_amounts`: `status = 'draft' OR total_amount = subtotal_amount + tax_amount - discount_amount`
  - `ck_bills_chk_bill_balance`: `status = 'draft' OR balance_due = total_amount - paid_amount`
* `payments`:
  - `ck_payments_chk_payment_amount`: `amount > 0`
* `housekeeping`:
  - `ck_housekeeping_chk_hk_timeline`: `completed_at IS NULL OR completed_at >= started_at`
  - `ck_housekeeping_chk_hk_inspection`: `verified_at IS NULL OR verified_at >= completed_at`
* `maintenance`:
  - `ck_maintenance_chk_maint_actual_cost`: `actual_cost IS NULL OR actual_cost >= 0`
  - `ck_maintenance_chk_maint_est_cost`: `estimated_cost IS NULL OR estimated_cost >= 0`
  - `ck_maintenance_chk_maint_resolved`: `resolved_at IS NULL OR resolved_at >= reported_at`

#### NOT NULL Enforcement:
All required production fields across all 9 tables have `nullable = False` enforced.

### 4.10 Data Integrity Audit
* **Orphan Foreign Keys**: `0` detected across all tables.
* **Duplicate Room Numbers**: `0` duplicate room numbers.
* **Duplicate Room Types**: `0` duplicate names or codes.
* **Unexpected Row Loss**: `0` rows lost. Baseline data preserved with 100% fidelity.
* **NULL Values in Required Fields**: `0` NULL values found in required columns (`username`, `password`, `role`, `is_active`, `room_number`, `operational_status`, `cleanliness_status`, `floor`, `is_smoking`).

### 4.11 Application Compatibility Verification
An automated test initialized the application runtime within an app context:
* `create_app()` initialized cleanly.
* `configure_mappers()` completed with status: `SUCCESS`.
* All 9 SQLAlchemy domain models registered:
  - `User` (`users`)
  - `Guest` (`guests`)
  - `RoomType` (`room_types`)
  - `Room` (`rooms`)
  - `Booking` (`bookings`)
  - `Bill` (`bills`)
  - `Payment` (`payments`)
  - `Housekeeping` (`housekeeping`)
  - `Maintenance` (`maintenance`)
* All 4 application blueprints loaded and registered:
  - `auth`
  - `booking`
  - `rooms`
  - `dashboard`
* ORM Query Test: `db.session.query(Model).count()` executed successfully across all 9 models without any SQL compilation or execution errors.
* `flask --app backend/run.py db check` executed with exit code 0.

### 4.12 Migration Finality
* `alembic_version` contains exactly `['a006861391be']`.
* `flask db current` reports `a006861391be (head)`.
* `flask db heads` reports `a006861391be (head)`.
* `flask db check` completes cleanly with no pending revisions or drift.

---

## 5. Non-Intervention & Operational Discipline Confirmation

Throughout the fourth dry run, all project constraints and operational rules were strictly upheld:
* `downgrade` was **not** run.
* Application code in `backend/app/` was **not** modified.
* SQLAlchemy models were **not** modified.
* The migration script `a006861391be_migrate_legacy_to_production.py` was **not** modified.
* The database was **not** manually altered or repaired.
* No files were staged or committed to Git.

---

## 6. Final Status

### **MIGRATION VERIFIED**

**DATABASE READY FOR APPLICATION REGRESSION TESTING**
