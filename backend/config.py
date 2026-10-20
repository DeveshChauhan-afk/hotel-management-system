import os
from datetime import timedelta
from dotenv import load_dotenv
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, ".env"))


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY")

    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{os.getenv('DB_USER')}:"
        f"{os.getenv('DB_PASSWORD')}@"
        f"{os.getenv('DB_HOST')}/"
        f"{os.getenv('DB_NAME')}"
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        hours=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_HOURS", 1))
    )


class UnsafeTestDatabaseError(RuntimeError):
    """Raised when the test suite attempts to run without a dedicated, verified test database."""
    pass


DEFAULT_ALLOWED_TEST_HOSTS = {"localhost", "127.0.0.1", "::1"}

SUPPORTED_TEST_DB_SCHEMES = {
    "mysql+pymysql",
    "sqlite",
}

FORBIDDEN_TEST_DB_NAMES = {
    "hotel_db",
    "hotel",
    "hotel_production",
    "hotel_prod",
    "hotel_dev",
    "hotel_development",
    "production",
    "prod",
    "development",
    "dev",
    "main",
    "master",
}


def get_allowed_test_hosts():
    """Returns the set of permitted test database hostnames."""
    allowed = set(DEFAULT_ALLOWED_TEST_HOSTS)
    custom_hosts_raw = os.getenv("HOTEL_TEST_ALLOWED_HOSTS")
    if custom_hosts_raw:
        for host in custom_hosts_raw.split(","):
            cleaned = host.strip().lower().strip("[]")
            if cleaned:
                allowed.add(cleaned)
    return allowed


def validate_test_database_uri(test_uri, dev_uri=None):
    """
    Fail-closed validation to ensure test execution cannot target the
    development, staging, or production database.
    """
    if not test_uri or not isinstance(test_uri, str) or not test_uri.strip():
        raise UnsafeTestDatabaseError(
            "Security violation: Dedicated test database URI (HOTEL_TEST_DATABASE_URL) is required "
            "but not set. The test suite refuses to run without an explicitly supplied test-only database."
        )

    test_uri = test_uri.strip()

    # Resolve development URI:
    # If omitted, None, empty string, or whitespace, resolve safe default from Config
    if dev_uri is None or (isinstance(dev_uri, str) and not dev_uri.strip()):
        dev_uri = getattr(Config, "SQLALCHEMY_DATABASE_URI", None)

    if dev_uri is not None and not isinstance(dev_uri, str):
        raise UnsafeTestDatabaseError(
            "Security violation: Invalid development database URI. "
            "Cannot safely verify database isolation."
        )

    dev_uri_clean = dev_uri.strip() if isinstance(dev_uri, str) else None
    if not dev_uri_clean:
        dev_uri_clean = None

    if dev_uri_clean and test_uri.lower() == dev_uri_clean.lower():
        raise UnsafeTestDatabaseError(
            "Security violation: The supplied test database URI matches the application's "
            "default SQLALCHEMY_DATABASE_URI. Refusing to run tests against the primary application database."
        )

    try:
        parsed_test = make_url(test_uri)
    except (ArgumentError, ValueError):
        raise UnsafeTestDatabaseError(
            "Security violation: Malformed or unparseable test database URI (invalid port or syntax)."
        ) from None
    except Exception:
        raise UnsafeTestDatabaseError(
            "Security violation: Failed to parse test database URI."
        ) from None

    drivername = (parsed_test.drivername or "").strip().lower()
    if not drivername:
        raise UnsafeTestDatabaseError(
            "Security violation: Malformed test database URI. Scheme is missing."
        )

    if drivername not in SUPPORTED_TEST_DB_SCHEMES:
        supported_str = ", ".join(sorted(SUPPORTED_TEST_DB_SCHEMES))
        raise UnsafeTestDatabaseError(
            f"Security violation: Unsupported database scheme '{drivername}'. "
            f"Supported schemes are: {supported_str}."
        )

    try:
        test_port = parsed_test.port
    except (ValueError, TypeError, Exception):
        raise UnsafeTestDatabaseError(
            "Security violation: Malformed or unparseable database port."
        ) from None

    if test_port is not None:
        if not isinstance(test_port, int) or not (1 <= test_port <= 65535):
            raise UnsafeTestDatabaseError(
                f"Security violation: Invalid database port '{test_port}'. "
                "Port must be between 1 and 65535."
            )

    is_sqlite = (drivername == "sqlite")
    db_name = (parsed_test.database or "").strip()

    # Handle SQLite: strictly permit only genuinely in-memory, hostless databases
    if is_sqlite:
        if parsed_test.host or test_port is not None:
            raise UnsafeTestDatabaseError(
                "Security violation: SQLite test databases must be hostless and in-memory."
            )
        is_memory = (db_name in ("", ":memory:"))
        if not is_memory:
            raise UnsafeTestDatabaseError(
                f"Security violation: File-backed SQLite test databases are not permitted (target: '{db_name}'). "
                "Only in-memory SQLite ('sqlite:///:memory:') is allowed for testing."
            )
    else:
        # Network database schemes (e.g. mysql+pymysql)
        if not parsed_test.host:
            raise UnsafeTestDatabaseError(
                "Security violation: Network database URI must explicitly specify a hostname."
            )

        raw_host = parsed_test.host.strip()
        normalized_host = raw_host.lower().strip("[]")

        allowed_hosts = get_allowed_test_hosts()
        if normalized_host not in allowed_hosts:
            raise UnsafeTestDatabaseError(
                f"Security violation: Test database host '{raw_host}' is not in the trusted test host allowlist "
                f"({sorted(list(allowed_hosts))}). Remote or non-loopback hosts are strictly forbidden unless "
                "explicitly permitted via HOTEL_TEST_ALLOWED_HOSTS."
            )

        # Reject if no database name is specified for network schemes
        if not db_name:
            raise UnsafeTestDatabaseError(
                "Security violation: Test database URI must explicitly specify a target database name."
            )

    # Check against primary configured DB_NAME from environment
    app_db_name = (os.getenv("DB_NAME") or "hotel_db").strip().lower()
    if db_name and db_name.lower() == app_db_name:
        raise UnsafeTestDatabaseError(
            f"Security violation: Test database targets '{db_name}', which matches the "
            f"application's configured database name ('{app_db_name}'). "
            "Tests must target an isolated test-only database."
        )

    # Check against known operational/production/development names
    if db_name and db_name.lower() in FORBIDDEN_TEST_DB_NAMES:
        raise UnsafeTestDatabaseError(
            f"Security violation: Test database targets forbidden operational name '{db_name}'. "
            "Tests must target an explicitly segregated test database."
        )

    # Must contain an explicit test indicator (e.g. 'test' in db name or in-memory SQLite)
    is_sqlite_memory = is_sqlite and (db_name in ("", ":memory:"))
    has_test_indicator = ("test" in db_name.lower()) or is_sqlite_memory
    if not has_test_indicator:
        raise UnsafeTestDatabaseError(
            f"Security violation: Target database '{db_name}' does not contain an explicit "
            "'test' indicator. Test databases must clearly indicate testing use (e.g., 'hotel_test_db')."
        )

    # Safe isolation requirement:
    # If the test database is a network database (non-SQLite-memory), development URI
    # is strictly required to establish safe isolation. If unavailable, fail closed.
    if not is_sqlite_memory and not dev_uri_clean:
        raise UnsafeTestDatabaseError(
            "Security violation: Development database URI (SQLALCHEMY_DATABASE_URI) is required "
            "to verify database isolation, but is unavailable. Refusing to run tests against an unverified target."
        )

    # Host/port/database component comparison against primary database
    if dev_uri_clean:
        try:
            parsed_dev = make_url(dev_uri_clean)
        except (ArgumentError, ValueError):
            raise UnsafeTestDatabaseError(
                "Security violation: Malformed or unparseable development database URI (invalid port or syntax). "
                "Cannot safely verify database isolation."
            ) from None
        except Exception:
            raise UnsafeTestDatabaseError(
                "Security violation: Failed to parse development database URI. "
                "Cannot safely verify database isolation."
            ) from None

        try:
            dev_port = parsed_dev.port
        except (ValueError, TypeError, Exception):
            raise UnsafeTestDatabaseError(
                "Security violation: Malformed development database port. "
                "Cannot safely verify database isolation."
            ) from None

        if dev_port is not None and not (1 <= dev_port <= 65535):
            raise UnsafeTestDatabaseError(
                f"Security violation: Invalid development database port '{dev_port}'. "
                "Cannot safely verify database isolation."
            )

        dev_db = (parsed_dev.database or "").strip().lower()
        dev_host = (parsed_dev.host or "").strip().lower().strip("[]")
        test_host = (parsed_test.host or "").strip().lower().strip("[]")

        # Network development databases must have a valid host and database name
        if (parsed_dev.drivername or "").startswith("mysql") and not is_sqlite_memory:
            if not dev_host or dev_host == "none" or not dev_db or dev_db == "none":
                raise UnsafeTestDatabaseError(
                    "Security violation: Development database URI is not properly configured. "
                    "Cannot safely verify database isolation."
                )

        same_host = bool(
            test_host
            and dev_host
            and (
                test_host == dev_host
                or (
                    test_host in DEFAULT_ALLOWED_TEST_HOSTS
                    and dev_host in DEFAULT_ALLOWED_TEST_HOSTS
                )
            )
        )

        dev_port_effective = dev_port or (3306 if (parsed_dev.drivername or "").startswith("mysql") else None)
        test_port_effective = test_port or (3306 if (drivername or "").startswith("mysql") else None)
        same_port = (test_port_effective == dev_port_effective)

        same_db = bool(db_name and dev_db and db_name.lower() == dev_db)
        if same_host and same_port and same_db:
            raise UnsafeTestDatabaseError(
                "Security violation: Test database URI targets the identical host, port, and database "
                "as the application's development/production database."
            )

    return test_uri


def get_test_database_uri():
    """Retrieves and validates HOTEL_TEST_DATABASE_URL from the environment."""
    test_uri = os.getenv("HOTEL_TEST_DATABASE_URL")
    return validate_test_database_uri(test_uri)


class TestingConfigMeta(type):
    @property
    def SQLALCHEMY_DATABASE_URI(cls):
        return get_test_database_uri()


class TestingConfig(Config, metaclass=TestingConfigMeta):
    TESTING = True
    WTF_CSRF_ENABLED = False
    LOGIN_RATE_LIMIT = "1000 per minute"

    def __init__(self):
        super().__init__()
        self.SQLALCHEMY_DATABASE_URI = get_test_database_uri()
