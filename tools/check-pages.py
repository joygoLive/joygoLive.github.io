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

for b in bad:
    print('  ✗', b)
print(f'\n{len(bad)}건' if bad else '\n전부 통과')
sys.exit(1 if bad else 0)
