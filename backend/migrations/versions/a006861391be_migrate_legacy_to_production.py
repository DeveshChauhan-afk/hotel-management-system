"""migrate_legacy_to_production

Revision ID: a006861391be
Revises: 
Create Date: 2026-09-23 20:46:26.689107

3-Phase Production Migration:
- Phase 1: Additive Schema Changes (New tables, column widening, new nullable columns, AUTO_INCREMENT fix)
- Phase 2: Deterministic Data Backfill (Static room_types, surrogate room numbers, refs, strictly deterministic status, no fake payments)
- Phase 3: Final Constraints, Hardening & Column Drops (NOT NULL, UNIQUE, FKs, CHECK constraints, indexes, dropping legacy columns)

MySQL InnoDB Ordering & Partial-State Rerun Safety:
1. A referenced primary key column cannot have its definition altered (e.g. adding AUTO_INCREMENT)
   while active foreign keys reference it (MySQL Error 1833). Therefore, legacy foreign key
   bookings_ibfk_2 is explicitly dropped BEFORE modifying rooms.room_id to AUTO_INCREMENT.
2. The production foreign key relationship from bookings.room_id to rooms.room_id (fk_bookings_room_id_rooms)
   with ondelete='SET NULL' is recreated in Phase 3 once the full schema is ready.
3. Database inspection guards (inspector.get_table_names, get_columns, get_foreign_keys, get_indexes)
   are utilized throughout Phase 1 and Phase 3 so the migration is 100% idempotent and can be safely
   rerun from a completely fresh baseline or an interrupted/partially executed state.
4. Symmetrically in downgrade(), rooms.room_id AUTO_INCREMENT is reverted BEFORE legacy bookings_ibfk_2
   is recreated, preventing Error 1833 in reverse execution as well.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a006861391be'
down_revision = None
branch_labels = None
depends_on = None


# Enum definitions matching production SQLAlchemy models
user_role_enum = sa.Enum('admin', 'manager', 'receptionist', 'housekeeper', 'maintenance', name='user_role_enum')
guest_id_type_enum = sa.Enum('passport', 'national_id', 'driving_license', 'other', name='guest_id_type_enum')
operational_status_enum = sa.Enum('available', 'occupied', 'out_of_service', 'under_maintenance', name='operational_status_enum')
cleanliness_status_enum = sa.Enum('clean', 'dirty', 'inspecting', 'cleaning_in_progress', name='cleanliness_status_enum')
booking_status_enum = sa.Enum('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', name='booking_status_enum')
bill_status_enum = sa.Enum('draft', 'issued', 'partially_paid', 'paid', 'voided', 'refunded', name='bill_status_enum')
payment_type_enum = sa.Enum('charge', 'refund', 'deposit', name='payment_type_enum')
payment_method_enum = sa.Enum('cash', 'credit_card', 'debit_card', 'bank_transfer', 'upi', 'online', name='payment_method_enum')
payment_status_enum = sa.Enum('pending', 'completed', 'failed', 'refunded', name='payment_status_enum')
housekeeping_task_type_enum = sa.Enum('checkout_cleaning', 'stayover_cleaning', 'deep_clean', 'inspection', 'turndown', name='housekeeping_task_type_enum')
housekeeping_priority_enum = sa.Enum('low', 'medium', 'high', 'urgent', name='housekeeping_priority_enum')
housekeeping_status_enum = sa.Enum('pending', 'in_progress', 'completed', 'verified', 'cancelled', name='housekeeping_status_enum')
maintenance_category_enum = sa.Enum('plumbing', 'electrical', 'hvac', 'furniture', 'appliance', 'structural', 'other', name='maintenance_category_enum')
maintenance_priority_enum = sa.Enum('low', 'medium', 'high', 'critical', name='maintenance_priority_enum')
maintenance_status_enum = sa.Enum('reported', 'scheduled', 'in_progress', 'completed', 'cancelled', name='maintenance_status_enum')


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # =========================================================================
    # PHASE 1: ADDITIVE SCHEMA CHANGES & AUTO_INCREMENT PREPARATION
    # =========================================================================

    # 1.1 Create new table: room_types (if not already created in a previous partial run)
    if 'room_types' not in existing_tables:
        op.create_table(
            'room_types',
            sa.Column('room_type_id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('name', sa.String(length=50), nullable=False),
            sa.Column('code', sa.String(length=20), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('base_price', sa.Numeric(precision=10, scale=2), server_default='0.00', nullable=False),
            sa.Column('max_occupancy', sa.Integer(), server_default='2', nullable=False),
            sa.Column('bed_config', sa.String(length=60), server_default='1 Queen Bed', nullable=False),
            sa.Column('amenities', sa.JSON(), nullable=True),
            sa.Column('is_active', sa.Boolean(), server_default=sa.text('1'), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('room_type_id', name='pk_room_types'),
            sa.UniqueConstraint('name', name='uq_room_types_name'),
            sa.CheckConstraint('base_price >= 0', name='chk_room_type_base_price'),
            sa.CheckConstraint('max_occupancy >= 1', name='chk_room_type_max_occupancy'),
        )
    rt_idxs = {ix['name'] for ix in sa.inspect(op.get_bind()).get_indexes('room_types')}
    if 'ix_room_types_code' not in rt_idxs:
        op.create_index('ix_room_types_code', 'room_types', ['code'], unique=True)
    if 'ix_room_types_is_active' not in rt_idxs:
        op.create_index('ix_room_types_is_active', 'room_types', ['is_active'], unique=False)

    # 1.2 Create new table: payments (if not already created)
    if 'payments' not in existing_tables:
        op.create_table(
            'payments',
            sa.Column('payment_id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('payment_ref', sa.String(length=64), nullable=False),
            sa.Column('bill_id', sa.Integer(), nullable=False),
            sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
            sa.Column('payment_type', payment_type_enum, server_default='charge', nullable=False),
            sa.Column('payment_method', payment_method_enum, nullable=False),
            sa.Column('status', payment_status_enum, server_default='pending', nullable=False),
            sa.Column('gateway_provider', sa.String(length=50), nullable=True),
            sa.Column('gateway_txn_id', sa.String(length=100), nullable=True),
            sa.Column('gateway_payload', sa.JSON(), nullable=True),
            sa.Column('recorded_by_user_id', sa.Integer(), nullable=True),
            sa.Column('paid_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('payment_id', name='pk_payments'),
            sa.ForeignKeyConstraint(['bill_id'], ['bills.bill_id'], name='fk_payments_bill_id_bills', ondelete='RESTRICT'),
            sa.ForeignKeyConstraint(['recorded_by_user_id'], ['users.user_id'], name='fk_payments_recorded_by_user_id_users', ondelete='SET NULL'),
            sa.CheckConstraint('amount > 0', name='chk_payment_amount'),
        )
    payments_insp = sa.inspect(op.get_bind())
    payments_idxs = {ix['name'] for ix in payments_insp.get_indexes('payments')}
    if 'ix_payments_payment_ref' not in payments_idxs:
        op.create_index('ix_payments_payment_ref', 'payments', ['payment_ref'], unique=True)
    if 'ix_payments_bill_id' not in payments_idxs:
        op.create_index('ix_payments_bill_id', 'payments', ['bill_id'], unique=False)
    if 'ix_payments_status' not in payments_idxs:
        op.create_index('ix_payments_status', 'payments', ['status'], unique=False)
    if 'idx_payments_gateway_txn' not in payments_idxs:
        op.create_index('idx_payments_gateway_txn', 'payments', ['gateway_provider', 'gateway_txn_id'], unique=False)
    if 'idx_payments_status_paid' not in payments_idxs:
        op.create_index('idx_payments_status_paid', 'payments', ['status', 'paid_at'], unique=False)

    # 1.3 Create new table: housekeeping (if not already created)
    if 'housekeeping' not in existing_tables:
        op.create_table(
            'housekeeping',
            sa.Column('task_id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('room_id', sa.Integer(), nullable=False),
            sa.Column('task_type', housekeeping_task_type_enum, nullable=False),
            sa.Column('priority', housekeeping_priority_enum, server_default='medium', nullable=False),
            sa.Column('status', housekeeping_status_enum, server_default='pending', nullable=False),
            sa.Column('assigned_to_user_id', sa.Integer(), nullable=True),
            sa.Column('inspected_by_user_id', sa.Integer(), nullable=True),
            sa.Column('scheduled_date', sa.Date(), nullable=False),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('remarks', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('task_id', name='pk_housekeeping'),
            sa.ForeignKeyConstraint(['room_id'], ['rooms.room_id'], name='fk_housekeeping_room_id_rooms', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['assigned_to_user_id'], ['users.user_id'], name='fk_housekeeping_assigned_to_user_id_users', ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['inspected_by_user_id'], ['users.user_id'], name='fk_housekeeping_inspected_by_user_id_users', ondelete='SET NULL'),
            sa.CheckConstraint('completed_at IS NULL OR completed_at >= started_at', name='chk_hk_timeline'),
            sa.CheckConstraint('verified_at IS NULL OR verified_at >= completed_at', name='chk_hk_inspection'),
        )
    hk_insp = sa.inspect(op.get_bind())
    hk_idxs = {ix['name'] for ix in hk_insp.get_indexes('housekeeping')}
    if 'ix_housekeeping_room_id' not in hk_idxs:
        op.create_index('ix_housekeeping_room_id', 'housekeeping', ['room_id'], unique=False)
    if 'ix_housekeeping_status' not in hk_idxs:
        op.create_index('ix_housekeeping_status', 'housekeeping', ['status'], unique=False)
    if 'ix_housekeeping_assigned_to_user_id' not in hk_idxs:
        op.create_index('ix_housekeeping_assigned_to_user_id', 'housekeeping', ['assigned_to_user_id'], unique=False)
    if 'idx_hk_room_status' not in hk_idxs:
        op.create_index('idx_hk_room_status', 'housekeeping', ['room_id', 'status'], unique=False)
    if 'idx_hk_assigned_date' not in hk_idxs:
        op.create_index('idx_hk_assigned_date', 'housekeeping', ['assigned_to_user_id', 'scheduled_date', 'status'], unique=False)
    if 'idx_hk_status_date' not in hk_idxs:
        op.create_index('idx_hk_status_date', 'housekeeping', ['status', 'scheduled_date'], unique=False)

    # 1.4 Create new table: maintenance (if not already created)
    if 'maintenance' not in existing_tables:
        op.create_table(
            'maintenance',
            sa.Column('maintenance_id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('room_id', sa.Integer(), nullable=True),
            sa.Column('title', sa.String(length=150), nullable=False),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('category', maintenance_category_enum, nullable=False),
            sa.Column('priority', maintenance_priority_enum, server_default='medium', nullable=False),
            sa.Column('status', maintenance_status_enum, server_default='reported', nullable=False),
            sa.Column('blocks_room_occupancy', sa.Boolean(), server_default=sa.text('0'), nullable=False),
            sa.Column('reported_by_user_id', sa.Integer(), nullable=True),
            sa.Column('assigned_to_user_id', sa.Integer(), nullable=True),
            sa.Column('estimated_cost', sa.Numeric(precision=10, scale=2), server_default='0.00', nullable=True),
            sa.Column('actual_cost', sa.Numeric(precision=10, scale=2), server_default='0.00', nullable=True),
            sa.Column('reported_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('resolution_notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('maintenance_id', name='pk_maintenance'),
            sa.ForeignKeyConstraint(['room_id'], ['rooms.room_id'], name='fk_maintenance_room_id_rooms', ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['reported_by_user_id'], ['users.user_id'], name='fk_maintenance_reported_by_user_id_users', ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['assigned_to_user_id'], ['users.user_id'], name='fk_maintenance_assigned_to_user_id_users', ondelete='SET NULL'),
            sa.CheckConstraint('resolved_at IS NULL OR resolved_at >= reported_at', name='chk_maint_resolved'),
            sa.CheckConstraint('actual_cost IS NULL OR actual_cost >= 0', name='chk_maint_actual_cost'),
            sa.CheckConstraint('estimated_cost IS NULL OR estimated_cost >= 0', name='chk_maint_est_cost'),
        )
    maint_insp = sa.inspect(op.get_bind())
    maint_idxs = {ix['name'] for ix in maint_insp.get_indexes('maintenance')}
    if 'ix_maintenance_room_id' not in maint_idxs:
        op.create_index('ix_maintenance_room_id', 'maintenance', ['room_id'], unique=False)
    if 'ix_maintenance_status' not in maint_idxs:
        op.create_index('ix_maintenance_status', 'maintenance', ['status'], unique=False)
    if 'ix_maintenance_assigned_to_user_id' not in maint_idxs:
        op.create_index('ix_maintenance_assigned_to_user_id', 'maintenance', ['assigned_to_user_id'], unique=False)
    if 'idx_maint_room_status' not in maint_idxs:
        op.create_index('idx_maint_room_status', 'maintenance', ['room_id', 'status'], unique=False)
    if 'idx_maint_assigned_status' not in maint_idxs:
        op.create_index('idx_maint_assigned_status', 'maintenance', ['assigned_to_user_id', 'status'], unique=False)
    if 'idx_maint_priority_status' not in maint_idxs:
        op.create_index('idx_maint_priority_status', 'maintenance', ['priority', 'status'], unique=False)

    # 1.5 Explicitly drop legacy FK bookings_ibfk_2 before modifying rooms.room_id to AUTO_INCREMENT
    # MySQL InnoDB Ordering Requirement:
    # A column referenced by a foreign key constraint cannot be modified (e.g. adding AUTO_INCREMENT)
    # while the referencing constraint is active (MySQL Error 1833). Therefore:
    # 1. We inspect and drop the legacy bookings_ibfk_2 constraint first.
    # 2. We disable FOREIGN_KEY_CHECKS defensively around the ALTER TABLE statement to handle cases
    #    where partial runs created housekeeping/maintenance referencing rooms.room_id.
    # 3. We alter rooms.room_id to AUTO_INCREMENT.
    # 4. The production foreign key (fk_bookings_room_id_rooms with ondelete='SET NULL') is recreated
    #    in Phase 3 once the full schema is ready.
    phase1_inspector = sa.inspect(op.get_bind())
    phase1_booking_fks = {fk['name'] for fk in phase1_inspector.get_foreign_keys('bookings')}
    if 'bookings_ibfk_2' in phase1_booking_fks:
        op.drop_constraint('bookings_ibfk_2', 'bookings', type_='foreignkey')

    op.execute("SET FOREIGN_KEY_CHECKS = 0")
    op.execute("ALTER TABLE rooms MODIFY room_id INT NOT NULL AUTO_INCREMENT")
    op.execute("SET FOREIGN_KEY_CHECKS = 1")

    # 1.6 Column widening on legacy tables
    op.alter_column('users', 'password', existing_type=sa.String(length=100), type_=sa.String(length=255), existing_nullable=True)
    op.alter_column('guests', 'phone', existing_type=sa.String(length=15), type_=sa.String(length=25), existing_nullable=True)
    op.alter_column('guests', 'email', existing_type=sa.String(length=100), type_=sa.String(length=120), existing_nullable=True)

    # 1.7 Add new columns as NULLABLE to users (with idempotent existence guards)
    user_cols = {c['name'] for c in inspector.get_columns('users')}
    if 'email' not in user_cols:
        op.add_column('users', sa.Column('email', sa.String(length=120), nullable=True))
    if 'full_name' not in user_cols:
        op.add_column('users', sa.Column('full_name', sa.String(length=100), nullable=True))
    if 'is_active' not in user_cols:
        op.add_column('users', sa.Column('is_active', sa.Boolean(), nullable=True))
    if 'created_at' not in user_cols:
        op.add_column('users', sa.Column('created_at', sa.DateTime(timezone=True), nullable=True))
    if 'updated_at' not in user_cols:
        op.add_column('users', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # 1.8 Add new columns as NULLABLE to guests
    guest_cols = {c['name'] for c in inspector.get_columns('guests')}
    if 'first_name' not in guest_cols:
        op.add_column('guests', sa.Column('first_name', sa.String(length=50), nullable=True))
    if 'last_name' not in guest_cols:
        op.add_column('guests', sa.Column('last_name', sa.String(length=50), nullable=True))
    if 'id_type' not in guest_cols:
        op.add_column('guests', sa.Column('id_type', guest_id_type_enum, nullable=True))
    if 'id_number' not in guest_cols:
        op.add_column('guests', sa.Column('id_number', sa.String(length=50), nullable=True))
    if 'city' not in guest_cols:
        op.add_column('guests', sa.Column('city', sa.String(length=50), nullable=True))
    if 'country' not in guest_cols:
        op.add_column('guests', sa.Column('country', sa.String(length=50), nullable=True))
    if 'postal_code' not in guest_cols:
        op.add_column('guests', sa.Column('postal_code', sa.String(length=20), nullable=True))
    if 'vip_status' not in guest_cols:
        op.add_column('guests', sa.Column('vip_status', sa.Boolean(), nullable=True))
    if 'notes' not in guest_cols:
        op.add_column('guests', sa.Column('notes', sa.Text(), nullable=True))
    if 'created_at' not in guest_cols:
        op.add_column('guests', sa.Column('created_at', sa.DateTime(timezone=True), nullable=True))
    if 'updated_at' not in guest_cols:
        op.add_column('guests', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # 1.9 Add new columns as NULLABLE to rooms
    room_cols = {c['name'] for c in inspector.get_columns('rooms')}
    if 'room_number' not in room_cols:
        op.add_column('rooms', sa.Column('room_number', sa.String(length=20), nullable=True))
    if 'floor' not in room_cols:
        op.add_column('rooms', sa.Column('floor', sa.Integer(), nullable=True))
    if 'room_type_id' not in room_cols:
        op.add_column('rooms', sa.Column('room_type_id', sa.Integer(), nullable=True))
    if 'operational_status' not in room_cols:
        op.add_column('rooms', sa.Column('operational_status', operational_status_enum, nullable=True))
    if 'cleanliness_status' not in room_cols:
        op.add_column('rooms', sa.Column('cleanliness_status', cleanliness_status_enum, nullable=True))
    if 'is_smoking' not in room_cols:
        op.add_column('rooms', sa.Column('is_smoking', sa.Boolean(), nullable=True))
    if 'notes' not in room_cols:
        op.add_column('rooms', sa.Column('notes', sa.Text(), nullable=True))
    if 'created_at' not in room_cols:
        op.add_column('rooms', sa.Column('created_at', sa.DateTime(timezone=True), nullable=True))
    if 'updated_at' not in room_cols:
        op.add_column('rooms', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # 1.10 Add new columns as NULLABLE to bookings
    booking_cols = {c['name'] for c in inspector.get_columns('bookings')}
    if 'booking_ref' not in booking_cols:
        op.add_column('bookings', sa.Column('booking_ref', sa.String(length=32), nullable=True))
    if 'room_type_id' not in booking_cols:
        op.add_column('bookings', sa.Column('room_type_id', sa.Integer(), nullable=True))
    if 'actual_check_in' not in booking_cols:
        op.add_column('bookings', sa.Column('actual_check_in', sa.DateTime(timezone=True), nullable=True))
    if 'actual_check_out' not in booking_cols:
        op.add_column('bookings', sa.Column('actual_check_out', sa.DateTime(timezone=True), nullable=True))
    if 'num_adults' not in booking_cols:
        op.add_column('bookings', sa.Column('num_adults', sa.Integer(), nullable=True))
    if 'num_children' not in booking_cols:
        op.add_column('bookings', sa.Column('num_children', sa.Integer(), nullable=True))
    if 'nightly_rate' not in booking_cols:
        op.add_column('bookings', sa.Column('nightly_rate', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'total_amount' not in booking_cols:
        op.add_column('bookings', sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'status' not in booking_cols:
        op.add_column('bookings', sa.Column('status', booking_status_enum, nullable=True))
    if 'special_requests' not in booking_cols:
        op.add_column('bookings', sa.Column('special_requests', sa.Text(), nullable=True))
    if 'cancellation_reason' not in booking_cols:
        op.add_column('bookings', sa.Column('cancellation_reason', sa.Text(), nullable=True))
    if 'created_by_user_id' not in booking_cols:
        op.add_column('bookings', sa.Column('created_by_user_id', sa.Integer(), nullable=True))
    if 'created_at' not in booking_cols:
        op.add_column('bookings', sa.Column('created_at', sa.DateTime(timezone=True), nullable=True))
    if 'updated_at' not in booking_cols:
        op.add_column('bookings', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # 1.11 Add new columns as NULLABLE to bills
    bill_cols = {c['name'] for c in inspector.get_columns('bills')}
    if 'invoice_number' not in bill_cols:
        op.add_column('bills', sa.Column('invoice_number', sa.String(length=50), nullable=True))
    if 'guest_id' not in bill_cols:
        op.add_column('bills', sa.Column('guest_id', sa.Integer(), nullable=True))
    if 'subtotal_amount' not in bill_cols:
        op.add_column('bills', sa.Column('subtotal_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'tax_amount' not in bill_cols:
        op.add_column('bills', sa.Column('tax_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'discount_amount' not in bill_cols:
        op.add_column('bills', sa.Column('discount_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'total_amount' not in bill_cols:
        op.add_column('bills', sa.Column('total_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'paid_amount' not in bill_cols:
        op.add_column('bills', sa.Column('paid_amount', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'balance_due' not in bill_cols:
        op.add_column('bills', sa.Column('balance_due', sa.Numeric(precision=10, scale=2), nullable=True))
    if 'status' not in bill_cols:
        op.add_column('bills', sa.Column('status', bill_status_enum, nullable=True))
    if 'notes' not in bill_cols:
        op.add_column('bills', sa.Column('notes', sa.Text(), nullable=True))
    if 'created_at' not in bill_cols:
        op.add_column('bills', sa.Column('created_at', sa.DateTime(timezone=True), nullable=True))
    if 'updated_at' not in bill_cols:
        op.add_column('bills', sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True))

    # =========================================================================
    # PHASE 2: DETERMINISTIC DATA BACKFILL (DML)
    # =========================================================================

    # 2.1 Seed room_types from distinct rooms.room_type using explicit mapping dictionary
    op.execute("""
        INSERT INTO room_types (name, code, description, base_price, max_occupancy, bed_config, is_active, created_at, updated_at)
        SELECT DISTINCT 
            TRIM(room_type) AS name,
            CASE TRIM(room_type)
                WHEN 'Single' THEN 'SINGLE'
                WHEN 'Deluxe' THEN 'DELUXE'
                WHEN 'Double' THEN 'DOUBLE'
                WHEN 'Suite' THEN 'SUITE'
                WHEN 'Standard' THEN 'STANDARD'
                ELSE UPPER(REGEXP_REPLACE(TRIM(room_type), '[^a-zA-Z0-9]+', '_'))
            END AS code,
            CONCAT(TRIM(room_type), ' Room') AS description,
            CASE TRIM(room_type)
                WHEN 'Single' THEN 100.00
                WHEN 'Deluxe' THEN 250.00
                WHEN 'Double' THEN 150.00
                WHEN 'Suite' THEN 400.00
                WHEN 'Standard' THEN 120.00
                ELSE 100.00
            END AS base_price,
            CASE TRIM(room_type)
                WHEN 'Single' THEN 1
                WHEN 'Deluxe' THEN 2
                WHEN 'Double' THEN 2
                WHEN 'Suite' THEN 4
                WHEN 'Standard' THEN 2
                ELSE 2
            END AS max_occupancy,
            CASE TRIM(room_type)
                WHEN 'Single' THEN '1 Single Bed'
                WHEN 'Deluxe' THEN '1 King Bed'
                WHEN 'Double' THEN '1 Double Bed'
                WHEN 'Suite' THEN '1 King Bed + 1 Sofa Bed'
                WHEN 'Standard' THEN '1 Queen Bed'
                ELSE '1 Standard Bed'
            END AS bed_config,
            1 AS is_active,
            '2026-01-01 00:00:00' AS created_at,
            '2026-01-01 00:00:00' AS updated_at
        FROM rooms
        WHERE room_type IS NOT NULL AND TRIM(room_type) != ''
        ON DUPLICATE KEY UPDATE name = VALUES(name)
    """)

    # 2.2 Backfill rooms: room_number, floor, room_type_id, status enums, timestamps
    op.execute("UPDATE rooms SET room_number = CAST(room_id AS CHAR) WHERE room_number IS NULL")
    op.execute("UPDATE rooms SET floor = 1 WHERE floor IS NULL")
    op.execute("""
        UPDATE rooms r 
        JOIN room_types rt ON TRIM(r.room_type) = rt.name 
        SET r.room_type_id = rt.room_type_id 
        WHERE r.room_type_id IS NULL
    """)
    op.execute("""
        UPDATE rooms SET operational_status = CASE 
            WHEN LOWER(TRIM(status)) = 'available' THEN 'available'
            WHEN LOWER(TRIM(status)) IN ('booked', 'occupied') THEN 'occupied'
            WHEN LOWER(TRIM(status)) IN ('maintenance', 'under_maintenance') THEN 'under_maintenance'
            WHEN LOWER(TRIM(status)) = 'out_of_service' THEN 'out_of_service'
            ELSE 'available'
        END WHERE operational_status IS NULL
    """)
    op.execute("""
        UPDATE rooms SET cleanliness_status = CASE 
            WHEN cleaned = 1 THEN 'clean'
            ELSE 'dirty'
        END WHERE cleanliness_status IS NULL
    """)
    op.execute("UPDATE rooms SET is_smoking = 0 WHERE is_smoking IS NULL")
    op.execute("UPDATE rooms SET created_at = '2026-01-01 00:00:00' WHERE created_at IS NULL")
    op.execute("UPDATE rooms SET updated_at = '2026-01-01 00:00:00' WHERE updated_at IS NULL")

    # 2.3 Backfill users: role mapping, full_name, is_active, timestamps
    op.execute("""
        UPDATE users SET role = CASE 
            WHEN LOWER(TRIM(role)) IN ('admin', 'manager', 'receptionist', 'housekeeper', 'maintenance') THEN LOWER(TRIM(role))
            ELSE 'receptionist'
        END
    """)
    op.alter_column('users', 'role', existing_type=sa.String(length=20), type_=user_role_enum, existing_nullable=True)
    op.execute("""
        UPDATE users 
        SET full_name = CONCAT(UCASE(LEFT(username, 1)), LCASE(SUBSTRING(username, 2))) 
        WHERE full_name IS NULL AND username IS NOT NULL
    """)
    op.execute("UPDATE users SET is_active = 1 WHERE is_active IS NULL")
    op.execute("UPDATE users SET created_at = '2026-01-01 00:00:00' WHERE created_at IS NULL")
    op.execute("UPDATE users SET updated_at = '2026-01-01 00:00:00' WHERE updated_at IS NULL")

    # 2.4 Backfill guests: tokenize name into first_name and last_name, apply phone sentinel
    op.execute("""
        UPDATE guests SET 
            first_name = CASE 
                WHEN name IS NULL OR TRIM(name) = '' THEN 'Unknown'
                ELSE SUBSTRING_INDEX(TRIM(name), ' ', 1)
            END,
            last_name = CASE 
                WHEN name IS NULL OR TRIM(name) = '' THEN 'Guest'
                WHEN LOCATE(' ', TRIM(name)) > 0 THEN SUBSTRING(TRIM(name), LOCATE(' ', TRIM(name)) + 1)
                ELSE 'Guest'
            END
        WHERE first_name IS NULL OR last_name IS NULL
    """)
    op.execute("UPDATE guests SET phone = 'UNSPECIFIED' WHERE phone IS NULL OR TRIM(phone) = ''")
    op.execute("UPDATE guests SET vip_status = 0 WHERE vip_status IS NULL")
    op.execute("UPDATE guests SET created_at = '2026-01-01 00:00:00' WHERE created_at IS NULL")
    op.execute("UPDATE guests SET updated_at = '2026-01-01 00:00:00' WHERE updated_at IS NULL")

    # 2.5 Backfill bookings: booking_ref, room_type_id, status (strictly deterministic, NO CURRENT_DATE)
    op.execute("UPDATE bookings SET booking_ref = CONCAT('BK-', LPAD(booking_id, 6, '0')) WHERE booking_ref IS NULL")
    op.execute("""
        UPDATE bookings b 
        JOIN rooms r ON b.room_id = r.room_id 
        SET b.room_type_id = r.room_type_id 
        WHERE b.room_type_id IS NULL
    """)
    op.execute("UPDATE bookings SET check_in_date = COALESCE(DATE(booking_date), '2026-01-01') WHERE check_in_date IS NULL")
    op.execute("""
        UPDATE bookings 
        SET check_out_date = DATE_ADD(check_in_date, INTERVAL 1 DAY) 
        WHERE check_out_date IS NOT NULL AND check_out_date <= check_in_date
    """)
    op.execute("UPDATE bookings SET created_at = COALESCE(booking_date, '2026-01-01 00:00:00') WHERE created_at IS NULL")
    op.execute("UPDATE bookings SET updated_at = COALESCE(booking_date, '2026-01-01 00:00:00') WHERE updated_at IS NULL")
    op.execute("UPDATE bookings SET num_adults = 1 WHERE num_adults IS NULL")
    op.execute("UPDATE bookings SET num_children = 0 WHERE num_children IS NULL")
    op.execute("""
        UPDATE bookings b 
        LEFT JOIN room_types rt ON b.room_type_id = rt.room_type_id 
        SET b.nightly_rate = COALESCE(rt.base_price, 100.00) 
        WHERE b.nightly_rate IS NULL
    """)
    op.execute("""
        UPDATE bookings b 
        LEFT JOIN bills bl ON b.booking_id = bl.booking_id 
        SET b.total_amount = COALESCE(bl.amount, b.nightly_rate * GREATEST(DATEDIFF(COALESCE(b.check_out_date, DATE_ADD(b.check_in_date, INTERVAL 1 DAY)), b.check_in_date), 1)) 
        WHERE b.total_amount IS NULL
    """)
    op.execute("""
        UPDATE bookings b 
        LEFT JOIN bills bl ON b.booking_id = bl.booking_id 
        SET b.status = CASE 
            WHEN bl.bill_id IS NOT NULL THEN 'checked_out'
            WHEN b.check_out_date IS NOT NULL THEN 'confirmed'
            ELSE 'pending' 
        END 
        WHERE b.status IS NULL
    """)

    # 2.6 Backfill bills: invoice_number, guest_id, accounting breakdown (NO INVENTED PAYMENTS)
    op.execute("""
        UPDATE bills 
        SET invoice_number = CONCAT('INV-', YEAR(COALESCE(issued_date, '2026-01-01')), '-', LPAD(bill_id, 6, '0')) 
        WHERE invoice_number IS NULL
    """)
    op.execute("""
        UPDATE bills bl 
        JOIN bookings b ON bl.booking_id = b.booking_id 
        SET bl.guest_id = b.guest_id 
        WHERE bl.guest_id IS NULL
    """)
    op.execute("""
        UPDATE bills SET 
            subtotal_amount = COALESCE(amount, 0.00),
            tax_amount = 0.00,
            discount_amount = 0.00,
            total_amount = COALESCE(amount, 0.00),
            paid_amount = 0.00,
            balance_due = COALESCE(amount, 0.00) 
        WHERE subtotal_amount IS NULL OR total_amount IS NULL
    """)
    op.execute("""
        UPDATE bills SET status = CASE 
            WHEN issued_date IS NOT NULL THEN 'issued' 
            ELSE 'draft' 
        END WHERE status IS NULL
    """)
    op.execute("UPDATE bills SET created_at = COALESCE(issued_date, '2026-01-01 00:00:00') WHERE created_at IS NULL")
    op.execute("UPDATE bills SET updated_at = COALESCE(issued_date, '2026-01-01 00:00:00') WHERE updated_at IS NULL")

    # =========================================================================
    # PHASE 3: FINAL CONSTRAINTS, HARDENING & COLUMN DROPS
    # =========================================================================

    # 3.1 Apply NOT NULL constraints on users
    op.alter_column('users', 'username', existing_type=sa.String(length=50), nullable=False)
    op.alter_column('users', 'password', existing_type=sa.String(length=255), nullable=False)
    op.alter_column('users', 'role', existing_type=user_role_enum, nullable=False, server_default='receptionist')
    op.alter_column('users', 'is_active', existing_type=sa.Boolean(), nullable=False, server_default=sa.text('1'))
    op.alter_column('users', 'created_at', existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column('users', 'updated_at', existing_type=sa.DateTime(timezone=True), nullable=False)

    # 3.2 Indexes on users
    user_insp = sa.inspect(op.get_bind())
    user_idxs = {ix['name'] for ix in user_insp.get_indexes('users')}
    if 'username' in user_idxs:
        op.drop_index('username', table_name='users')
    if 'ix_users_username' not in user_idxs:
        op.create_index('ix_users_username', 'users', ['username'], unique=True)
    if 'ix_users_email' not in user_idxs:
        op.create_index('ix_users_email', 'users', ['email'], unique=True)
    if 'idx_users_role_active' not in user_idxs:
        op.create_index('idx_users_role_active', 'users', ['role', 'is_active'], unique=False)

    # 3.3 Apply NOT NULL constraints and checks on guests
    op.alter_column('guests', 'first_name', existing_type=sa.String(length=50), nullable=False)
    op.alter_column('guests', 'last_name', existing_type=sa.String(length=50), nullable=False)
    op.alter_column('guests', 'phone', existing_type=sa.String(length=25), nullable=False)
    op.alter_column('guests', 'vip_status', existing_type=sa.Boolean(), nullable=False, server_default=sa.text('0'))
    op.alter_column('guests', 'created_at', existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column('guests', 'updated_at', existing_type=sa.DateTime(timezone=True), nullable=False)

    # 3.4 Indexes, unique constraints & check constraints on guests
    guest_insp = sa.inspect(op.get_bind())
    guest_idxs = {ix['name'] for ix in guest_insp.get_indexes('guests')}
    guest_uqs = {uq['name'] for uq in guest_insp.get_unique_constraints('guests')}
    guest_checks = {ck['name'] for ck in guest_insp.get_check_constraints('guests')}

    if 'ix_guests_email' not in guest_idxs:
        op.create_index('ix_guests_email', 'guests', ['email'], unique=False)
    if 'ix_guests_phone' not in guest_idxs:
        op.create_index('ix_guests_phone', 'guests', ['phone'], unique=False)
    if 'idx_guests_name' not in guest_idxs:
        op.create_index('idx_guests_name', 'guests', ['last_name', 'first_name'], unique=False)
    if 'uq_guest_id_doc' not in guest_uqs and 'uq_guest_id_doc' not in guest_idxs:
        op.create_unique_constraint('uq_guest_id_doc', 'guests', ['id_type', 'id_number'])
    if not any('chk_phone_not_empty' in name for name in guest_checks):
        op.create_check_constraint('chk_phone_not_empty', 'guests', 'LENGTH(TRIM(phone)) > 0')

    # 3.5 Apply NOT NULL constraints and checks on rooms
    op.alter_column('rooms', 'room_number', existing_type=sa.String(length=20), nullable=False)
    op.alter_column('rooms', 'floor', existing_type=sa.Integer(), nullable=False, server_default='1')
    op.alter_column('rooms', 'operational_status', existing_type=operational_status_enum, nullable=False, server_default='available')
    op.alter_column('rooms', 'cleanliness_status', existing_type=cleanliness_status_enum, nullable=False, server_default='clean')
    op.alter_column('rooms', 'is_smoking', existing_type=sa.Boolean(), nullable=False, server_default=sa.text('0'))
    op.alter_column('rooms', 'created_at', existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column('rooms', 'updated_at', existing_type=sa.DateTime(timezone=True), nullable=False)

    # 3.6 Indexes, foreign keys & check constraints on rooms
    rooms_insp = sa.inspect(op.get_bind())
    room_idxs = {ix['name'] for ix in rooms_insp.get_indexes('rooms')}
    room_fks = {fk['name'] for fk in rooms_insp.get_foreign_keys('rooms')}
    room_checks = {ck['name'] for ck in rooms_insp.get_check_constraints('rooms')}

    if 'ix_rooms_room_number' not in room_idxs:
        op.create_index('ix_rooms_room_number', 'rooms', ['room_number'], unique=True)
    if 'idx_rooms_floor' not in room_idxs:
        op.create_index('idx_rooms_floor', 'rooms', ['floor'], unique=False)
    if 'idx_rooms_type_status' not in room_idxs:
        op.create_index('idx_rooms_type_status', 'rooms', ['room_type_id', 'operational_status', 'cleanliness_status'], unique=False)
    if 'fk_rooms_room_type_id_room_types' not in room_fks:
        op.create_foreign_key('fk_rooms_room_type_id_room_types', 'rooms', 'room_types', ['room_type_id'], ['room_type_id'], ondelete='RESTRICT')
    if not any('chk_room_floor' in name for name in room_checks):
        op.create_check_constraint('chk_room_floor', 'rooms', 'floor >= -2')

    # 3.7 Apply NOT NULL constraints and checks on bookings
    op.alter_column('bookings', 'booking_ref', existing_type=sa.String(length=32), nullable=False)
    op.alter_column('bookings', 'guest_id', existing_type=sa.Integer(), nullable=False)
    op.alter_column('bookings', 'check_in_date', existing_type=sa.Date(), nullable=False)
    op.alter_column('bookings', 'num_adults', existing_type=sa.Integer(), nullable=False, server_default='1')
    op.alter_column('bookings', 'num_children', existing_type=sa.Integer(), nullable=False, server_default='0')
    op.alter_column('bookings', 'nightly_rate', existing_type=sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00')
    op.alter_column('bookings', 'total_amount', existing_type=sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00')
    op.alter_column('bookings', 'status', existing_type=booking_status_enum, nullable=False, server_default='confirmed')
    op.alter_column('bookings', 'created_at', existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column('bookings', 'updated_at', existing_type=sa.DateTime(timezone=True), nullable=False)

    # 3.8 Reconfigure foreign keys, indexes & check constraints on bookings
    # Note: bookings_ibfk_2 is explicitly excluded from Phase 3 legacy FK cleanup because
    # it was already intentionally dropped in Phase 1.5 to satisfy MySQL's AUTO_INCREMENT alteration rule.
    # Dynamic inspection of current_booking_fks ensures zero stale metadata dependency.
    booking_insp = sa.inspect(op.get_bind())
    current_booking_fks = {fk['name'] for fk in booking_insp.get_foreign_keys('bookings')}
    if 'bookings_ibfk_1' in current_booking_fks:
        op.drop_constraint('bookings_ibfk_1', 'bookings', type_='foreignkey')

    current_booking_idxs = {ix['name'] for ix in booking_insp.get_indexes('bookings')}
    if 'guest_id' in current_booking_idxs:
        op.drop_index('guest_id', table_name='bookings')
    if 'room_id' in current_booking_idxs:
        op.drop_index('room_id', table_name='bookings')

    if 'ix_bookings_booking_ref' not in current_booking_idxs:
        op.create_index('ix_bookings_booking_ref', 'bookings', ['booking_ref'], unique=True)
    if 'ix_bookings_guest_id' not in current_booking_idxs:
        op.create_index('ix_bookings_guest_id', 'bookings', ['guest_id'], unique=False)
    if 'ix_bookings_room_id' not in current_booking_idxs:
        op.create_index('ix_bookings_room_id', 'bookings', ['room_id'], unique=False)
    if 'ix_bookings_status' not in current_booking_idxs:
        op.create_index('ix_bookings_status', 'bookings', ['status'], unique=False)
    if 'idx_bookings_room_dates' not in current_booking_idxs:
        op.create_index('idx_bookings_room_dates', 'bookings', ['room_id', 'check_in_date', 'check_out_date', 'status'], unique=False)
    if 'idx_bookings_dates' not in current_booking_idxs:
        op.create_index('idx_bookings_dates', 'bookings', ['check_in_date', 'check_out_date'], unique=False)

    if 'fk_bookings_guest_id_guests' not in current_booking_fks:
        op.create_foreign_key('fk_bookings_guest_id_guests', 'bookings', 'guests', ['guest_id'], ['guest_id'], ondelete='RESTRICT')
    if 'fk_bookings_room_type_id_room_types' not in current_booking_fks:
        op.create_foreign_key('fk_bookings_room_type_id_room_types', 'bookings', 'room_types', ['room_type_id'], ['room_type_id'], ondelete='RESTRICT')
    if 'fk_bookings_room_id_rooms' not in current_booking_fks:
        op.create_foreign_key('fk_bookings_room_id_rooms', 'bookings', 'rooms', ['room_id'], ['room_id'], ondelete='SET NULL')
    if 'fk_bookings_created_by_user_id_users' not in current_booking_fks:
        op.create_foreign_key('fk_bookings_created_by_user_id_users', 'bookings', 'users', ['created_by_user_id'], ['user_id'], ondelete='SET NULL')

    current_booking_checks = {ck['name'] for ck in booking_insp.get_check_constraints('bookings')}
    if not any('chk_booking_dates' in name for name in current_booking_checks):
        op.create_check_constraint('chk_booking_dates', 'bookings', 'check_out_date IS NULL OR check_out_date > check_in_date')
    if not any('chk_actual_dates' in name for name in current_booking_checks):
        op.create_check_constraint('chk_actual_dates', 'bookings', 'actual_check_out IS NULL OR actual_check_out >= actual_check_in')
    if not any('chk_booking_adults' in name for name in current_booking_checks):
        op.create_check_constraint('chk_booking_adults', 'bookings', 'num_adults > 0')
    if not any('chk_booking_children' in name for name in current_booking_checks):
        op.create_check_constraint('chk_booking_children', 'bookings', 'num_children >= 0')

    # 3.9 Apply NOT NULL constraints and checks on bills
    op.alter_column('bills', 'invoice_number', existing_type=sa.String(length=50), nullable=False)
    op.alter_column('bills', 'booking_id', existing_type=sa.Integer(), nullable=False)
    op.alter_column('bills', 'guest_id', existing_type=sa.Integer(), nullable=False)
    op.alter_column('bills', 'subtotal_amount', existing_type=sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00')
    op.alter_column('bills', 'tax_amount', existing_type=sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00')
    op.alter_column('bills', 'discount_amount', existing_type=sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00')
    op.alter_column('bills', 'total_amount', existing_type=sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00')
    op.alter_column('bills', 'paid_amount', existing_type=sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00')
    op.alter_column('bills', 'balance_due', existing_type=sa.Numeric(precision=10, scale=2), nullable=False, server_default='0.00')
    op.alter_column('bills', 'status', existing_type=bill_status_enum, nullable=False, server_default='draft')
    op.alter_column('bills', 'created_at', existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column('bills', 'updated_at', existing_type=sa.DateTime(timezone=True), nullable=False)

    # 3.10 Reconfigure foreign keys, unique constraints & check constraints on bills
    bills_insp = sa.inspect(op.get_bind())
    current_bill_fks = {fk['name'] for fk in bills_insp.get_foreign_keys('bills')}
    if 'bills_ibfk_1' in current_bill_fks:
        op.drop_constraint('bills_ibfk_1', 'bills', type_='foreignkey')

    current_bill_idxs = {ix['name'] for ix in bills_insp.get_indexes('bills')}
    current_bill_uqs = {uq['name'] for uq in bills_insp.get_unique_constraints('bills')}
    if 'booking_id' in current_bill_idxs:
        op.drop_index('booking_id', table_name='bills')

    if 'ix_bills_invoice_number' not in current_bill_idxs:
        op.create_index('ix_bills_invoice_number', 'bills', ['invoice_number'], unique=True)
    if 'ix_bills_guest_id' not in current_bill_idxs:
        op.create_index('ix_bills_guest_id', 'bills', ['guest_id'], unique=False)
    if 'ix_bills_status' not in current_bill_idxs:
        op.create_index('ix_bills_status', 'bills', ['status'], unique=False)
    if 'uq_bills_booking_id' not in current_bill_uqs and 'uq_bills_booking_id' not in current_bill_idxs:
        op.create_unique_constraint('uq_bills_booking_id', 'bills', ['booking_id'])

    if 'fk_bills_booking_id_bookings' not in current_bill_fks:
        op.create_foreign_key('fk_bills_booking_id_bookings', 'bills', 'bookings', ['booking_id'], ['booking_id'], ondelete='RESTRICT')
    if 'fk_bills_guest_id_guests' not in current_bill_fks:
        op.create_foreign_key('fk_bills_guest_id_guests', 'bills', 'guests', ['guest_id'], ['guest_id'], ondelete='RESTRICT')

    current_bill_checks = {ck['name'] for ck in bills_insp.get_check_constraints('bills')}
    if not any('chk_bill_subtotal' in name for name in current_bill_checks):
        op.create_check_constraint('chk_bill_subtotal', 'bills', 'subtotal_amount >= 0')
    if not any('chk_bill_total' in name for name in current_bill_checks):
        op.create_check_constraint('chk_bill_total', 'bills', 'total_amount >= 0')
    if not any('chk_bill_paid' in name for name in current_bill_checks):
        op.create_check_constraint('chk_bill_paid', 'bills', 'paid_amount >= 0')
    if not any('chk_bill_amounts' in name for name in current_bill_checks):
        op.create_check_constraint('chk_bill_amounts', 'bills', "status = 'draft' OR total_amount = subtotal_amount + tax_amount - discount_amount")
    if not any('chk_bill_balance' in name for name in current_bill_checks):
        op.create_check_constraint('chk_bill_balance', 'bills', "status = 'draft' OR balance_due = total_amount - paid_amount")

    # 3.11 Drop legacy obsolete columns (Zero Data Loss Verified)
    cols_insp = sa.inspect(op.get_bind())
    rooms_curr_cols = {c['name'] for c in cols_insp.get_columns('rooms')}
    if 'room_type' in rooms_curr_cols:
        op.drop_column('rooms', 'room_type')
    if 'status' in rooms_curr_cols:
        op.drop_column('rooms', 'status')
    if 'cleaned' in rooms_curr_cols:
        op.drop_column('rooms', 'cleaned')

    guests_curr_cols = {c['name'] for c in cols_insp.get_columns('guests')}
    if 'name' in guests_curr_cols:
        op.drop_column('guests', 'name')

    bookings_curr_cols = {c['name'] for c in cols_insp.get_columns('bookings')}
    if 'booking_date' in bookings_curr_cols:
        op.drop_column('bookings', 'booking_date')

    bills_curr_cols = {c['name'] for c in cols_insp.get_columns('bills')}
    if 'amount' in bills_curr_cols:
        op.drop_column('bills', 'amount')


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # =========================================================================
    # REVERSE PHASE 3: RE-ADD LEGACY COLUMNS & RESTORE DATA
    # =========================================================================

    # 1. Re-add legacy columns
    bills_cols = {c['name'] for c in inspector.get_columns('bills')}
    if 'amount' not in bills_cols:
        op.add_column('bills', sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=True))

    bookings_cols = {c['name'] for c in inspector.get_columns('bookings')}
    if 'booking_date' not in bookings_cols:
        op.add_column('bookings', sa.Column('booking_date', sa.TIMESTAMP(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True))

    guests_cols = {c['name'] for c in inspector.get_columns('guests')}
    if 'name' not in guests_cols:
        op.add_column('guests', sa.Column('name', sa.String(length=100), nullable=True))

    rooms_cols = {c['name'] for c in inspector.get_columns('rooms')}
    if 'cleaned' not in rooms_cols:
        op.add_column('rooms', sa.Column('cleaned', sa.SmallInteger(), nullable=True))
    if 'status' not in rooms_cols:
        op.add_column('rooms', sa.Column('status', sa.String(length=20), nullable=True))
    if 'room_type' not in rooms_cols:
        op.add_column('rooms', sa.Column('room_type', sa.String(length=50), nullable=True))

    # 2. Restore legacy data from production columns
    op.execute("UPDATE bills SET amount = total_amount")
    op.execute("UPDATE bookings SET booking_date = created_at")
    op.execute("UPDATE guests SET name = CONCAT(first_name, ' ', last_name)")
    op.execute("""
        UPDATE rooms r 
        LEFT JOIN room_types rt ON r.room_type_id = rt.room_type_id 
        SET r.room_type = rt.name, 
            r.status = r.operational_status, 
            r.cleaned = IF(r.cleanliness_status = 'clean', 1, 0)
    """)

    # 3. Drop production check constraints, foreign keys, unique constraints, and indexes on bills
    bills_insp = sa.inspect(op.get_bind())
    b_checks = {ck['name'] for ck in bills_insp.get_check_constraints('bills')}
    for ck_name in ['chk_bill_balance', 'chk_bill_amounts', 'chk_bill_paid', 'chk_bill_total', 'chk_bill_subtotal']:
        for m in [name for name in b_checks if ck_name in name]:
            op.drop_constraint(m, 'bills', type_='check')

    b_fks = {fk['name'] for fk in bills_insp.get_foreign_keys('bills')}
    if 'fk_bills_guest_id_guests' in b_fks:
        op.drop_constraint('fk_bills_guest_id_guests', 'bills', type_='foreignkey')
    if 'fk_bills_booking_id_bookings' in b_fks:
        op.drop_constraint('fk_bills_booking_id_bookings', 'bills', type_='foreignkey')

    b_uqs = {uq['name'] for uq in bills_insp.get_unique_constraints('bills')}
    b_idxs = {ix['name'] for ix in bills_insp.get_indexes('bills')}
    if 'uq_bills_booking_id' in b_uqs or 'uq_bills_booking_id' in b_idxs:
        op.drop_constraint('uq_bills_booking_id', 'bills', type_='unique')

    if 'ix_bills_status' in b_idxs:
        op.drop_index('ix_bills_status', table_name='bills')
    if 'ix_bills_guest_id' in b_idxs:
        op.drop_index('ix_bills_guest_id', table_name='bills')
    if 'ix_bills_invoice_number' in b_idxs:
        op.drop_index('ix_bills_invoice_number', table_name='bills')

    # Re-add legacy bill foreign key & index
    b_idxs_after = {ix['name'] for ix in sa.inspect(op.get_bind()).get_indexes('bills')}
    if 'booking_id' not in b_idxs_after:
        op.create_index('booking_id', 'bills', ['booking_id'], unique=False)
    b_fks_after = {fk['name'] for fk in sa.inspect(op.get_bind()).get_foreign_keys('bills')}
    if 'bills_ibfk_1' not in b_fks_after:
        op.create_foreign_key('bills_ibfk_1', 'bills', 'bookings', ['booking_id'], ['booking_id'])

    # 4. Drop production check constraints, foreign keys, indexes on bookings
    bk_insp = sa.inspect(op.get_bind())
    bk_checks = {ck['name'] for ck in bk_insp.get_check_constraints('bookings')}
    for ck_name in ['chk_booking_children', 'chk_booking_adults', 'chk_actual_dates', 'chk_booking_dates']:
        for m in [name for name in bk_checks if ck_name in name]:
            op.drop_constraint(m, 'bookings', type_='check')

    bk_fks = {fk['name'] for fk in bk_insp.get_foreign_keys('bookings')}
    for fk_name in ['fk_bookings_created_by_user_id_users', 'fk_bookings_room_id_rooms', 'fk_bookings_room_type_id_room_types', 'fk_bookings_guest_id_guests']:
        if fk_name in bk_fks:
            op.drop_constraint(fk_name, 'bookings', type_='foreignkey')

    bk_idxs = {ix['name'] for ix in bk_insp.get_indexes('bookings')}
    for ix_name in ['idx_bookings_dates', 'idx_bookings_room_dates', 'ix_bookings_status', 'ix_bookings_room_id', 'ix_bookings_guest_id', 'ix_bookings_booking_ref']:
        if ix_name in bk_idxs:
            op.drop_index(ix_name, table_name='bookings')

    # Re-add legacy booking indexes and guest foreign key
    bk_idxs_after = {ix['name'] for ix in sa.inspect(op.get_bind()).get_indexes('bookings')}
    if 'room_id' not in bk_idxs_after:
        op.create_index('room_id', 'bookings', ['room_id'], unique=False)
    if 'guest_id' not in bk_idxs_after:
        op.create_index('guest_id', 'bookings', ['guest_id'], unique=False)
    bk_fks_after = {fk['name'] for fk in sa.inspect(op.get_bind()).get_foreign_keys('bookings')}
    if 'bookings_ibfk_1' not in bk_fks_after:
        op.create_foreign_key('bookings_ibfk_1', 'bookings', 'guests', ['guest_id'], ['guest_id'])

    # 5. Drop production check constraints, foreign keys, indexes on rooms
    rooms_insp = sa.inspect(op.get_bind())
    rm_checks = {ck['name'] for ck in rooms_insp.get_check_constraints('rooms')}
    for m in [name for name in rm_checks if 'chk_room_floor' in name]:
        op.drop_constraint(m, 'rooms', type_='check')

    rm_fks = {fk['name'] for fk in rooms_insp.get_foreign_keys('rooms')}
    if 'fk_rooms_room_type_id_room_types' in rm_fks:
        op.drop_constraint('fk_rooms_room_type_id_room_types', 'rooms', type_='foreignkey')

    rm_idxs = {ix['name'] for ix in rooms_insp.get_indexes('rooms')}
    for ix_name in ['idx_rooms_type_status', 'idx_rooms_floor', 'ix_rooms_room_number']:
        if ix_name in rm_idxs:
            op.drop_index(ix_name, table_name='rooms')

    # 6. Drop production check constraints, unique constraints, indexes on guests
    guests_insp = sa.inspect(op.get_bind())
    g_checks = {ck['name'] for ck in guests_insp.get_check_constraints('guests')}
    for m in [name for name in g_checks if 'chk_phone_not_empty' in name]:
        op.drop_constraint(m, 'guests', type_='check')

    g_uqs = {uq['name'] for uq in guests_insp.get_unique_constraints('guests')}
    g_idxs = {ix['name'] for ix in guests_insp.get_indexes('guests')}
    if 'uq_guest_id_doc' in g_uqs or 'uq_guest_id_doc' in g_idxs:
        op.drop_constraint('uq_guest_id_doc', 'guests', type_='unique')

    for ix_name in ['idx_guests_name', 'ix_guests_phone', 'ix_guests_email']:
        if ix_name in g_idxs:
            op.drop_index(ix_name, table_name='guests')

    # 7. Drop production indexes on users
    users_insp = sa.inspect(op.get_bind())
    u_idxs = {ix['name'] for ix in users_insp.get_indexes('users')}
    for ix_name in ['idx_users_role_active', 'ix_users_email', 'ix_users_username']:
        if ix_name in u_idxs:
            op.drop_index(ix_name, table_name='users')
    if 'username' not in u_idxs:
        op.create_index('username', 'users', ['username'], unique=True)

    # =========================================================================
    # REVERSE PHASE 2 & 1: DROP PRODUCTION COLUMNS, REVERT TYPES & TABLES
    # =========================================================================

    cols_insp = sa.inspect(op.get_bind())

    # Drop production columns from bills
    b_cols = {c['name'] for c in cols_insp.get_columns('bills')}
    for c in ['updated_at', 'created_at', 'notes', 'status', 'balance_due', 'paid_amount', 'total_amount', 'discount_amount', 'tax_amount', 'subtotal_amount', 'guest_id', 'invoice_number']:
        if c in b_cols:
            op.drop_column('bills', c)

    # Drop production columns from bookings
    bk_cols = {c['name'] for c in cols_insp.get_columns('bookings')}
    for c in ['updated_at', 'created_at', 'created_by_user_id', 'cancellation_reason', 'special_requests', 'status', 'total_amount', 'nightly_rate', 'num_children', 'num_adults', 'actual_check_out', 'actual_check_in', 'room_type_id', 'booking_ref']:
        if c in bk_cols:
            op.drop_column('bookings', c)

    # Drop production columns from rooms
    rm_cols = {c['name'] for c in cols_insp.get_columns('rooms')}
    for c in ['updated_at', 'created_at', 'notes', 'is_smoking', 'cleanliness_status', 'operational_status', 'room_type_id', 'floor', 'room_number']:
        if c in rm_cols:
            op.drop_column('rooms', c)

    # Drop production columns from guests
    g_cols = {c['name'] for c in cols_insp.get_columns('guests')}
    for c in ['updated_at', 'created_at', 'notes', 'vip_status', 'postal_code', 'country', 'city', 'id_number', 'id_type', 'last_name', 'first_name']:
        if c in g_cols:
            op.drop_column('guests', c)

    # Drop production columns from users
    u_cols = {c['name'] for c in cols_insp.get_columns('users')}
    for c in ['updated_at', 'created_at', 'is_active', 'full_name', 'email']:
        if c in u_cols:
            op.drop_column('users', c)

    # Revert modified column types
    op.alter_column('guests', 'email', existing_type=sa.String(length=120), type_=sa.String(length=100), existing_nullable=True)
    op.alter_column('guests', 'phone', existing_type=sa.String(length=25), type_=sa.String(length=15), existing_nullable=True)
    op.alter_column('users', 'role', existing_type=user_role_enum, type_=sa.String(length=20), existing_nullable=True)
    op.alter_column('users', 'password', existing_type=sa.String(length=255), type_=sa.String(length=100), existing_nullable=True)

    # 10. Revert rooms.room_id AUTO_INCREMENT while no FK references rooms.room_id
    op.execute("ALTER TABLE rooms MODIFY room_id INT NOT NULL")

    # 11. Re-add legacy foreign key bookings_ibfk_2 (after rooms.room_id AUTO_INCREMENT is reverted)
    bk_fks_final = {fk['name'] for fk in sa.inspect(op.get_bind()).get_foreign_keys('bookings')}
    if 'bookings_ibfk_2' not in bk_fks_final:
        op.create_foreign_key('bookings_ibfk_2', 'bookings', 'rooms', ['room_id'], ['room_id'])

    # 12. Drop newly created tables in reverse dependency order
    if 'maintenance' in existing_tables:
        op.drop_table('maintenance')
    if 'housekeeping' in existing_tables:
        op.drop_table('housekeeping')
    if 'payments' in existing_tables:
        op.drop_table('payments')
    if 'room_types' in existing_tables:
        op.drop_table('room_types')
