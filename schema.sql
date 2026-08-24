-- 아이디어 게시판 — 익명·공개.
--
-- BOR 의 절별 의견(web/lib/feedback.ts)과 같은 규칙을 따른다: **덧붙이기만 하고
-- 고치지 않는다.** 낸 의견을 나중에 지울 수 있으면 「무엇을 왜 안 만들기로 했는가」가
-- 남지 않는데, 그 기록이 이 게시판에서 제일 값진 부분이다.
--
-- 상태가 넷인 이유 — 「아직 안 봤다」와 「보고 안 만들기로 했다」가 구분돼야 하고,
-- 후자에는 이유가 남아야 한다. 거기에 「만드는 중」과 「만들었다」를 더한 것은
-- 이 게시판이 검토로 끝나지 않고 **만들어 주겠다는 약속**이기 때문이다.

CREATE TABLE IF NOT EXISTS ideas (
  id       TEXT PRIMARY KEY,
  ts       TEXT NOT NULL,
  author   TEXT,                       -- 비면 익명. 신원 확인은 하지 않는다
  title    TEXT NOT NULL,              -- 한 줄 요약
  problem  TEXT,                       -- 무엇이 불편한가
  who      TEXT,                       -- 누가 쓰게 되나
  outcome  TEXT,                       -- 되면 무엇이 달라지나
  status   TEXT NOT NULL DEFAULT 'open',   -- open | building | shipped | declined
  note     TEXT,                       -- 검토 의견. declined 면 이유, shipped 면 범위
  hidden   INTEGER NOT NULL DEFAULT 0  -- 지우지 않고 가린다 (기록은 남는다)
);

CREATE TABLE IF NOT EXISTS comments (
  id       TEXT PRIMARY KEY,
  idea_id  TEXT NOT NULL,
  ts       TEXT NOT NULL,
  author   TEXT,
  text     TEXT NOT NULL,
  owner    INTEGER NOT NULL DEFAULT 0, -- 운영자 답글이면 1
  hidden   INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (idea_id) REFERENCES ideas(id)
);

CREATE INDEX IF NOT EXISTS idx_comments_idea ON comments(idea_id, ts);
CREATE INDEX IF NOT EXISTS idx_ideas_ts ON ideas(ts DESC);

-- 속도 제한용. IP 원문은 두지 않는다 — 익명 게시판이 IP 대장을 갖고 있으면
-- 익명이 아니다. 해시만 두고 오래된 것은 지운다.
CREATE TABLE IF NOT EXISTS rate (
  ip_hash TEXT NOT NULL,
  kind    TEXT NOT NULL,
  ts      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate ON rate(ip_hash, kind, ts);

-- 즉시 현황 요청 큐.
--
-- 왜 큐인가: Discord 는 **3초 안에** 응답을 요구하는데, 리포트 수집은 BOR 온체인
-- 조회까지 있어 그보다 오래 걸린다. 게다가 데이터는 전부 맥에 있다(UQI DB·AMC 로그).
-- 그래서 접수와 실행을 나눈다 — Cloudflare 가 즉시 «접수했습니다»로 답하고,
-- 맥이 가져가서 돌린 뒤 웹훅으로 결과를 민다.
CREATE TABLE IF NOT EXISTS report_requests (
  id       TEXT PRIMARY KEY,
  ts       TEXT NOT NULL,
  who      TEXT,                        -- 누가 눌렀나 (Discord 사용자 이름)
  status   TEXT NOT NULL DEFAULT 'pending',  -- pending | done
  done_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_reqs ON report_requests(status, ts);
