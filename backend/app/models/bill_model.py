from datetime import datetime, timezone
from decimal import Decimal
from app.extensions import db


class Bill(db.Model):
    __tablename__ = "bills"

    bill_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    invoice_number = db.Column(db.String(50), unique=True, nullable=False, index=True)
    booking_id = db.Column(
        db.Integer,
        db.ForeignKey("bookings.booking_id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
    )
    guest_id = db.Column(
        db.Integer,
        db.ForeignKey("guests.guest_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    subtotal_amount = db.Column(db.Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    tax_amount = db.Column(db.Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    discount_amount = db.Column(db.Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    total_amount = db.Column(db.Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    paid_amount = db.Column(db.Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    balance_due = db.Column(db.Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    status = db.Column(
        db.Enum(
            "draft",
            "issued",
            "partially_paid",
            "paid",
            "voided",
            "refunded",
            name="bill_status_enum",
        ),
        default="draft",
        nullable=False,
        index=True,
    )
    issued_date = db.Column(db.DateTime(timezone=True), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.CheckConstraint("subtotal_amount >= 0", name="chk_bill_subtotal"),
        db.CheckConstraint("total_amount >= 0", name="chk_bill_total"),
        db.CheckConstraint("paid_amount >= 0", name="chk_bill_paid"),
        db.CheckConstraint(
            "status = 'draft' OR total_amount = subtotal_amount + tax_amount - discount_amount",
            name="chk_bill_amounts",
        ),
        db.CheckConstraint(
            "status = 'draft' OR balance_due = total_amount - paid_amount",
            name="chk_bill_balance",
        ),
    )

    # Relationships
    booking = db.relationship("Booking", back_populates="bill")
    guest = db.relationship("Guest", back_populates="bills")
    payments = db.relationship("Payment", back_populates="bill", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "bill_id": self.bill_id,
            "invoice_number": self.invoice_number,
            "booking_id": self.booking_id,
            "guest_id": self.guest_id,
            "subtotal_amount": str(self.subtotal_amount) if self.subtotal_amount is not None else "0.00",
            "tax_amount": str(self.tax_amount) if self.tax_amount is not None else "0.00",
            "discount_amount": str(self.discount_amount) if self.discount_amount is not None else "0.00",
            "total_amount": str(self.total_amount) if self.total_amount is not None else "0.00",
            "paid_amount": str(self.paid_amount) if self.paid_amount is not None else "0.00",
            "balance_due": str(self.balance_due) if self.balance_due is not None else "0.00",
            "status": self.status,
            "issued_date": self.issued_date.isoformat() if self.issued_date else None,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
