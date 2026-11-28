"""Private YDB storage. Four-table atomic insert includes a notification outbox."""
import json
import logging
import os
import uuid
try: from .api import Conflict, RateLimited
except ImportError: from api import Conflict, RateLimited


class YdbRepository:
    def __init__(self):
        import ydb
        self.ydb = ydb
        logging.getLogger('ydb').setLevel(logging.CRITICAL)
        database = os.environ['YDB_DATABASE']
        if not database.startswith('/ru-central1/'): raise RuntimeError('unsupported_region')
        endpoint = os.environ['YDB_ENDPOINT']
        if endpoint != 'grpcs://ydb.serverless.yandexcloud.net:2135': raise RuntimeError('unsupported_endpoint')
        self.driver = ydb.Driver(ydb.DriverConfig(endpoint=endpoint, database=database, credentials=ydb.iam.MetadataUrlCredentials()))
        self.driver.wait(timeout=5)
        self.pool = ydb.QuerySessionPool(self.driver)

    def _params(self, **values):
        return {'$' + key: (value, self.ydb.PrimitiveType.Utf8 if isinstance(value, str) else self.ydb.PrimitiveType.Uint64) for key, value in values.items()}

    def _execute(self, tx, sql, **params):
        # Drain the iterator completely: Query API commits writes only when consumed.
        return list(tx.execute(sql, self._params(**params)))

    def submit(self, key, fingerprint, payload, ip_hash, now, days):
        lead_id = str(uuid.uuid4())
        expires = now + days * 86400
        rate_keys = [(f'ip:{ip_hash}:{now // 600}', 5), (f'global:{now // 60}', 100)]
        def operation(session):
            tx = session.transaction(self.ydb.QuerySerializableReadWrite()).begin()
            try:
                prior = self._execute(tx, 'DECLARE $key AS Utf8; SELECT fingerprint, lead_id, expires_at FROM lead_requests WHERE request_key=$key;', key=key)[0].rows
                if prior:
                    if prior[0].fingerprint != fingerprint or prior[0].expires_at <= now: raise Conflict()
                    tx.commit()
                    return prior[0].lead_id, True
                counts = []
                for bucket, limit in rate_keys:
                    rows = self._execute(tx, 'DECLARE $key AS Utf8; SELECT hits FROM lead_limits WHERE bucket=$key;', key=bucket)[0].rows
                    hits = rows[0].hits if rows else 0
                    if hits >= limit: raise RateLimited()
                    counts.append((bucket, hits + 1))
                self._execute(tx, '''DECLARE $key AS Utf8; DECLARE $fingerprint AS Utf8; DECLARE $id AS Utf8; DECLARE $payload AS Utf8; DECLARE $now AS Uint64; DECLARE $expires AS Uint64;
                    INSERT INTO leads (id,payload,created_at,expires_at) VALUES ($id,$payload,$now,$expires);
                    INSERT INTO lead_requests (request_key,fingerprint,lead_id,expires_at) VALUES ($key,$fingerprint,$id,$expires);
                    INSERT INTO lead_outbox (id,status,attempts,due_at,lease_until,lease_token,expires_at) VALUES ($id,"pending",0,$now,0,"",$expires);''', key=key, fingerprint=fingerprint, id=lead_id, payload=payload, now=now, expires=expires)
                for bucket, hits in counts:
                    self._execute(tx, 'DECLARE $key AS Utf8; DECLARE $hits AS Uint64; DECLARE $expires AS Uint64; UPSERT INTO lead_limits (bucket,hits,expires_at) VALUES ($key,$hits,$expires);', key=bucket, hits=hits, expires=now+1800)
                tx.commit()
                return lead_id, False
            except Exception:
                tx.rollback()
                raise
        return self.pool.retry_operation_sync(operation)

    def due(self, now):
        result = self.pool.execute_with_retries('DECLARE $now AS Uint64; SELECT id FROM lead_outbox VIEW due_index WHERE status="pending" AND due_at<=$now AND expires_at>$now ORDER BY due_at LIMIT 5;', self._params(now=now))
        return [row.id for row in result[0].rows]

    def claim(self, lead_id, now):
        token = str(uuid.uuid4())
        def operation(session):
            tx = session.transaction(self.ydb.QuerySerializableReadWrite()).begin()
            try:
                rows = self._execute(tx, 'DECLARE $id AS Utf8; SELECT status,attempts,lease_until,expires_at FROM lead_outbox WHERE id=$id;', id=lead_id)[0].rows
                if not rows or rows[0].status != 'pending' or rows[0].lease_until > now or rows[0].expires_at <= now:
                    tx.commit(); return None
                self._execute(tx, 'DECLARE $id AS Utf8; DECLARE $token AS Utf8; DECLARE $until AS Uint64; UPDATE lead_outbox SET lease_until=$until,lease_token=$token WHERE id=$id;', id=lead_id, token=token, until=now+90)
                tx.commit(); return {'id': lead_id, 'attempts': rows[0].attempts, 'token': token}
            except Exception:
                tx.rollback(); raise
        return self.pool.retry_operation_sync(operation)

    def finish(self, job, now, success):
        attempt = job['attempts'] + 1
        delay = min(3600, 30 * 2 ** min(attempt, 7))
        status = 'sent' if success else 'pending'
        self.pool.execute_with_retries('''DECLARE $id AS Utf8; DECLARE $token AS Utf8; DECLARE $attempt AS Uint64; DECLARE $due AS Uint64; DECLARE $status AS Utf8;
            UPDATE lead_outbox SET status=$status,attempts=$attempt,due_at=$due,lease_until=0,lease_token="" WHERE id=$id AND lease_token=$token;''', self._params(id=job['id'], token=job['token'], attempt=attempt, due=now+delay, status=status))
