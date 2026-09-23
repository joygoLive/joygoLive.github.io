#!/usr/bin/env python3
"""페이지가 README 「Page anatomy」 를 지키는지 본다.

서비스가 계속 늘기 때문에 규칙을 글로만 두면 다음 페이지에서 조용히 새어 들어온다.
새 페이지를 올리기 전에 이걸 돌린다.

    python3 tools/check-pages.py
"""
import re, sys, glob

def sections(s):
    return re.findall(r'<section[^>]*?id="([a-z0-9-]+)"[^>]*>(.*?)</section>', s, re.S)

bad = []
for p in sorted(glob.glob('*/index.html')) + ['index.html']:
    s = open(p, encoding='utf-8').read()

    # 제목+본문은 카드다. <li><b>제목.</b> 본문 은 둘을 한 문단으로 붙여 버린다.
    for li in re.findall(r'<li[^>]*>(.*?)</li>', s, re.S):
        if re.match(r'\s*(?:<svg.*?</svg>)?\s*<b>', li, re.S):
            bad.append(f'{p}: 제목+본문이 <li> 안에 있다 → .facts/.pts 카드로 '
                       f'({re.sub(r"<[^>]+>", "", li)[:44].strip()}…)')

    # 섹션 머리는 .sec-head 로 묶는다
    for sid, body in sections(s):
        if 'eyebrow' in body and 'sec-head' not in body:
            bad.append(f'{p}#{sid}: 섹션 머리가 .sec-head 로 안 묶였다')
        # 카드를 든 섹션은 「왜 이 목록이 있는가」를 리드로 먼저 말한다
        if re.search(r'class="(facts|pts)"', body) and 'class="lead"' not in body:
            bad.append(f'{p}#{sid}: 카드 섹션인데 리드 문장이 없다')

    # 카드 제목은 라벨이다 — 한국어 서술형 종결을 막는다
    ko = re.search(r'\n  ko:\{.*?\n  \}', s, re.S)
    if ko:
        titles  = re.findall(r'"[a-z0-9.]+"\s*:\s*"<b>(.*?)</b>', ko.group(0))
        titles += [v for _, v in re.findall(r'"([a-z]+\.\d+\.t)"\s*:\s*"([^"]*)"', ko.group(0))]
        for t in titles:
            if t.endswith(('습니다', '입니다', '합니다', '됩니다')):
                bad.append(f'{p}: 카드 제목이 서술형이다 → 명사형으로 ({t[:34]})')

    # 사전에 없는 키는 화면에 영어가 남는다
    used = set(re.findall(r'data-i18n(?:-html)?="([^"]+)"', s))
    if ko:
        have = set(re.findall(r'"([a-zA-Z0-9_.]+)"\s*:', ko.group(0)))
        for k in sorted(used - have):
            bad.append(f'{p}: ko 사전에 "{k}" 없음')

    # 새 페이지를 옛 페이지에서 복사하지 않고 쓰면 아래 넷이 빠진 채 나갔다(2026-09-23 전수 점검).
    if p != 'index.html':
        # 바이라인은 고정 문장으로 시작하고 상태를 뒤에 붙인다
        if 'A service by joygoLive, built here and operated here.' not in s:
            bad.append(f'{p}: EN 바이라인이 표준 문장으로 시작하지 않는다')
        if ko and 'joygoLive의 서비스. 직접 개발하고 직접 운영합니다.' not in ko.group(0):
            bad.append(f'{p}: KO 바이라인이 표준 문장으로 시작하지 않는다')
        if '주장하지 않는 것' not in s or 'What this does not claim' not in s:
            bad.append(f'{p}: 한계 절 「주장하지 않는 것」 / "What this does not claim" 없음')
    if 'gc.zgo.at/count.js' not in s:
        bad.append(f'{p}: GoatCounter 스크립트 없음')
    # 웹앱이면 누구나 갖는 성질은 차별점이 아니다. 개인정보 주장(이름·연락처 미수집)은 여기 안 걸린다
    for m in re.finditer(r'(?i)no install|no sign-?up|store review|설치도 |설치 없|스토어 심사|가입 없|가입도 없', s):
        bad.append(f'{p}: 웹앱 기본값을 차별점처럼 씀 → 서비스 고유 특징으로 (…{s[max(0, m.start()-30):m.end()+10]!r})')
    # 영문 철자는 US
    for m in re.finditer(r'(?i)\b(catalogue|cancelled|labelled|licence|judgement|centimetre|colour|behaviour|summaris|optimis|organis)\w*', s):
        bad.append(f'{p}: UK 철자 {m.group(0)} → US')

for b in bad:
    print('  ✗', b)
print(f'\n{len(bad)}건' if bad else '\n전부 통과')
sys.exit(1 if bad else 0)
