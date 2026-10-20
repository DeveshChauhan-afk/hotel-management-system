import os
from flask import Flask
from config import Config
from flask_cors import CORS
from app.extensions import db, jwt, bcrypt, limiter, migrate
from app.routes.dashboard_routes import dashboard_bp


def create_app(config_class=None):
    if config_class is None:
        config_class = Config

    app = Flask(__name__)

    app.config.from_object(config_class)

    # Fail-closed guard: if in testing mode, validate database URI before db.init_app
    if app.config.get("TESTING"):
        from config import validate_test_database_uri
        validate_test_database_uri(app.config.get("SQLALCHEMY_DATABASE_URI"))

    CORS(app)

    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    limiter.init_app(app)

    migrations_dir = os.path.join(os.path.dirname(app.root_path), "migrations")
    migrate.init_app(
        app,
        db,
        directory=migrations_dir,
        compare_type=True,
        compare_server_default=True,
        render_as_batch=False,
    )

    from app import models as _models

    from app.models.room_model import Room

    from app.models.booking_model import Booking

    from app.routes.booking_routes import booking_bp

    from app.routes.room_routes import room_bp
    from app.models.user_model import User
    from app.routes.auth_routes import auth_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(booking_bp)
    app.register_blueprint(room_bp)
    app.register_blueprint(dashboard_bp)

    return app
