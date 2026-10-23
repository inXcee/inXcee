#!/usr/bin/env python3
"""inXcee bekçisi — Hermes Agent `--no-agent` cron script'i.

Hermes bu script'i takvime göre çalıştırır ve stdout'u Telegram'a OLDUĞU GİBİ
gönderir. LLM'e hiç gitmez, token harcamaz.

  * Boş stdout  → mesaj yok ("her şey yolunda").
  * Sorun çıkarsa → kısa Türkçe uyarı.
  * Aynı sorun sürerse tekrar yazmaz; sorun kümesi değişince veya düzelince yazar.

Kontroller:
  1. /api/health          (auth yok) — DB, disk, iş kuyruğu, şema/migration
  2. /api/agent/backups   (AGENT_API_TOKEN) — son yedek 26 saatten eski mi
  3. /api/agent/anomalies (AGENT_API_TOKEN) — yalnız 'critical' anomaliler

Ortam değişkenleri (Hermes'te terminal.env_passthrough ile verilir):
  INXCEE_URL            ör. https://yys.ornek.com  (sonunda / olmadan)
  INXCEE_AGENT_TOKEN    sunucudaki AGENT_API_TOKEN ile aynı değer
  INXCEE_WATCHDOG_STATE (ops.) tekrar bastırma durum dosyası

Yalnız standart kütüphane kullanır. Token değeri asla yazdırılmaz.
"""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

TIMEOUT = 15


def fetch(url, token=None):
    """(status, body) döner; ağ hatasında (None, hata metni)."""
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return res.status, json.loads(res.read().decode('utf-8') or '{}')
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode('utf-8') or '{}')
        except ValueError:
            body = {}
        return e.code, body
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        return None, str(getattr(e, 'reason', e))


def check_health(base):
    status, body = fetch(f'{base}/api/health')
    if status is None:
        return [f'🔴 Sunucuya ulaşılamıyor: {body}']
    if status != 200 or body.get('status') != 'ok':
        parts = [f"durum={body.get('status', status)}"]
        if body.get('db') not in (None, 'ok'):
            parts.append(f"db={body['db']}")
        if body.get('disk_status') not in (None, 'ok'):
            parts.append(f"disk=%{body.get('disk_percent')} ({body['disk_status']})")
        if body.get('jobs_status') not in (None, 'ok'):
            parts.append(f"kuyruk bekleyen={body.get('jobs', {}).get('pending')}")
        if body.get('schema_missing'):
            parts.append('şema eksik: ' + ', '.join(body['schema_missing'][:5]))
        return ['🔴 Sağlık kontrolü: ' + ', '.join(parts)]
    return []


def check_agent(base, token):
    alerts = []
    status, body = fetch(f'{base}/api/agent/backups', token)
    if status == 200:
        if body.get('stale'):
            latest = body.get('latest')
            when = f"son yedek {latest['age_hours']} saat önce ({latest['name']})" if latest else 'hiç yedek yok'
            alerts.append(f'🟠 Yedek gecikti: {when}')
    elif status in (401, 503):
        alerts.append(f'⚙️ Ajan API erişimi yok (HTTP {status}) — AGENT_API_TOKEN / INXCEE_AGENT_TOKEN eşleşmiyor ya da tanımsız')
        return alerts
    elif status is not None:
        alerts.append(f'🟠 Yedek durumu okunamadı (HTTP {status})')

    status, body = fetch(f'{base}/api/agent/anomalies', token)
    if status == 200:
        for a in body.get('anomalies', []):
            if a.get('severity') == 'critical':
                alerts.append(f"🔴 {a.get('title')}: {a.get('detail')}")
    return alerts


def state_path():
    custom = os.environ.get('INXCEE_WATCHDOG_STATE')
    if custom:
        return custom
    home = os.environ.get('HERMES_HOME') or os.path.expanduser('~/.hermes')
    return os.path.join(home, 'cache', 'inxcee_watchdog.json')


def load_state(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f)
    os.replace(tmp, path)


def decide(alerts, previous_digest):
    """Yazılacak mesajı ve yeni özeti döner. Aynı uyarı kümesi tekrar yazılmaz."""
    digest = hashlib.sha256('\n'.join(sorted(alerts)).encode('utf-8')).hexdigest() if alerts else ''
    if digest == (previous_digest or ''):
        return '', digest
    if not alerts:
        return '✅ inXcee: önceki uyarılar düzeldi.', digest
    return 'inXcee uyarı\n' + '\n'.join(alerts), digest


def main():
    base = (os.environ.get('INXCEE_URL') or '').rstrip('/')
    token = os.environ.get('INXCEE_AGENT_TOKEN') or ''
    if not base:
        # Sıfır olmayan çıkış → Hermes bir kez hata bildirimi gönderir.
        print('INXCEE_URL tanımlı değil (terminal.env_passthrough + .env)', file=sys.stderr)
        return 2

    alerts = check_health(base)
    # Sunucu tamamen düştüyse ajan uçlarını ayrıca denemek aynı şeyi tekrarlar.
    if token and not any(a.startswith('🔴 Sunucuya ulaşılamıyor') for a in alerts):
        alerts += check_agent(base, token)
    elif not token:
        alerts.append('⚙️ INXCEE_AGENT_TOKEN tanımsız — yedek ve anomali kontrolü atlandı')

    path = state_path()
    state = load_state(path)
    message, digest = decide(alerts, state.get('digest'))
    save_state(path, {'digest': digest})
    if message:
        print(message)
    return 0


if __name__ == '__main__':
    sys.exit(main())
