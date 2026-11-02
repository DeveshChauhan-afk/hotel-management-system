from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app.utils.role_required import role_required
from app.services.billing_service import (
    generate_bill_for_booking,
    get_bills,
    get_bill_by_id,
    checkout_booking,
    record_payment,
    get_payments,
    get_payment_by_id,
)

billing_bp = Blueprint("billing", __name__)


@billing_bp.route("/bookings/<int:booking_id>/bill", methods=["POST"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def create_bill(booking_id):
    data = request.get_json(silent=True)
    if data is not None and not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    response, status_code = generate_bill_for_booking(booking_id, data=data)
    return jsonify(response), status_code


@billing_bp.route("/bills", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def list_bills():
    filters = {
        "booking_id": request.args.get("booking_id", type=int),
        "guest_id": request.args.get("guest_id", type=int),
        "status": request.args.get("status", type=str),
    }
    response, status_code = get_bills(filters=filters)
    return jsonify(response), status_code


@billing_bp.route("/bills/<int:bill_id>", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def retrieve_bill(bill_id):
    response, status_code = get_bill_by_id(bill_id)
    return jsonify(response), status_code


@billing_bp.route("/bookings/<int:booking_id>/checkout", methods=["POST"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def checkout(booking_id):
    response, status_code = checkout_booking(booking_id)
    return jsonify(response), status_code


@billing_bp.route("/bills/<int:bill_id>/payments", methods=["POST"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def add_payment(bill_id):
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Request body must be a valid JSON object"}), 400

    claims = get_jwt()
    user_id = claims.get("user_id") if claims else None

    response, status_code = record_payment(bill_id, data, user_id=user_id)
    return jsonify(response), status_code


@billing_bp.route("/payments", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def list_payments():
    filters = {
        "bill_id": request.args.get("bill_id", type=int),
        "payment_method": request.args.get("payment_method", type=str),
        "status": request.args.get("status", type=str),
    }
    response, status_code = get_payments(filters=filters)
    return jsonify(response), status_code


@billing_bp.route("/payments/<int:payment_id>", methods=["GET"])
@jwt_required()
@role_required("admin", "manager", "receptionist")
def retrieve_payment(payment_id):
    response, status_code = get_payment_by_id(payment_id)
    return jsonify(response), status_code
