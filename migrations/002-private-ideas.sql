-- 제안을 기본 비공개로. schema.sql 은 「없는 것만 만들지 있는 것을 고치지 않으므로」,
-- 이미 만들어진 표에는 이 파일을 따로 돌려야 한다.
--
-- **기존 글은 private=1 로 들어간다.** 비밀번호가 없으므로 아무도 못 열고 운영자만
-- 본다 — 열리는 쪽으로 틀리는 것보다 잠기는 쪽으로 틀리는 편이 낫다.
ALTER TABLE ideas ADD COLUMN private   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ideas ADD COLUMN pass_salt TEXT;
ALTER TABLE ideas ADD COLUMN pass_hash TEXT;
ALTER TABLE ideas ADD COLUMN pass_iter INTEGER;
