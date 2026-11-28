"""In-memory test double only; never selected by production handlers."""
import json
import threading
import uuid
from backend.api import Conflict, RateLimited


class MemoryRepository:
    def __init__(self):
        self.lock = threading.RLock()
        self.leads, self.requests, self.limits, self.outbox = {}, {}, {}, {}
        self.fail = False
        self.lose_ack_once = False

    def submit(self, key, fingerprint, payload, ip_hash, now, days):
        with self.lock:
            if self.fail: raise RuntimeError('SYNTHETIC_SECRET_AND_PRIVATE_PAYLOAD')
            old = self.requests.get(key)
            if old:
                if old['fingerprint'] != fingerprint or old['expires'] <= now: raise Conflict()
                return old['id'], True
            buckets = [(f'ip:{ip_hash}:{now//600}', 5), (f'global:{now//60}', 100)]
            if any(self.limits.get(k, 0) >= limit for k, limit in buckets): raise RateLimited()
            lead_id = str(uuid.uuid4())
            self.leads[lead_id] = {'payload': json.loads(payload), 'created': now, 'expires': now+days*86400}
            self.requests[key] = {'fingerprint': fingerprint, 'id': lead_id, 'expires': now+days*86400}
            self.outbox[lead_id] = {'status':'pending','attempts':0,'due':now,'lease':0,'token':'','expires':now+days*86400}
            for k, _ in buckets: self.limits[k] = self.limits.get(k,0)+1
            if self.lose_ack_once:
                self.lose_ack_once = False
                raise TimeoutError()
            return lead_id, False

    def due(self, now):
        with self.lock: return [k for k,v in self.outbox.items() if v['status']=='pending' and v['due']<=now and v['expires']>now][:5]

    def claim(self, lead_id, now):
        with self.lock:
            v = self.outbox[lead_id]
            if v['status']!='pending' or v['lease']>now or v['expires']<=now: return None
            v.update(lease=now+90,token=str(uuid.uuid4()))
            return {'id':lead_id,'token':v['token'],'attempts':v['attempts']}

    def finish(self, job, now, success):
        with self.lock:
            v=self.outbox[job['id']]
            if v['token']!=job['token']: return
            attempts=job['attempts']+1
            v.update(status='sent' if success else 'pending', attempts=attempts, due=now+min(3600,30*2**min(attempts,7)), lease=0,token='')
