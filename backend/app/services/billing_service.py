import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from sqlalchemy.exc import SQLAlchemyError
from app.extensions import db
from app.models.bill_model import Bill
from app.models.payment_model import Payment
from app.models.booking_model import Booking
from app.models.room_model import Room


VALID_PAYMENT_METHODS = {"cash", "credit_card", "debit_card", "bank_transfer", "upi", "online"}
VALID_PAYMENT_TYPES = {"charge", "refund", "deposit"}
VALID_BILL_STATUSES = {"draft", "issued", "partially_paid", "paid", "voided", "refunded"}


def generate_invoice_number():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_suffix = uuid.uuid4().hex[:8].upper()
    return f"INV-{timestamp}-{random_suffix}"


def generate_payment_ref():
    random_suffix = uuid.uuid4().hex[:12].upper()
    return f"PAY-{random_suffix}"


def generate_bill_for_booking(booking_id, data=None):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return {"error": "Booking not found"}, 404

    # Duplicate bill check (model has UniqueConstraint on booking_id)
    existing_bill = Bill.query.filter_by(booking_id=booking.booking_id).first()
    if existing_bill:
        return {
            "error": "A bill already exists for this booking",
            "bill": existing_bill.to_dict(),
        }, 409

    if data is None:
        data = {}

    subtotal = Decimal(str(booking.total_amount)) if booking.total_amount is not None else Decimal("0.00")

    tax_raw = data.get("tax_amount", "0.00")
    try:
        tax = Decimal(str(tax_raw).strip())
        if tax < Decimal("0.00"):
            return {"error": "tax_amount must be a non-negative number"}, 400
    except (InvalidOperation, TypeError, ValueError):
        return {"error": "tax_amount must be a valid number"}, 400

    discount_raw = data.get("discount_amount", "0.00")
    try:
        discount = Decimal(str(discount_raw).strip())
        if discount < Decimal("0.00"):
            return {"error": "discount_amount must be a non-negative number"}, 400
    except (InvalidOperation, TypeError, ValueError):
        return {"error": "discount_amount must be a valid number"}, 400

    total = subtotal + tax - discount
    if total < Decimal("0.00"):
        return {"error": "Discount amount cannot exceed subtotal plus tax"}, 400

    paid = Decimal("0.00")
    balance = total - paid

    status_req = data.get("status", "issued")
    if status_req not in ("draft", "issued"):
        status_req = "issued"

    now = datetime.now(timezone.utc)
    issued_date = now if status_req != "draft" else None
    notes = data.get("notes")
    if isinstance(notes, str):
        notes = notes.strip()
    else:
        notes = None

    bill = Bill(
        invoice_number=generate_invoice_number(),
        booking_id=booking.booking_id,
        guest_id=booking.guest_id,
        subtotal_amount=subtotal,
        tax_amount=tax,
        discount_amount=discount,
        total_amount=total,
        paid_amount=paid,
        balance_due=balance,
        status=status_req,
        issued_date=issued_date,
        notes=notes,
    )

    try:
        db.session.add(bill)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while generating bill"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while generating bill"}, 500

    return {
        "message": "Bill generated successfully",
        "bill": bill.to_dict(),
    }, 201


def get_bills(filters=None):
    query = Bill.query

    if filters and isinstance(filters, dict):
        booking_id = filters.get("booking_id")
        if booking_id is not None:
            try:
                query = query.filter_by(booking_id=int(booking_id))
            except (ValueError, TypeError):
                pass

        guest_id = filters.get("guest_id")
        if guest_id is not None:
            try:
                query = query.filter_by(guest_id=int(guest_id))
            except (ValueError, TypeError):
                pass

        status = filters.get("status")
        if status and status in VALID_BILL_STATUSES:
            query = query.filter_by(status=status)

    bills = query.order_by(Bill.created_at.desc()).all()
    return [b.to_dict() for b in bills], 200


def get_bill_by_id(bill_id):
    bill = db.session.get(Bill, bill_id)
    if not bill:
        return {"error": "Bill not found"}, 404

    bill_data = bill.to_dict()
    bill_data["payments"] = [p.to_dict() for p in bill.payments]
    return bill_data, 200


def checkout_booking(booking_id):
    booking = db.session.get(Booking, booking_id)
    if not booking:
        return {"error": "Booking not found"}, 404

    if booking.status == "checked_out":
        return {"error": "Booking is already checked out"}, 400

    if booking.status in ("cancelled", "no_show"):
        return {"error": f"Cannot check out booking with status '{booking.status}'"}, 400

    now = datetime.now(timezone.utc)

    # 1. Update Booking state
    booking.status = "checked_out"
    booking.actual_check_out = now
    if not booking.actual_check_in:
        booking.actual_check_in = booking.created_at if booking.created_at else now
    booking.updated_at = now

    # 2. Update Room state
    room = booking.room
    if room:
        # Checkout leaves room dirty for housekeeping
        room.cleanliness_status = "dirty"
        # If room was not in maintenance or out of service, set operational_status available
        if room.operational_status not in ("under_maintenance", "out_of_service"):
            room.operational_status = "available"
        room.updated_at = now

    # 3. Ensure Bill is generated if not already existing
    bill = Bill.query.filter_by(booking_id=booking.booking_id).first()
    if not bill:
        subtotal = Decimal(str(booking.total_amount)) if booking.total_amount is not None else Decimal("0.00")
        tax = Decimal("0.00")
        discount = Decimal("0.00")
        total = subtotal + tax - discount
        paid = Decimal("0.00")
        balance = total - paid

        bill = Bill(
            invoice_number=generate_invoice_number(),
            booking_id=booking.booking_id,
            guest_id=booking.guest_id,
            subtotal_amount=subtotal,
            tax_amount=tax,
            discount_amount=discount,
            total_amount=total,
            paid_amount=paid,
            balance_due=balance,
            status="issued",
            issued_date=now,
        )
        db.session.add(bill)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error during checkout"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error during checkout"}, 500

    return {
        "message": "Checkout completed successfully",
        "booking": booking.to_dict(),
        "bill": bill.to_dict(),
        "room": room.to_dict() if room else None,
    }, 200


def record_payment(bill_id, data, user_id=None):
    if not isinstance(data, dict):
        return {"error": "Invalid payload format"}, 400

    bill = db.session.get(Bill, bill_id)
    if not bill:
        return {"error": "Bill not found"}, 404

    if bill.status == "paid":
        return {"error": "Bill is already fully paid"}, 400

    if bill.status in ("voided", "refunded"):
        return {"error": f"Cannot record payment on a {bill.status} bill"}, 400

    amount_raw = data.get("amount")
    if amount_raw is None:
        return {"error": "amount is required"}, 400

    try:
        amount = Decimal(str(amount_raw).strip())
        if amount <= Decimal("0.00"):
            return {"error": "amount must be greater than 0"}, 400
    except (InvalidOperation, TypeError, ValueError):
        return {"error": "amount must be a valid positive number"}, 400

    if amount > bill.balance_due:
        return {
            "error": f"Payment amount ({amount}) exceeds remaining balance of {bill.balance_due}"
        }, 400

    payment_method = data.get("payment_method", "cash")
    if not isinstance(payment_method, str) or payment_method not in VALID_PAYMENT_METHODS:
        return {"error": f"payment_method must be one of {sorted(list(VALID_PAYMENT_METHODS))}"}, 400

    payment_type = data.get("payment_type", "charge")
    if not isinstance(payment_type, str) or payment_type not in VALID_PAYMENT_TYPES:
        return {"error": f"payment_type must be one of {sorted(list(VALID_PAYMENT_TYPES))}"}, 400

    gateway_provider = data.get("gateway_provider")
    gateway_txn_id = data.get("gateway_txn_id")
    gateway_payload = data.get("gateway_payload")

    now = datetime.now(timezone.utc)

    # Update bill balance and status
    bill.paid_amount = bill.paid_amount + amount
    bill.balance_due = bill.total_amount - bill.paid_amount
    if bill.balance_due == Decimal("0.00"):
        bill.status = "paid"
    else:
        bill.status = "partially_paid"
    bill.updated_at = now

    from app.models.user_model import User
    valid_user_id = None
    if user_id:
        u = db.session.get(User, user_id)
        if u:
            valid_user_id = u.user_id

    # Create Payment record (strictly sanitized, no raw card/CVV data stored)
    payment = Payment(
        payment_ref=generate_payment_ref(),
        bill_id=bill.bill_id,
        amount=amount,
        payment_type=payment_type,
        payment_method=payment_method,
        status="completed",
        gateway_provider=str(gateway_provider)[:50] if gateway_provider else None,
        gateway_txn_id=str(gateway_txn_id)[:100] if gateway_txn_id else None,
        gateway_payload=gateway_payload if isinstance(gateway_payload, dict) else None,
        recorded_by_user_id=valid_user_id,
        paid_at=now,
    )

    try:
        db.session.add(payment)
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return {"error": "Database error while recording payment"}, 500
    except Exception:
        db.session.rollback()
        return {"error": "Unexpected error while recording payment"}, 500

    return {
        "message": "Payment recorded successfully",
        "payment": payment.to_dict(),
        "bill": bill.to_dict(),
    }, 201


def get_payments(filters=None):
    query = Payment.query

    if filters and isinstance(filters, dict):
        bill_id = filters.get("bill_id")
        if bill_id is not None:
            try:
                query = query.filter_by(bill_id=int(bill_id))
            except (ValueError, TypeError):
                pass

        payment_method = filters.get("payment_method")
        if payment_method and payment_method in VALID_PAYMENT_METHODS:
            query = query.filter_by(payment_method=payment_method)

        status = filters.get("status")
        if status:
            query = query.filter_by(status=status)

    payments = query.order_by(Payment.paid_at.desc()).all()
    return [p.to_dict() for p in payments], 200


def get_payment_by_id(payment_id):
    payment = db.session.get(Payment, payment_id)
    if not payment:
        return {"error": "Payment not found"}, 404
    return payment.to_dict(), 200
