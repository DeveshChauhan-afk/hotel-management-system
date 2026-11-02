import logging
from flask import jsonify
from werkzeug.exceptions import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from flask_jwt_extended.exceptions import JWTExtendedException
from app.extensions import db

logger = logging.getLogger(__name__)


def register_error_handlers(app):
    @app.errorhandler(400)
    def handle_bad_request(e):
        description = getattr(e, "description", "Bad request")
        return jsonify({"error": description}), 400

    @app.errorhandler(401)
    def handle_unauthorized(e):
        description = getattr(e, "description", "Unauthorized")
        return jsonify({"error": description}), 401

    @app.errorhandler(403)
    def handle_forbidden(e):
        description = getattr(e, "description", "Access denied")
        return jsonify({"error": description}), 403

    @app.errorhandler(404)
    def handle_not_found(e):
        desc = getattr(e, "description", None)
        default_werkzeug = "The requested URL was not found on the server. If you entered the URL manually please check your spelling and try again."
        message = desc if desc and desc != default_werkzeug else "Resource not found"
        return jsonify({"error": message}), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(429)
    def handle_rate_limit(e):
        description = getattr(e, "description", "Too many requests")
        return jsonify({
            "error": "Rate limit exceeded",
            "detail": str(description)
        }), 429

    @app.errorhandler(SQLAlchemyError)
    def handle_sqlalchemy_error(e):
        db.session.rollback()
        logger.error(f"Database error occurred: {type(e).__name__}")
        return jsonify({"error": "A database error occurred"}), 500

    @app.errorhandler(500)
    def handle_internal_server_error(e):
        db.session.rollback()
        logger.error(f"Internal server error: {e}")
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(Exception)
    def handle_generic_exception(e):
        if isinstance(e, JWTExtendedException):
            raise e
        if isinstance(e, HTTPException):
            description = getattr(e, "description", "An HTTP error occurred")
            return jsonify({"error": description}), e.code

        db.session.rollback()
        logger.error(f"Unhandled exception: {type(e).__name__}")
        return jsonify({"error": "An unexpected error occurred"}), 500
