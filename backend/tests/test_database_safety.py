import os
import sys
import unittest
from unittest.mock import patch

# Ensure backend directory is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from config import (
    validate_test_database_uri,
    get_test_database_uri,
    UnsafeTestDatabaseError,
    Config,
)


class TestDatabaseURIBasics(unittest.TestCase):
    """Test missing, blank, or invalid test database URIs."""

    def test_missing_or_none_test_uri_raises_error(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(None)

    def test_empty_string_test_uri_raises_error(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("")

    def test_whitespace_test_uri_raises_error(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("   \t\n  ")

    def test_non_string_test_uri_raises_error(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(12345)
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(False)

    def test_get_test_database_uri_with_valid_env_variable(self):
        with patch.dict(os.environ, {"HOTEL_TEST_DATABASE_URL": "sqlite:///:memory:"}):
            self.assertEqual(get_test_database_uri(), "sqlite:///:memory:")

    def test_get_test_database_uri_with_missing_or_blank_env_variable(self):
        with patch.dict(os.environ):
            os.environ.pop("HOTEL_TEST_DATABASE_URL", None)
            with self.assertRaises(UnsafeTestDatabaseError):
                get_test_database_uri()
        with patch.dict(os.environ, {"HOTEL_TEST_DATABASE_URL": ""}):
            with self.assertRaises(UnsafeTestDatabaseError):
                get_test_database_uri()
        with patch.dict(os.environ, {"HOTEL_TEST_DATABASE_URL": "   "}):
            with self.assertRaises(UnsafeTestDatabaseError):
                get_test_database_uri()


class TestSupportedSchemes(unittest.TestCase):
    """Test rejection of unsupported schemes and drivers."""

    def test_postgresql_schemes_rejected(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("postgresql://localhost:5432/hotel_test_db")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("postgresql+psycopg2://localhost:5432/hotel_test_db")

    def test_unsupported_mysql_drivers_rejected(self):
        # Raw mysql (missing driver) and mysql+mysqldb are not in SUPPORTED_TEST_DB_SCHEMES
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("mysql://root:0000@localhost:3306/hotel_test_db")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("mysql+mysqldb://root:0000@localhost:3306/hotel_test_db")

    def test_other_unsupported_schemes_rejected(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("oracle://localhost:1521/hotel_test_db")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("mssql+pyodbc://localhost/hotel_test_db")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("http://localhost:8080/hotel_test_db")

    def test_supported_schemes_accepted(self):
        # sqlite in-memory
        res_sqlite = validate_test_database_uri("sqlite:///:memory:")
        self.assertEqual(res_sqlite, "sqlite:///:memory:")

        # mysql+pymysql with distinct test db
        dev = "mysql+pymysql://root:0000@localhost/hotel_db"
        res_mysql = validate_test_database_uri(
            "mysql+pymysql://root:0000@localhost:3306/hotel_test_db",
            dev_uri=dev,
        )
        self.assertEqual(res_mysql, "mysql+pymysql://root:0000@localhost:3306/hotel_test_db")


class TestSQLiteStrictIsolation(unittest.TestCase):
    """Test strict SQLite in-memory and hostless requirements."""

    def test_in_memory_sqlite_accepted(self):
        self.assertEqual(validate_test_database_uri("sqlite:///:memory:"), "sqlite:///:memory:")
        self.assertEqual(validate_test_database_uri("sqlite:///"), "sqlite:///")

    def test_file_backed_sqlite_rejected(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("sqlite:///test.db")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("sqlite:////tmp/test.db")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("sqlite:///hotel_test.db")

    def test_sqlite_mode_memory_on_file_path_rejected(self):
        # A file path with query parameter mode=memory is still file-backed
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("sqlite:///test.db?mode=memory")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("sqlite:///file:memdb1?mode=memory&cache=shared")

    def test_sqlite_with_host_or_port_rejected(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("sqlite://localhost/:memory:")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("sqlite://:3306/:memory:")
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri("sqlite://127.0.0.1:3306/:memory:")


class TestForbiddenAndOperationalDBNames(unittest.TestCase):
    """Test rejection of operational, production, and primary database names."""

    def setUp(self):
        self.dev_uri = "mysql+pymysql://root:0000@localhost/hotel_db"

    def test_forbidden_operational_names_rejected(self):
        forbidden = [
            "hotel_db", "hotel_production", "hotel_prod",
            "hotel_dev", "production", "development", "main", "master",
        ]
        for name in forbidden:
            with self.subTest(name=name):
                with self.assertRaises(UnsafeTestDatabaseError):
                    validate_test_database_uri(
                        f"mysql+pymysql://root:0000@localhost:3306/{name}",
                        dev_uri=self.dev_uri,
                    )

    def test_configured_db_name_match_rejected(self):
        with patch.dict(os.environ, {"DB_NAME": "custom_hotel_prod"}):
            with self.assertRaises(UnsafeTestDatabaseError):
                validate_test_database_uri(
                    "mysql+pymysql://root:0000@localhost:3306/custom_hotel_prod",
                    dev_uri=self.dev_uri,
                )

    def test_database_name_without_test_indicator_rejected(self):
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(
                "mysql+pymysql://root:0000@localhost:3306/my_custom_isolated_db",
                dev_uri=self.dev_uri,
            )


class TestDatabaseCollisionDetection(unittest.TestCase):
    """Test host, port, and database collision detection."""

    def test_exact_uri_match_rejected(self):
        uri = "mysql+pymysql://root:0000@localhost:3306/hotel_test_db"
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(uri, dev_uri=uri)

    def test_differing_credentials_collision_rejected(self):
        test_uri = "mysql+pymysql://test_user:test_secret@localhost:3306/hotel_test_db"
        dev_uri = "mysql+pymysql://prod_user:prod_secret@localhost:3306/hotel_test_db"
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(test_uri, dev_uri=dev_uri)

    def test_implicit_vs_explicit_mysql_port_collision_rejected(self):
        # Test has implicit 3306, dev has explicit 3306
        test_uri = "mysql+pymysql://user:pass@localhost/hotel_test_db"
        dev_uri = "mysql+pymysql://user:pass@localhost:3306/hotel_test_db"
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(test_uri, dev_uri=dev_uri)

        # Test has explicit 3306, dev has implicit 3306
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(dev_uri, dev_uri=test_uri)

        # Both implicit 3306
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(test_uri, dev_uri=test_uri)

    def test_distinct_port_allowed(self):
        test_uri = "mysql+pymysql://user:pass@localhost:3307/hotel_test_db"
        dev_uri = "mysql+pymysql://user:pass@localhost:3306/hotel_test_db"
        res = validate_test_database_uri(test_uri, dev_uri=dev_uri)
        self.assertEqual(res, test_uri)

    def test_distinct_database_name_allowed(self):
        test_uri = "mysql+pymysql://user:pass@localhost:3306/hotel_test_db"
        dev_uri = "mysql+pymysql://user:pass@localhost:3306/hotel_dev_db"
        res = validate_test_database_uri(test_uri, dev_uri=dev_uri)
        self.assertEqual(res, test_uri)


class TestLoopbackEquivalence(unittest.TestCase):
    """Test loopback alias collision detection and remote host restriction."""

    def test_loopback_aliases_collide(self):
        aliases = [
            ("localhost", "127.0.0.1"),
            ("127.0.0.1", "localhost"),
            ("127.0.0.1", "::1"),
            ("::1", "127.0.0.1"),
            ("localhost", "[::1]"),
        ]
        for t_host, d_host in aliases:
            with self.subTest(test_host=t_host, dev_host=d_host):
                with self.assertRaises(UnsafeTestDatabaseError):
                    validate_test_database_uri(
                        f"mysql+pymysql://user:pass@{t_host}:3306/hotel_test_db",
                        dev_uri=f"mysql+pymysql://user:pass@{d_host}:3306/hotel_test_db",
                    )

    def test_remote_host_not_in_allowlist_rejected(self):
        with patch.dict(os.environ, {"HOTEL_TEST_ALLOWED_HOSTS": ""}):
            with self.assertRaises(UnsafeTestDatabaseError):
                validate_test_database_uri("mysql+pymysql://user:pass@remote-db.production:3306/hotel_test_db")

    def test_remote_host_in_allowlist_accepted(self):
        dev = "mysql+pymysql://user:pass@localhost:3306/hotel_db"
        test_uri = "mysql+pymysql://user:pass@allowed-remote-host:3306/hotel_test_db"
        with patch.dict(os.environ, {"HOTEL_TEST_ALLOWED_HOSTS": "allowed-remote-host,other-host"}):
            res = validate_test_database_uri(test_uri, dev_uri=dev)
            self.assertEqual(res, test_uri)


class TestDevelopmentURIFallbackAndIsolation(unittest.TestCase):
    """Test resolution of development URI and fail-closed isolation."""

    def test_fallback_to_config_on_empty_or_whitespace(self):
        original_config_uri = Config.SQLALCHEMY_DATABASE_URI
        try:
            Config.SQLALCHEMY_DATABASE_URI = "mysql+pymysql://root:0000@localhost/hotel_db"
            valid_test = "mysql+pymysql://root:0000@localhost:3306/hotel_test_db"

            # Omitted, empty, whitespace dev_uri all resolve to Config and validate cleanly
            self.assertEqual(validate_test_database_uri(valid_test), valid_test)
            self.assertEqual(validate_test_database_uri(valid_test, dev_uri=""), valid_test)
            self.assertEqual(validate_test_database_uri(valid_test, dev_uri="   "), valid_test)
        finally:
            Config.SQLALCHEMY_DATABASE_URI = original_config_uri

    def test_empty_dev_uri_cannot_bypass_collision(self):
        original_config_uri = Config.SQLALCHEMY_DATABASE_URI
        try:
            # Operational database configured in Config
            Config.SQLALCHEMY_DATABASE_URI = "mysql+pymysql://root:0000@localhost/hotel_db"
            colliding_test = "mysql+pymysql://root:0000@localhost:3306/hotel_db"

            # Passing empty or whitespace dev_uri falls back to Config and still rejects collision
            with self.assertRaises(UnsafeTestDatabaseError):
                validate_test_database_uri(colliding_test, dev_uri="")
            with self.assertRaises(UnsafeTestDatabaseError):
                validate_test_database_uri(colliding_test, dev_uri="   ")

            # Same host/port with a db named 'test' matching Config.SQLALCHEMY_DATABASE_URI
            Config.SQLALCHEMY_DATABASE_URI = "mysql+pymysql://root:0000@localhost:3306/hotel_test_db"
            with self.assertRaises(UnsafeTestDatabaseError):
                validate_test_database_uri("mysql+pymysql://root:0000@localhost:3306/hotel_test_db", dev_uri="")
        finally:
            Config.SQLALCHEMY_DATABASE_URI = original_config_uri

    def test_network_db_fails_closed_when_dev_uri_unavailable(self):
        original_config_uri = Config.SQLALCHEMY_DATABASE_URI
        try:
            Config.SQLALCHEMY_DATABASE_URI = None
            valid_test = "mysql+pymysql://root:0000@localhost:3306/hotel_test_db"

            # When dev_uri is unavailable, network tests must fail closed
            with self.assertRaises(UnsafeTestDatabaseError):
                validate_test_database_uri(valid_test, dev_uri=None)
            with self.assertRaises(UnsafeTestDatabaseError):
                validate_test_database_uri(valid_test, dev_uri="")
            with self.assertRaises(UnsafeTestDatabaseError):
                validate_test_database_uri(valid_test, dev_uri="   ")
        finally:
            Config.SQLALCHEMY_DATABASE_URI = original_config_uri

    def test_unconfigured_dev_uri_string_fails_closed(self):
        valid_test = "mysql+pymysql://root:0000@localhost:3306/hotel_test_db"
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(valid_test, dev_uri="mysql+pymysql://None:None@None/None")

    def test_non_string_dev_uri_fails_closed(self):
        valid_test = "mysql+pymysql://root:0000@localhost:3306/hotel_test_db"
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(valid_test, dev_uri=False)
        with self.assertRaises(UnsafeTestDatabaseError):
            validate_test_database_uri(valid_test, dev_uri=123)

    def test_sqlite_in_memory_allowed_when_dev_uri_unavailable(self):
        original_config_uri = Config.SQLALCHEMY_DATABASE_URI
        try:
            Config.SQLALCHEMY_DATABASE_URI = None
            # In-memory SQLite is hostless and isolated in memory; does not require network dev_uri
            res = validate_test_database_uri("sqlite:///:memory:", dev_uri=None)
            self.assertEqual(res, "sqlite:///:memory:")
        finally:
            Config.SQLALCHEMY_DATABASE_URI = original_config_uri


class TestCredentialMaskingInErrors(unittest.TestCase):
    """Test that error messages never leak credentials or full URLs."""

    def test_credentials_and_urls_not_exposed_in_rejection_messages(self):
        secret_user = "sensitive_db_user_123"
        secret_pass = "SuperSecret_P@ssw0rd_987!"
        test_cases = [
            # Matching operational name
            f"mysql+pymysql://{secret_user}:{secret_pass}@localhost:3306/hotel_db",
            # Invalid port
            f"mysql+pymysql://{secret_user}:{secret_pass}@localhost:99999/hotel_test_db",
            # Remote unallowed host
            f"mysql+pymysql://{secret_user}:{secret_pass}@untrusted.remote.host:3306/hotel_test_db",
            # Unsupported scheme
            f"postgresql://{secret_user}:{secret_pass}@localhost:5432/hotel_test_db",
        ]
        for uri in test_cases:
            with self.subTest(uri=uri):
                try:
                    validate_test_database_uri(uri)
                    self.fail("Expected UnsafeTestDatabaseError was not raised")
                except UnsafeTestDatabaseError as e:
                    msg = str(e)
                    self.assertNotIn(secret_user, msg, "Username leaked in error message")
                    self.assertNotIn(secret_pass, msg, "Password leaked in error message")
                    self.assertNotIn("mysql+pymysql://", msg, "Full connection URL leaked")
                    self.assertNotIn("postgresql://", msg, "Full connection URL leaked")

    def test_dev_credentials_not_exposed_in_collision_error(self):
        dev_secret_user = "dev_secret_user_xyz"
        dev_secret_pass = "Dev_Secret_Password_555"
        test_uri = "mysql+pymysql://test_user:test_pass@localhost:3306/hotel_test_db"
        dev_uri = f"mysql+pymysql://{dev_secret_user}:{dev_secret_pass}@localhost:3306/hotel_test_db"

        try:
            validate_test_database_uri(test_uri, dev_uri=dev_uri)
            self.fail("Expected collision UnsafeTestDatabaseError was not raised")
        except UnsafeTestDatabaseError as e:
            msg = str(e)
            self.assertNotIn(dev_secret_user, msg, "Dev username leaked in error message")
            self.assertNotIn(dev_secret_pass, msg, "Dev password leaked in error message")


class TestStartupGuardIsolation(unittest.TestCase):
    """Test the application startup guard in create_app without initializing a real database."""

    def test_startup_guard_rejects_unsafe_database_before_db_init(self):
        from app import create_app

        class UnsafeConfig:
            TESTING = True
            SQLALCHEMY_DATABASE_URI = "mysql+pymysql://root:0000@localhost:3306/hotel_db"

        # create_app should fail at the startup guard (line 18) before db.init_app is reached
        with patch("app.extensions.db.init_app") as mock_db_init:
            with self.assertRaises(UnsafeTestDatabaseError):
                create_app(UnsafeConfig)
            mock_db_init.assert_not_called()

    def test_startup_guard_permits_safe_database_without_db_connection(self):
        from app import create_app

        class SafeConfig:
            TESTING = True
            SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"

        # Mock db.init_app and migrate.init_app so no database connection/engine is created
        with patch("app.extensions.db.init_app") as mock_db_init, \
             patch("app.extensions.migrate.init_app"):
            app = create_app(SafeConfig)
            self.assertIsNotNone(app)
            self.assertTrue(app.config.get("TESTING"))
            mock_db_init.assert_called_once_with(app)


if __name__ == "__main__":
    unittest.main()
