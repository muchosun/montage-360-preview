"""Private scheduled worker. Telegram receives request type and ID only."""
import json
import os
import time
from urllib.request import Request, urlopen


def deliver(repository, send, now=None):
    now = int(time.time() if now is None else now)
    sent = failed = 0
    for lead_id in repository.due(now):
        job = repository.claim(lead_id, now)
        if not job: continue
        success = False
        try:
            send('Новая заявка: расчёт для площадки.\nID: ' + job['id'])
            success = True
        except Exception:
            failed += 1  # No URL, token, response text or personal fields enter logs.
        repository.finish(job, now, success)
        if success: sent += 1
    return {'sent': sent, 'pending_retry': failed}


def telegram_sender(text):
    token = os.environ['TELEGRAM_BOT_TOKEN']
    chat = os.environ['TELEGRAM_CHAT_ID']
    if not token or not chat: raise RuntimeError('notification_not_configured')
    body = json.dumps({'chat_id': chat, 'text': text, 'disable_web_page_preview': True}).encode()
    req = Request('https://api.telegram.org/bot' + token + '/sendMessage', body, {'Content-Type': 'application/json'}, method='POST')
    with urlopen(req, timeout=5) as response:
        result = json.load(response)
        if response.status != 200 or result.get('ok') is not True or not isinstance(result.get('result', {}).get('message_id'), int):
            raise RuntimeError('delivery_not_confirmed')


_repository = None


def handler(event, context):
    global _repository
    if os.getenv('NOTIFICATIONS_ENABLED') != 'true': return {'enabled': False}
    try:
        try: from .repository import YdbRepository
        except ImportError: from repository import YdbRepository
        if _repository is None: _repository = YdbRepository()
        result = deliver(_repository, telegram_sender)
        print(json.dumps(result))  # Aggregate counts only; no event body or client fields.
        return result
    except Exception:
        # Returning a failure allows the timer's retry policy; durable rows remain.
        raise RuntimeError('notification_worker_failed') from None
