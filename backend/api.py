"""Cloud Functions HTTP adapter. No personal data or event bodies are logged."""
import base64
import hashlib
import hmac
import ipaddress
import json
import os
import re
import time
import uuid

ORIGIN = 'https://montazh360.ru'
ACTIVITIES = {'karting', 'tubing', 'quad', 'rafting', 'attraction', 'other'}
UTM_KEYS = {'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'}
MAX_BODY = 16_384


class Invalid(Exception):
    def __init__(self, fields): self.fields = fields


class Conflict(Exception): pass
class RateLimited(Exception): pass


def validate(data, consent_version):
    if not isinstance(data, dict): raise Invalid({'form': 'Проверьте данные формы.'})
    allowed = {'venue', 'city', 'activity', 'cameras', 'contact_type', 'contact', 'comment', 'flow', 'consent', 'consent_version', 'attribution'}
    if set(data) - allowed: raise Invalid({'form': 'Проверьте данные формы.'})
    clean, errors = {}, {}
    for key, limit, required in [('venue', 180, True), ('city', 100, True), ('contact', 160, True), ('comment', 1500, False)]:
        value = data.get(key, '')
        if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
            errors[key] = 'Заполните поле корректно.'
        elif re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', value):
            errors[key] = 'Удалите недопустимые символы.'
        else: clean[key] = value.strip()
    for key, choices in [('activity', ACTIVITIES), ('cameras', {'yes', 'no', 'unsure'}), ('contact_type', {'phone', 'email', 'telegram'})]:
        value = data.get(key)
        if not isinstance(value, str) or value not in choices: errors[key] = 'Выберите вариант.'
        else: clean[key] = value
    contact = clean.get('contact', '')
    method = clean.get('contact_type')
    if method == 'phone':
        normalized = re.sub(r'[\s()+-]', '', contact)
        if not re.fullmatch(r'\d{10,15}', normalized): errors['contact'] = 'Укажите телефон с кодом страны.'
    elif method == 'email' and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', contact):
        errors['contact'] = 'Проверьте адрес электронной почты.'
    elif method == 'telegram':
        username = re.sub(r'^https://t\.me/', '', contact).lstrip('@')
        if not re.fullmatch(r'[A-Za-z0-9_]{5,32}', username): errors['contact'] = 'Укажите имя пользователя Telegram.'
    flow = data.get('flow')
    if flow in ('', None): clean['flow'] = None
    elif isinstance(flow, bool) or not isinstance(flow, int) or not 0 <= flow <= 100_000:
        errors['flow'] = 'Укажите целое число гостей в день или оставьте поле пустым.'
    else: clean['flow'] = flow
    if data.get('consent') is not True:
        errors['consent'] = 'Для ответа на заявку нужно ваше согласие.'
    elif data.get('consent_version') != consent_version:
        errors['consent'] = 'Обновите страницу и проверьте актуальные условия обработки данных.'
    else:
        clean['consent'] = True
        clean['consent_version'] = consent_version
    attrs = data.get('attribution', {})
    if not isinstance(attrs, dict) or set(attrs) - UTM_KEYS or any(not isinstance(v, str) or len(v) > 200 or re.search(r'[\x00-\x1f\x7f]', v) for v in attrs.values()):
        errors['form'] = 'Не удалось проверить параметры перехода. Обновите страницу.'
    else: clean['attribution'] = attrs
    if errors: raise Invalid(errors)
    return clean


def response(status, data=None, origin=None):
    headers = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin'}
    if origin == ORIGIN:
        headers.update({'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key', 'Access-Control-Max-Age': '600'})
    if status == 429: headers['Retry-After'] = '600'
    return {'statusCode': status, 'headers': headers, 'isBase64Encoded': False, 'body': '' if status == 204 else json.dumps(data or {}, ensure_ascii=False)}


def handle(event, repository, *, pepper, consent_version, retention_days, now=None):
    headers = {str(k).lower(): str(v) for k, v in event.get('headers', {}).items()}
    origin = headers.get('origin')
    if origin != ORIGIN: return response(403, {'ok': False}, origin)
    method = event.get('httpMethod', '')
    if method == 'OPTIONS': return response(204, origin=origin)
    if method != 'POST': return response(405, {'ok': False}, origin)
    if len(pepper) < 32 or not consent_version or not 1 <= retention_days <= 365:
        return response(503, {'ok': False, 'error': 'temporarily_unavailable'}, origin)
    if headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
        return response(415, {'ok': False}, origin)
    try:
        raw = event.get('body') or ''
        if not isinstance(raw, str) or len(raw) > MAX_BODY * 2: return response(413, {'ok': False}, origin)
        raw = base64.b64decode(raw, validate=True) if event.get('isBase64Encoded') else raw.encode('utf-8')
        if len(raw) > MAX_BODY: return response(413, {'ok': False}, origin)
        data = validate(json.loads(raw), consent_version)
        key = str(uuid.UUID(headers.get('idempotency-key', '')))
        if key != headers.get('idempotency-key') or uuid.UUID(key).version != 4: raise ValueError()
        # API Gateway v1 supplies this server-derived field; forwarded headers are ignored.
        ip = str(ipaddress.ip_address(event['requestContext']['identity']['sourceIp']))
    except Invalid as error:
        return response(422, {'ok': False, 'errors': error.fields}, origin)
    except (ValueError, TypeError, KeyError, UnicodeError):
        return response(400, {'ok': False, 'error': 'invalid_request'}, origin)
    timestamp = int(time.time() if now is None else now)
    ip_hash = hmac.new(pepper.encode(), ip.encode(), hashlib.sha256).hexdigest()
    request_key = hashlib.sha256(key.encode()).hexdigest()
    payload = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    fingerprint = hashlib.sha256(payload.encode()).hexdigest()
    try:
        lead_id, duplicate = repository.submit(request_key, fingerprint, payload, ip_hash, timestamp, retention_days)
        return response(200 if duplicate else 201, {'ok': True, 'id': lead_id, 'duplicate': duplicate}, origin)
    except Conflict:
        return response(409, {'ok': False, 'error': 'request_changed'}, origin)
    except RateLimited:
        return response(429, {'ok': False, 'error': 'rate_limited'}, origin)
    except Exception:
        # Never serialize exception messages, SDK diagnostics, body or contact details.
        return response(503, {'ok': False, 'error': 'temporarily_unavailable'}, origin)


_repository = None


class LazyRepository:
    def submit(self, *args):
        global _repository
        if _repository is None:
            try: from .repository import YdbRepository
            except ImportError: from repository import YdbRepository
            _repository = YdbRepository()
        return _repository.submit(*args)


def handler(event, context):
    origin = next((str(v) for k,v in event.get('headers', {}).items() if k.lower() == 'origin'), None)
    if os.getenv('FORM_ENABLED') != 'true':
        return response(503, {'ok': False, 'error': 'not_enabled'}, origin)
    try:
        return handle(event, LazyRepository(), pepper=os.environ['RATE_LIMIT_PEPPER'], consent_version=os.environ['CONSENT_VERSION'], retention_days=int(os.environ['RETENTION_DAYS']))
    except Exception:
        return response(503, {'ok': False, 'error': 'temporarily_unavailable'}, origin)
