from app import create_app
from app.extensions import db
from app.models.user_model import User
from werkzeug.security import generate_password_hash

def seed_database():
    app = create_app()
    with app.app_context():
        db.create_all()

        admin = User.query.filter_by(username="admin").first()
        hashed_password = generate_password_hash("admin123", method="pbkdf2:sha256", salt_length=8)

        if not admin:
            admin = User(
                username="admin",
                password=hashed_password,
                role="admin"
            )
            db.session.add(admin)
            print("Created default admin user with valid hashed password.")
        else:
            admin.password = hashed_password
            print("Updated existing admin user with valid hashed password.")

        db.session.commit()
        print("Database seeding completed.")

if __name__ == "__main__":
    seed_database()
