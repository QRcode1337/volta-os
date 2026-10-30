#!/usr/bin/env python3
"""Build the Command Center dashboard's data files.

Writes one JSON per dataset to ~/.volta/command-center/out/. Mechanical datasets
(commits, agent_queue, services, storage, waiting) come from git, VOLTA's API on
:50000 and the disk; goals, next_moves and automations are copied from state/,
which the daily refresh agent keeps current. Uploading is the agent's job.
"""
import datetime
import json
import pathlib
import re
import shutil
import subprocess
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
STATE = HERE / 'state'
OUT = pathlib.Path.home() / '.volta' / 'command-center' / 'out'
REPO = HERE.parent.parent
API = 'http://localhost:50000'
WINDOW_DAYS = 14
AREAS = [('revenue', 'EPSILON + Strangest Times'), ('content', 'Content tools'),
         ('platform', 'VOLTA platform'), ('docs', 'Docs & audits')]
CONTENT_PREFIXES = ('podcast', 'music', 'studio', 'editor', 'generations', 'scripts')
REVENUE_WORDS = ('epsilon', 'strangest', 'tst ', 'sponsor', 'outreach', 'prospect')


def dump(name, rows):
    (OUT / f'{name}.json').write_text(json.dumps(rows, indent=1))


def api(path):
    with urllib.request.urlopen(API + path, timeout=30) as r:
        return json.load(r)


def area_of(subject):
    s = subject.lower()
    if any(w in s for w in REVENUE_WORDS):
        return 'revenue'
    if s.startswith('docs'):
        return 'docs'
    if s.split(':')[0].strip().startswith(CONTENT_PREFIXES):
        return 'content'
    return 'platform'


def commits(today):
    days = [today - datetime.timedelta(d) for d in range(WINDOW_DAYS - 1, -1, -1)]
    since = days[0] - datetime.timedelta(1)
    log = subprocess.run(['git', '-C', str(REPO), 'log', f'--since={since}', '--pretty=%ad|%s', '--date=short'],
                         capture_output=True, text=True, check=True).stdout.splitlines()
    counts = {(d.isoformat(), a): 0 for d in days for a, _ in AREAS}
    for line in log:
        day, subject = line.split('|', 1)
        if (day, 'docs') in counts:
            counts[(day, area_of(subject))] += 1
    labels = dict(AREAS)
    return [{'day': d, 'area': a, 'label': labels[a], 'commits': n} for (d, a), n in counts.items()]


def short(text):
    text = re.sub(r'`', '', text)
    text = re.split(r' \(|; ', text)[0]
    return text if len(text) <= 90 else text[:87].rstrip() + '…'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today()
    dump('commits', commits(today))

    acts = api('/api/actions')
    by_status = acts['counts']['byStatus']
    dump('agent_queue', [{'status': k, 'label': l, 'items': by_status.get(k, 0)} for k, l in
                         [('awaiting', 'Waiting on you'), ('blocked', 'Blocked'), ('todo', 'To do'),
                          ('progress', 'In progress'), ('done', 'Done')]])

    waiting = json.loads((STATE / 'decisions.json').read_text())
    for it in acts['items']:
        if it['status'] == 'awaiting':
            waiting.append({'item': short(it['text']), 'area': 'OpenClaw', 'since': it['created'], 'source': 'OpenClaw tasks'})
    seen, rows = set(), []
    for w in waiting:
        if w['item'] in seen:
            continue
        seen.add(w['item'])
        days = (today - datetime.date.fromisoformat(w['since'])).days
        rows.append({**w, 'days_waiting': max(0, days)})
    dump('waiting', rows)

    systems = api('/api/systems')
    dump('services', [{'service': s['name'], 'status': s['status'], 'core': bool(s.get('core')),
                       'detail': s.get('summary', '')} for s in systems['services']])

    du = shutil.disk_usage('/')
    dump('storage', [{'disk': 'Mac SSD', 'free_gb': round(du.free / 2**30), 'total_gb': round(du.total / 2**30)}])

    for name in ('goals', 'next_moves', 'automations'):
        shutil.copy(STATE / f'{name}.json', OUT / f'{name}.json')

    print(json.dumps({'out': str(OUT), 'files': sorted(p.name for p in OUT.glob('*.json'))}))


if __name__ == '__main__':
    main()
