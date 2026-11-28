import contextlib
import io
import json
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from backend.api import handle, handler
from backend.worker import deliver
from tests.lead_memory import MemoryRepository


def payload():
    return {'venue':'Тестовая площадка QA, не клиент','city':'Тестовый город','activity':'karting','cameras':'yes','contact_type':'email','contact':'synthetic@example.test','flow':120,'comment':'СИНТЕТИЧЕСКИЙ ТЕСТ, НЕ ЗАЯВКА КЛИЕНТА','consent':True,'consent_version':'qa-v1','attribution':{'utm_source':'qa','utm_campaign':'synthetic'}}


def event(data=None, key=None, ip='192.0.2.1', origin='https://montazh360.ru'):
    return {'httpMethod':'POST','headers':{'Origin':origin,'Content-Type':'application/json','Idempotency-Key':key or str(uuid.uuid4())},'body':json.dumps(payload() if data is None else data),'requestContext':{'identity':{'sourceIp':ip}}}


class LeadTests(unittest.TestCase):
    def setUp(self): self.repo=MemoryRepository()
    def call(self,e,now=1000): return handle(e,self.repo,pepper='q'*32,consent_version='qa-v1',retention_days=30,now=now)

    def test_save_and_atomic_outbox(self):
        r=self.call(event());self.assertEqual(r['statusCode'],201);data=json.loads(r['body']);self.assertTrue(data['ok']);self.assertIn(data['id'],self.repo.leads);self.assertIn(data['id'],self.repo.outbox)
        self.assertEqual(self.repo.leads[data['id']]['payload']['attribution']['utm_source'],'qa')
        self.assertNotIn('example.test',r['body']);self.assertNotIn('Тестовая',r['body'])

    def test_parallel_retries_create_one_record(self):
        e=event()
        with ThreadPoolExecutor(max_workers=12) as pool:results=list(pool.map(lambda _:self.call(e),range(40)))
        self.assertEqual(len({json.loads(r['body'])['id'] for r in results}),1);self.assertEqual(len(self.repo.leads),1);self.assertEqual(len(self.repo.outbox),1)

    def test_same_key_different_payload_is_conflict(self):
        e=event();self.call(e);changed=payload();changed['city']='Другой тестовый город';e['body']=json.dumps(changed);self.assertEqual(self.call(e)['statusCode'],409);self.assertEqual(len(self.repo.leads),1)

    def test_lost_ack_is_recovered_without_duplicate(self):
        e=event();self.repo.lose_ack_once=True;self.assertEqual(self.call(e)['statusCode'],503);r=self.call(e);self.assertEqual(r['statusCode'],200);self.assertTrue(json.loads(r['body'])['duplicate']);self.assertEqual(len(self.repo.leads),1)

    def test_storage_failure_never_reports_success_or_logs_payload(self):
        self.repo.fail=True;output=io.StringIO()
        with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output):r=self.call(event())
        self.assertEqual(r['statusCode'],503);self.assertEqual(output.getvalue(),'');self.assertNotIn('SECRET',r['body']);self.assertEqual(len(self.repo.leads),0)

    def test_invalid_fields_and_no_marketing_consent(self):
        cases=[('venue',''),('city',''),('activity','unknown'),('cameras',None),('contact','bad email'),('consent',False),('consent_version','old'),('flow',-1),('flow',True),('comment','x'*1501),('attribution',{'phone':'must-not-store'})]
        for key,value in cases:
            with self.subTest(key=key,value_type=type(value).__name__):
                d=payload();d[key]=value;self.assertEqual(self.call(event(d))['statusCode'],422)
        self.assertFalse(self.repo.leads)

    def test_origin_size_method_content_type_and_untrusted_ip(self):
        self.assertEqual(self.call(event(origin='https://preview.example.test'))['statusCode'],403)
        e=event();e['body']='x'*40000;self.assertEqual(self.call(e)['statusCode'],413)
        e=event();e['httpMethod']='GET';self.assertEqual(self.call(e)['statusCode'],405)
        e=event();e['headers']['Content-Type']='text/plain';self.assertEqual(self.call(e)['statusCode'],415)
        e=event();e['headers']['X-Forwarded-For']='192.0.2.5';e['requestContext']={};self.assertEqual(self.call(e)['statusCode'],400)
        e=event();e['headers']['Idempotency-Key']='not-a-key';self.assertEqual(self.call(e)['statusCode'],400)
        e=event();e['body']='{';self.assertEqual(self.call(e)['statusCode'],400)

    def test_preflight(self):
        e=event();e['httpMethod']='OPTIONS';r=self.call(e);self.assertEqual(r['statusCode'],204);self.assertEqual(r['headers']['Access-Control-Allow-Origin'],'https://montazh360.ru')

    def test_per_ip_limit_and_retry_after(self):
        for _ in range(5):self.assertEqual(self.call(event())['statusCode'],201)
        r=self.call(event());self.assertEqual(r['statusCode'],429);self.assertEqual(r['headers']['Retry-After'],'600');self.assertEqual(len(self.repo.leads),5)
        self.assertEqual(self.call(event(),now=1600)['statusCode'],201)

    def test_global_limit(self):
        for i in range(100):self.assertEqual(self.call(event(ip=f'192.0.2.{i//5+1}'))['statusCode'],201)
        self.assertEqual(self.call(event(ip='192.0.2.100'))['statusCode'],429)

    def test_phone_and_telegram_and_ipv6(self):
        d=payload();d.update(contact_type='phone',contact='+7 (000) 000-00-00');self.assertEqual(self.call(event(d,ip='2001:db8::1'))['statusCode'],201)
        d.update(contact_type='telegram',contact='@synthetic_qa');self.assertEqual(self.call(event(d))['statusCode'],201)

    def test_fail_closed_without_deployment_flag(self):
        with patch.dict('os.environ',{},clear=True):self.assertEqual(handler(event(),None)['statusCode'],503)

    def test_failed_notification_is_retained_and_retried_without_contact(self):
        r=self.call(event());lead_id=json.loads(r['body'])['id'];sent=[]
        def fail(_): raise RuntimeError('network unavailable')
        self.assertEqual(deliver(self.repo,fail,now=1000)['pending_retry'],1);self.assertIn(lead_id,self.repo.leads);self.assertEqual(self.repo.outbox[lead_id]['status'],'pending')
        self.assertEqual(deliver(self.repo,sent.append,now=1001)['sent'],0)
        self.assertEqual(deliver(self.repo,sent.append,now=1060)['sent'],1);self.assertEqual(self.repo.outbox[lead_id]['status'],'sent');self.assertIn(lead_id,sent[0]);self.assertNotIn('example.test',sent[0]);self.assertNotIn('Тестовый',sent[0]);self.assertNotIn('СИНТЕТИЧЕСКИЙ',sent[0])

    def test_lease_prevents_concurrent_worker_and_old_completion(self):
        r=self.call(event());lead_id=json.loads(r['body'])['id'];job=self.repo.claim(lead_id,1000);self.assertIsNone(self.repo.claim(lead_id,1001));new=self.repo.claim(lead_id,1091);self.repo.finish(job,1091,True);self.assertEqual(self.repo.outbox[lead_id]['status'],'pending');self.repo.finish(new,1091,True);self.assertEqual(self.repo.outbox[lead_id]['status'],'sent')

    def test_expired_idempotency_key_cannot_confirm_deleted_record(self):
        e=event();self.call(e);self.assertEqual(self.call(e,now=1000+31*86400)['statusCode'],409)

if __name__=='__main__': unittest.main()
