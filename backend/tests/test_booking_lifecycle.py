import os
import sys
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy.pool import StaticPool

# Ensure backend directory is in path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ["HOTEL_TEST_DATABASE_URL"] = "sqlite:///:memory:"

from app import create_app
from config import TestingConfig, validate_test_database_uri
from app.extensions import db, bcrypt
from app.models.user_model import User
from app.models.guest_model import Guest
from app.models.room_type_model import RoomType
from app.models.room_model import Room
from app.models.booking_model import Booking
from app.models.bill_model import Bill
from flask_jwt_extended import create_access_token


class BookingLifecycleTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        validate_test_database_uri(os.environ["HOTEL_TEST_DATABASE_URL"])
        cls.app = create_app(TestingConfig)
        cls.app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"poolclass": StaticPool}
        cls.client = cls.app.test_client()

        with cls.app.app_context():
            db.create_all()

            # Create test staff users
            hashed = bcrypt.generate_password_hash("password123").decode("utf-8")
            admin_user = User(username="admin_user", email="admin@test.com", password_hash=hashed, role="admin")
            receptionist_user = User(username="rec_user", email="rec@test.com", password_hash=hashed, role="receptionist")
            housekeeper_user = User(username="hk_user", email="hk@test.com", password_hash=hashed, role="housekeeper")
            db.session.add_all([admin_user, receptionist_user, housekeeper_user])

            # Baseline room type
            rt = RoomType(
                name="Deluxe Suite",
                code="DLX_STE",
                base_price=Decimal("150.00"),
                max_occupancy=2,
            )
            db.session.add(rt)
            db.session.commit()

            cls.admin_token = create_access_token(
                identity="admin_user",
                additional_claims={"user_id": admin_user.user_id, "role": "admin"}
            )
            cls.receptionist_token = create_access_token(
                identity="rec_user",
                additional_claims={"user_id": receptionist_user.user_id, "role": "receptionist"}
            )
            cls.housekeeper_token = create_access_token(
                identity="hk_user",
                additional_claims={"user_id": housekeeper_user.user_id, "role": "housekeeper"}
            )

        cls.admin_headers = {
            "Authorization": f"Bearer {cls.admin_token}",
            "Content-Type": "application/json"
        }
        cls.receptionist_headers = {
            "Authorization": f"Bearer {cls.receptionist_token}",
            "Content-Type": "application/json"
        }
        cls.housekeeper_headers = {
            "Authorization": f"Bearer {cls.housekeeper_token}",
            "Content-Type": "application/json"
        }

    @classmethod
    def tearDownClass(cls):
        with cls.app.app_context():
            db.session.remove()
            db.drop_all()

    def setUp(self):
        with self.app.app_context():
            # Reset bookings, bills, rooms, guests between tests
            Bill.query.delete()
            Booking.query.delete()
            Room.query.delete()
            Guest.query.delete()

            guest = Guest(
                first_name="John",
                last_name="Doe",
                phone="+1-555-0199",
                email="john.doe@test.com",
            )
            db.session.add(guest)

            room = Room(
                room_number="101",
                floor=1,
                room_type_id=1,
                operational_status="available",
                cleanliness_status="clean",
            )
            db.session.add(room)
            db.session.commit()

            self.guest_id = guest.guest_id
            self.room_id = room.room_id

    # -------------------------------------------------------------------------
    # 1. Successful check-in
    # -------------------------------------------------------------------------
    def test_01_successful_checkin(self):
        """Verify confirmed booking transitions to checked_in, records actual_check_in, and sets room occupied."""
        # Create confirmed booking
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        self.assertEqual(res.status_code, 201)
        booking_id = res.get_json()["booking"]["booking_id"]

        # Room should still be available (no premature occupancy)
        with self.app.app_context():
            r = db.session.get(Room, self.room_id)
            self.assertEqual(r.operational_status, "available")

        # Check in
        checkin_res = self.client.post(
            f"/bookings/{booking_id}/check-in",
            headers=self.receptionist_headers
        )
        self.assertEqual(checkin_res.status_code, 200)
        data = checkin_res.get_json()
        self.assertEqual(data.get("message"), "Booking checked in successfully")
        booking = data.get("booking")
        self.assertEqual(booking["status"], "checked_in")
        self.assertIsNotNone(booking["actual_check_in"])

        # Room operational_status must now be occupied
        with self.app.app_context():
            r = db.session.get(Room, self.room_id)
            self.assertEqual(r.operational_status, "occupied")
            self.assertFalse(r.is_available)

    # -------------------------------------------------------------------------
    # 2. Repeated check-in rejection
    # -------------------------------------------------------------------------
    def test_02_repeated_checkin_rejected(self):
        """Verify checking in an already checked-in booking returns 400 Bad Request."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        # First check-in succeeds
        r1 = self.client.post(f"/bookings/{booking_id}/check-in", headers=self.receptionist_headers)
        self.assertEqual(r1.status_code, 200)

        # Repeated check-in rejected
        r2 = self.client.post(f"/bookings/{booking_id}/check-in", headers=self.receptionist_headers)
        self.assertEqual(r2.status_code, 400)
        self.assertIn("already checked in", r2.get_json().get("error", ""))

    # -------------------------------------------------------------------------
    # 3. Check-in rejection for cancelled or checked-out bookings
    # -------------------------------------------------------------------------
    def test_03_checkin_rejected_for_cancelled_or_checked_out(self):
        """Verify check-in fails on cancelled and checked-out bookings."""
        with self.app.app_context():
            b_cancelled = Booking(
                guest_id=self.guest_id,
                room_id=self.room_id,
                status="cancelled",
                check_in_date=date.today(),
                check_out_date=date.today() + timedelta(days=1),
            )
            b_checked_out = Booking(
                guest_id=self.guest_id,
                room_id=self.room_id,
                status="checked_out",
                check_in_date=date.today(),
                check_out_date=date.today() + timedelta(days=1),
            )
            db.session.add_all([b_cancelled, b_checked_out])
            db.session.commit()
            cancelled_id = b_cancelled.booking_id
            checked_out_id = b_checked_out.booking_id

        # Cancelled booking check-in rejected
        r_canc = self.client.post(f"/bookings/{cancelled_id}/check-in", headers=self.admin_headers)
        self.assertEqual(r_canc.status_code, 400)

        # Checked-out booking check-in rejected
        r_co = self.client.post(f"/bookings/{checked_out_id}/check-in", headers=self.admin_headers)
        self.assertEqual(r_co.status_code, 400)

    # -------------------------------------------------------------------------
    # 4. Dirty room rejection
    # -------------------------------------------------------------------------
    def test_04_checkin_dirty_room_rejected(self):
        """Verify check-in is rejected when the assigned room is not clean."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        with self.app.app_context():
            r = db.session.get(Room, self.room_id)
            r.cleanliness_status = "dirty"
            db.session.commit()

        checkin_res = self.client.post(f"/bookings/{booking_id}/check-in", headers=self.receptionist_headers)
        self.assertEqual(checkin_res.status_code, 400)
        self.assertIn("not cleaned", checkin_res.get_json().get("error", ""))

    # -------------------------------------------------------------------------
    # 5. Occupied room rejection
    # -------------------------------------------------------------------------
    def test_05_checkin_occupied_room_rejected(self):
        """Verify check-in is rejected when room operational_status is already occupied."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        with self.app.app_context():
            r = db.session.get(Room, self.room_id)
            r.operational_status = "occupied"
            db.session.commit()

        checkin_res = self.client.post(f"/bookings/{booking_id}/check-in", headers=self.receptionist_headers)
        self.assertEqual(checkin_res.status_code, 400)
        self.assertIn("already occupied", checkin_res.get_json().get("error", ""))

    # -------------------------------------------------------------------------
    # 6. Maintenance room rejection
    # -------------------------------------------------------------------------
    def test_06_checkin_maintenance_room_rejected(self):
        """Verify check-in is rejected when room is under maintenance or out of service."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        with self.app.app_context():
            r = db.session.get(Room, self.room_id)
            r.operational_status = "under_maintenance"
            db.session.commit()

        checkin_res = self.client.post(f"/bookings/{booking_id}/check-in", headers=self.receptionist_headers)
        self.assertEqual(checkin_res.status_code, 400)
        self.assertIn("under_maintenance", checkin_res.get_json().get("error", ""))

    # -------------------------------------------------------------------------
    # 7. Unauthorized check-in
    # -------------------------------------------------------------------------
    def test_07_unauthorized_checkin(self):
        """Verify housekeeper role gets 403 and unauthenticated gets 401 on check-in."""
        res = self.client.post(
            "/bookings",
            headers=self.admin_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        # Missing token -> 401
        r_unauth = self.client.post(f"/bookings/{booking_id}/check-in")
        self.assertEqual(r_unauth.status_code, 401)

        # Housekeeper role -> 403
        r_forbid = self.client.post(f"/bookings/{booking_id}/check-in", headers=self.housekeeper_headers)
        self.assertEqual(r_forbid.status_code, 403)

    # -------------------------------------------------------------------------
    # 8. Successful cancellation
    # -------------------------------------------------------------------------
    def test_08_successful_cancellation(self):
        """Verify confirmed booking transitions to cancelled status."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        canc_res = self.client.post(
            f"/bookings/{booking_id}/cancel",
            headers=self.receptionist_headers,
            json={"cancellation_reason": "Guest change of plans"}
        )
        self.assertEqual(canc_res.status_code, 200)
        data = canc_res.get_json()
        self.assertEqual(data.get("message"), "Booking cancelled successfully")
        self.assertEqual(data.get("booking")["status"], "cancelled")

    # -------------------------------------------------------------------------
    # 9. Cancellation reason persistence
    # -------------------------------------------------------------------------
    def test_09_cancellation_reason_persistence(self):
        """Verify cancellation reason is stored in the database and returned in responses."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]
        reason = "Medical emergency"

        self.client.post(
            f"/bookings/{booking_id}/cancel",
            headers=self.receptionist_headers,
            json={"cancellation_reason": reason}
        )

        with self.app.app_context():
            b = db.session.get(Booking, booking_id)
            self.assertEqual(b.cancellation_reason, reason)

        # Also retrieved via GET /bookings/<id>
        get_res = self.client.get(f"/bookings/{booking_id}", headers=self.receptionist_headers)
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.get_json()["cancellation_reason"], reason)

    # -------------------------------------------------------------------------
    # 10. Unpaid bill voiding
    # -------------------------------------------------------------------------
    def test_10_unpaid_bill_voided_on_cancellation(self):
        """Verify an issued or draft bill associated with the booking is voided on cancellation."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        # Generate a bill (status: issued)
        bill_res = self.client.post(f"/bookings/{booking_id}/bill", headers=self.receptionist_headers, json={})
        self.assertEqual(bill_res.status_code, 201)
        bill_id = bill_res.get_json()["bill"]["bill_id"]

        # Cancel the booking
        canc_res = self.client.post(f"/bookings/{booking_id}/cancel", headers=self.receptionist_headers)
        self.assertEqual(canc_res.status_code, 200)

        # Bill must now be voided
        with self.app.app_context():
            bill = db.session.get(Bill, bill_id)
            self.assertEqual(bill.status, "voided")

    # -------------------------------------------------------------------------
    # 11. Cancellation rejection after check-in or checkout
    # -------------------------------------------------------------------------
    def test_11_cancellation_rejected_after_checkin_or_checkout(self):
        """Verify cancellation is rejected (400) once guest has checked in or checked out."""
        # 1. Checked-in booking
        res1 = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        b1_id = res1.get_json()["booking"]["booking_id"]
        self.client.post(f"/bookings/{b1_id}/check-in", headers=self.receptionist_headers)

        canc1 = self.client.post(f"/bookings/{b1_id}/cancel", headers=self.receptionist_headers)
        self.assertEqual(canc1.status_code, 400)
        self.assertIn("Cannot cancel", canc1.get_json().get("error", ""))

        # 2. Checkout
        self.client.post(f"/bookings/{b1_id}/checkout", headers=self.receptionist_headers)

        canc2 = self.client.post(f"/bookings/{b1_id}/cancel", headers=self.receptionist_headers)
        self.assertEqual(canc2.status_code, 400)
        self.assertIn("Cannot cancel", canc2.get_json().get("error", ""))

    # -------------------------------------------------------------------------
    # 12. Room availability and booking conflict behavior after cancellation
    # -------------------------------------------------------------------------
    def test_12_room_availability_and_conflict_resolution_after_cancellation(self):
        """Verify cancelling a booking frees dates and clears reservation conflicts."""
        # Create booking for specific dates
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={
                "guest_id": self.guest_id,
                "room_id": self.room_id,
                "check_in_date": "2026-12-01",
                "check_out_date": "2026-12-05",
            }
        )
        self.assertEqual(res.status_code, 201)
        booking_id = res.get_json()["booking"]["booking_id"]

        # Attempting identical dates returns 409 Conflict
        res_conflict = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={
                "guest_id": self.guest_id,
                "room_id": self.room_id,
                "check_in_date": "2026-12-01",
                "check_out_date": "2026-12-05",
            }
        )
        self.assertEqual(res_conflict.status_code, 409)

        # Cancel the first booking
        canc_res = self.client.post(f"/bookings/{booking_id}/cancel", headers=self.receptionist_headers)
        self.assertEqual(canc_res.status_code, 200)

        # Re-attempting the reservation for the same dates now succeeds (201)
        res_retry = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={
                "guest_id": self.guest_id,
                "room_id": self.room_id,
                "check_in_date": "2026-12-01",
                "check_out_date": "2026-12-05",
            }
        )
        self.assertEqual(res_retry.status_code, 201)

    # -------------------------------------------------------------------------
    # 13. Cancellation does not release occupied room when ownership cannot be attributed
    # -------------------------------------------------------------------------
    def test_13_occupied_room_remains_occupied_on_cancellation(self):
        """Verify cancelling a confirmed booking does not release an occupied room."""
        # Create a confirmed future booking
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={
                "guest_id": self.guest_id,
                "room_id": self.room_id,
                "check_in_date": "2026-12-10",
                "check_out_date": "2026-12-15",
            }
        )
        self.assertEqual(res.status_code, 201)
        booking_id = res.get_json()["booking"]["booking_id"]

        # Room is occupied (e.g. by a walk-in, manual staff assignment, or separate workflow)
        with self.app.app_context():
            room = db.session.get(Room, self.room_id)
            room.operational_status = "occupied"
            db.session.commit()

        # Cancel the future booking
        canc_res = self.client.post(f"/bookings/{booking_id}/cancel", headers=self.receptionist_headers)
        self.assertEqual(canc_res.status_code, 200)

        # Room operational_status MUST REMAIN 'occupied' (never automatically released to 'available')
        with self.app.app_context():
            room_check = db.session.get(Room, self.room_id)
            self.assertEqual(room_check.operational_status, "occupied")

    # -------------------------------------------------------------------------
    # 14. Maintenance and out-of-service room states preserved on cancellation
    # -------------------------------------------------------------------------
    def test_14_maintenance_room_state_preserved_on_cancellation(self):
        """Verify cancelling a confirmed booking preserves under_maintenance room state."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={
                "guest_id": self.guest_id,
                "room_id": self.room_id,
                "check_in_date": "2026-12-20",
                "check_out_date": "2026-12-25",
            }
        )
        self.assertEqual(res.status_code, 201)
        booking_id = res.get_json()["booking"]["booking_id"]

        # Room placed under maintenance
        with self.app.app_context():
            room = db.session.get(Room, self.room_id)
            room.operational_status = "under_maintenance"
            db.session.commit()

        # Cancel the booking
        canc_res = self.client.post(f"/bookings/{booking_id}/cancel", headers=self.receptionist_headers)
        self.assertEqual(canc_res.status_code, 200)

        # Room must remain under_maintenance
        with self.app.app_context():
            room_check = db.session.get(Room, self.room_id)
            self.assertEqual(room_check.operational_status, "under_maintenance")

    # -------------------------------------------------------------------------
    # 15. Successful checkout after check-in with timestamp and room verification
    # -------------------------------------------------------------------------
    def test_15_successful_checkout_lifecycle_and_timestamps(self):
        """Verify checkout succeeds from checked_in, preserves actual_check_in, records actual_check_out, and marks room dirty."""
        # 1. Create booking
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        self.assertEqual(res.status_code, 201)
        booking_id = res.get_json()["booking"]["booking_id"]

        # 2. Check in
        checkin_res = self.client.post(f"/bookings/{booking_id}/check-in", headers=self.receptionist_headers)
        self.assertEqual(checkin_res.status_code, 200)
        original_checkin = checkin_res.get_json()["booking"]["actual_check_in"]
        self.assertIsNotNone(original_checkin)

        # 3. Check out
        checkout_res = self.client.post(f"/bookings/{booking_id}/checkout", headers=self.receptionist_headers)
        self.assertEqual(checkout_res.status_code, 200)
        data = checkout_res.get_json()
        self.assertEqual(data.get("message"), "Checkout completed successfully")

        # Verify booking timestamps and state
        b = data.get("booking")
        self.assertEqual(b["status"], "checked_out")
        self.assertEqual(b["actual_check_in"], original_checkin, "actual_check_in must remain exactly as recorded at check-in")
        self.assertIsNotNone(b["actual_check_out"], "actual_check_out must be recorded")

        # Verify room status and cleanliness
        r = data.get("room")
        self.assertEqual(r["cleanliness_status"], "dirty", "Room must be marked dirty after checkout")
        self.assertEqual(r["operational_status"], "available")
        self.assertFalse(r["is_available"], "Dirty room must not be available for sale")

        # Verify bill generated
        bill = data.get("bill")
        self.assertIsNotNone(bill)
        self.assertEqual(bill["booking_id"], booking_id)
        self.assertEqual(bill["status"], "issued")

    # -------------------------------------------------------------------------
    # 16. Checkout rejected for confirmed booking
    # -------------------------------------------------------------------------
    def test_16_checkout_rejected_for_confirmed_booking(self):
        """Verify checkout is rejected for a booking that has not yet checked in."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        # Attempt direct checkout without check-in
        co_res = self.client.post(f"/bookings/{booking_id}/checkout", headers=self.receptionist_headers)
        self.assertEqual(co_res.status_code, 400)
        error_msg = co_res.get_json().get("error", "")
        self.assertIn("must be checked in", error_msg)

        # Room must not be dirtied
        with self.app.app_context():
            room = db.session.get(Room, self.room_id)
            self.assertEqual(room.cleanliness_status, "clean")

    # -------------------------------------------------------------------------
    # 17. Checkout rejected for pending booking
    # -------------------------------------------------------------------------
    def test_17_checkout_rejected_for_pending_booking(self):
        """Verify checkout is rejected for a pending booking."""
        with self.app.app_context():
            b = Booking(
                guest_id=self.guest_id,
                room_id=self.room_id,
                status="pending",
                check_in_date=date.today(),
                check_out_date=date.today() + timedelta(days=1),
            )
            db.session.add(b)
            db.session.commit()
            pending_id = b.booking_id

        co_res = self.client.post(f"/bookings/{pending_id}/checkout", headers=self.receptionist_headers)
        self.assertEqual(co_res.status_code, 400)
        self.assertIn("must be checked in", co_res.get_json().get("error", ""))

    # -------------------------------------------------------------------------
    # 18. Checkout rejected for cancelled booking
    # -------------------------------------------------------------------------
    def test_18_checkout_rejected_for_cancelled_booking(self):
        """Verify checkout is rejected for a cancelled booking."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        # Cancel the booking
        self.client.post(f"/bookings/{booking_id}/cancel", headers=self.receptionist_headers)

        # Attempt checkout
        co_res = self.client.post(f"/bookings/{booking_id}/checkout", headers=self.receptionist_headers)
        self.assertEqual(co_res.status_code, 400)
        self.assertIn("cancelled", co_res.get_json().get("error", ""))

    # -------------------------------------------------------------------------
    # 19. Repeated checkout rejected
    # -------------------------------------------------------------------------
    def test_19_repeated_checkout_rejected(self):
        """Verify repeated checkout on an already checked_out booking returns 400."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        # Check in and check out once
        self.client.post(f"/bookings/{booking_id}/check-in", headers=self.receptionist_headers)
        co1 = self.client.post(f"/bookings/{booking_id}/checkout", headers=self.receptionist_headers)
        self.assertEqual(co1.status_code, 200)

        # Attempt second checkout
        co2 = self.client.post(f"/bookings/{booking_id}/checkout", headers=self.receptionist_headers)
        self.assertEqual(co2.status_code, 400)
        self.assertIn("already checked out", co2.get_json().get("error", ""))

    # -------------------------------------------------------------------------
    # 20. Existing bill is reused without duplication
    # -------------------------------------------------------------------------
    def test_20_existing_bill_is_reused_without_duplication(self):
        """Verify checkout reuses an existing bill and does not generate duplicate bill records."""
        res = self.client.post(
            "/bookings",
            headers=self.receptionist_headers,
            json={"guest_id": self.guest_id, "room_id": self.room_id}
        )
        booking_id = res.get_json()["booking"]["booking_id"]

        # Pre-generate bill with specific tax
        bill_res = self.client.post(
            f"/bookings/{booking_id}/bill",
            headers=self.receptionist_headers,
            json={"tax_amount": "25.00"}
        )
        self.assertEqual(bill_res.status_code, 201)
        existing_bill = bill_res.get_json()["bill"]
        existing_bill_id = existing_bill["bill_id"]
        existing_inv = existing_bill["invoice_number"]

        # Check in then check out
        self.client.post(f"/bookings/{booking_id}/check-in", headers=self.receptionist_headers)
        co_res = self.client.post(f"/bookings/{booking_id}/checkout", headers=self.receptionist_headers)
        self.assertEqual(co_res.status_code, 200)

        # Verify reused bill
        co_bill = co_res.get_json()["bill"]
        self.assertEqual(co_bill["bill_id"], existing_bill_id)
        self.assertEqual(co_bill["invoice_number"], existing_inv)
        self.assertEqual(co_bill["tax_amount"], "25.00")

        # Verify only 1 bill exists in database
        with self.app.app_context():
            bill_count = Bill.query.filter_by(booking_id=booking_id).count()
            self.assertEqual(bill_count, 1)



if __name__ == "__main__":
    unittest.main()
