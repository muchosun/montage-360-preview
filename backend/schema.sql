-- Apply once to a new private YDB Serverless database in ru-central1.
CREATE TABLE leads (
    id Utf8 NOT NULL, payload Utf8, created_at Uint64, expires_at Uint64,
    PRIMARY KEY (id)
) WITH (TTL = Interval("PT0S") ON expires_at AS SECONDS);
CREATE TABLE lead_requests (
    request_key Utf8 NOT NULL, fingerprint Utf8, lead_id Utf8, expires_at Uint64,
    PRIMARY KEY (request_key)
) WITH (TTL = Interval("PT0S") ON expires_at AS SECONDS);
CREATE TABLE lead_limits (
    bucket Utf8 NOT NULL, hits Uint64, expires_at Uint64,
    PRIMARY KEY (bucket)
) WITH (TTL = Interval("PT0S") ON expires_at AS SECONDS);
CREATE TABLE lead_outbox (
    id Utf8 NOT NULL, status Utf8, attempts Uint64, due_at Uint64,
    lease_until Uint64, lease_token Utf8, expires_at Uint64,
    INDEX due_index GLOBAL ON (status,due_at), PRIMARY KEY (id)
) WITH (TTL = Interval("PT0S") ON expires_at AS SECONDS);
