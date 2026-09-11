import os
from flask import Blueprint, request, jsonify

from app.extensions import limiter
from app.services.auth_service import login_user

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/login", methods=["POST"])
@limiter.limit(lambda: os.getenv("LOGIN_RATE_LIMIT", "5 per minute"))
def login():

    data = request.get_json()

    username = data.get("username")
    password = data.get("password")

    if not username or not password:

        return jsonify({
            "error": "Username and password required"
        }), 400

    response, status_code = login_user(
        username,
        password
    )

    return jsonify(response), status_code