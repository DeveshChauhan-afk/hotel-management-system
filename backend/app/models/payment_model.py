from datetime import datetime, timezone
from app.extensions import db


class Payment(db.Model):
    __tablename__ = "payments"

    payment_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    payment_ref = db.Column(db.String(64), unique=True, nullable=False, index=True)
    bill_id = db.Column(
        db.Integer,
        db.ForeignKey("bills.bill_id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    payment_type = db.Column(
        db.Enum("charge", "refund", "deposit", name="payment_type_enum"),
        default="charge",
        nullable=False,
    )
    payment_method = db.Column(
        db.Enum(
            "cash",
            "credit_card",
            "debit_card",
            "bank_transfer",
            "upi",
            "online",
            name="payment_method_enum",
        ),
        nullable=False,
    )
    status = db.Column(
        db.Enum("pending", "completed", "failed", "refunded", name="payment_status_enum"),
        default="pending",
        nullable=False,
        index=True,
    )
    gateway_provider = db.Column(db.String(50), nullable=True)
    gateway_txn_id = db.Column(db.String(100), nullable=True)
    gateway_payload = db.Column(db.JSON, nullable=True)
    recorded_by_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )

    paid_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        db.CheckConstraint("amount > 0", name="chk_payment_amount"),
        db.Index("idx_payments_gateway_txn", "gateway_provider", "gateway_txn_id"),
        db.Index("idx_payments_status_paid", "status", "paid_at"),
    )

    # Relationships
    bill = db.relationship("Bill", back_populates="payments")
    recorded_by = db.relationship(
        "User",
        back_populates="payments_recorded",
        foreign_keys=[recorded_by_user_id],
    )

    def to_dict(self):
        return {
            "payment_id": self.payment_id,
            "payment_ref": self.payment_ref,
            "bill_id": self.bill_id,
            "amount": str(self.amount) if self.amount is not None else "0.00",
            "payment_type": self.payment_type,
            "payment_method": self.payment_method,
            "status": self.status,
            "gateway_provider": self.gateway_provider,
            "gateway_txn_id": self.gateway_txn_id,
            "recorded_by_user_id": self.recorded_by_user_id,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
