from flask import Flask
from config import Config
from flask_cors import CORS
from app.extensions import db, jwt, bcrypt, limiter
from app.routes.dashboard_routes import dashboard_bp
def create_app():

    app = Flask(__name__)

    app.config.from_object(Config)

    CORS(app)

    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    limiter.init_app(app)

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