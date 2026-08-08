---
title: 트러블슈팅
description: reset 절차, Obsidian 파일복구로 완료일 무손실 복원, 자주 나는 오류.
created: 2026-07-19
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

## 1. 자주 나는 증상

| 증상 | 원인 / 해결 |
|---|---|
| 데몬 로그에 `Operation not permitted` | TCC. python 에 전체 디스크 접근 권한 부여([[todoist-sync-install|Todoist 동기화 설치와 CLI]] 4절). |
| `Premium only feature`(deadline) | 무료 플랜. `todoist_deadline_to: none`(자동 degrade 됨). |
| 같은 태스크가 매 사이클 update(에코) | canonical 왕복 불일치. 2~3회 연속 실행이 무음인지 확인. 섹션/필드 매핑 점검. |
| Todoist 비웠는데 TN 노트가 아카이브됨 | stale `todoist_id` 때문. Todoist 비운 뒤 반드시 `reset` 먼저. |
| 태스크가 Todoist 에 안 보임 | 완료(done)/반복 스킵 여부 확인. 열린 태스크만 생성됨. |
| 중복 생성 | 데몬+수동 `once` 동시 실행 충돌. 데몬 정지 후 작업. |

## 2. Todoist 를 통째로 비우고 새로 시작

**순서가 중요**(안 지키면 삭제 전파로 TN 노트가 아카이브됨):
1. Todoist 앱에서 태스크 모두 삭제
2. `reset` — TN 파일의 `todoist_id` 제거 + Inbox 오염 정리 + 상태 DB 초기화
   ```bash
   ./.venv/bin/python -m tnsync.cli -c config.yaml reset
   ```
3. `once` — 열린 태스크를 깨끗이 재생성

## 3. 완료일(completedDate) 등 무손실 복구 — Obsidian 파일복구

Obsidian 코어 플러그인 **File Recovery** 가 로컬에 스냅샷을 저장한다(IndexedDB/leveldb, Snappy 압축).
값이 잘못 덮였을 때 여기서 원본을 복원할 수 있다.

- **간단한 방법**: Obsidian 앱 → 설정 → **파일 복구**에서 노트별 스냅샷 복원.
- **스크립트 방법**(실제로 completedDate 10개를 복원한 방식):
  - 위치: `~/Library/Application Support/obsidian/IndexedDB/app_obsidian.md_0.indexeddb.leveldb/`
  - `.log`(WAL, 비압축) + `.ldb`(Snappy 압축) 를 파싱. 압축 해제엔 `cramjam` 사용:
    ```python
    import cramjam
    cramjam.snappy.decompress_raw(block)   # leveldb 는 raw snappy
    ```
  - SSTable 푸터(마지막 48바이트, 매직 `0xdb4775248b80fb57`)에서 인덱스 핸들 →
    데이터 블록들 해제 → 텍스트에서 `completedDate`/`googleCalendarEventId` 근접 매칭.
  - 노트 식별은 **고유한 `googleCalendarEventId`** 로. (스냅샷은 V8 직렬화라
    `completedDate"<framing>2026-07-15` 형태 — 콜론이 아님에 주의.)

> 교훈: 파괴적 테스트 전엔 반드시 dry-run, 또는 대상 필드를 백업.

## 4. 로그 읽기
```bash
tail -f ~/Develop/tnsync/tnsync.log
# 정상 신호: "동기화 루프 시작" 이후 update/create/conflict/ERROR 없이 조용
# skip completed/recurring 은 debug 레벨(평소 안 찍힘)
```

## 5. 상태 점검
```bash
./.venv/bin/python -m tnsync.cli scan     # TN 태스크 파싱 확인(토큰 불필요)
./.venv/bin/python -m tnsync.cli doctor   # Todoist 연결 확인
# 양쪽 개수/중복 확인은 임시 스크립트로 requests + Vault 비교
```

## 6. 에코 디버깅 방법
문제 태스크의 `canon_from_task` vs `canon_from_item` 을 뽑아 **어느 필드가 다른지** 비교.
차이 필드가 왕복 불일치의 원인. (예: 섹션 미적용 → `stage` 불일치, Inbox → `project` 불일치.)

관련: [[todoist-sync-install|Todoist 동기화 설치와 CLI]] · [[todoist-sync-tradeoffs|Todoist 동기화 제약과 트레이드오프]]
