---
title: 아키텍처
description: 실행 구조, 상태 저장, canonical 해시, 충돌 해결, 에코 방지.
created: 2026-07-19
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

## 1. 실행 구조

- **언어/런타임**: Python 3.9 (파이 제로 이식성). 외부 의존성 최소(`requests`, `PyYAML`, `python-dateutil`).
- **실행 위치**: 맥북에서 `launchd` 로 상주. 60초 주기 폴링.
- **왜 폴링인가**: 주 사용환경이 아이패드인데, iPad 는 백그라운드 데몬을 못 돌린다.
  그래서 **맥북이 대신** 주기적으로 Todoist API 와 vault 파일을 대조한다.
  (Todoist 웹훅은 공개 엔드포인트가 필요해 개인용엔 과함 → 폴링 선택)
- **Obsidian 미실행 가능**: 엔진은 vault 의 `.md` 파일을 직접 읽고 쓴다. Obsidian 앱이
  떠 있을 필요가 없다. TaskNotes 의 HTTP API(로컬 127.0.0.1 전용)는 쓰지 않는다.

## 2. 양쪽 시스템의 저장 방식

### TaskNotes (Obsidian)
- 태스크 하나 = 노트 하나(`TaskNotes/Tasks/<제목>.md`).
- YAML frontmatter 에 구조화 필드: `status, priority, due, scheduled, tags, projects,
  timeEstimate, recurrence, completedDate, dateCreated, dateModified, ...`
- 태스크 식별: `tags` 에 `task` 태그 포함(TaskNotes `taskIdentificationMethod: tag`).
- 제목 = 파일명(`storeTitleInFilename: true`). → 우리는 `title` 필드를 쓰지 않는다.
- **완료 판정**: `.obsidian/plugins/tasknotes/data.json` 의 `customStatuses` 중
  `isCompleted: true` 인 status 값(기본 `done`).

### Todoist
- 통합 API v1 (`https://api.todoist.com/api/v1`).
- **Sync API**(`/sync`): `sync_token` 으로 증분 동기화(변경분만) + `commands` 배열로 쓰기.
- item 필드: `content, description, project_id, section_id, parent_id, priority(1-4),
  due{date,datetime,string,is_recurring}, deadline, duration{amount,unit}, labels,
  checked, completed_at, is_deleted, added_at, updated_at`.

## 3. 상태 저장 (SQLite)

경로: `~/.local/share/tnsync/state.sqlite3` (vault 밖). 테이블:

| 테이블 | 내용 | 용도 |
|---|---|---|
| `meta` | `sync_token` 등 | 증분 sync 토큰 |
| `links` | `todoist_id, tn_path, tn_hash, td_hash, updated` | 매핑 + 마지막 동기화 해시 |
| `td_items` | `id, json` | Todoist 아이템 전체 상태 미러(증분으로 유지) |
| `td_projects` | `id, name` | 프로젝트 캐시 |
| `td_sections` | `id, name, project_id` | 섹션 캐시 |

- **매핑의 원본은 파일의 `todoist_id` frontmatter**. `links` 는 성능/해시 캐시일 뿐,
  DB 가 날아가도 파일에서 재구성된다.
- **왜 아이템 캐시가 필요한가**: 증분 sync 는 "변경분"만 준다. 전체 상태(신규/삭제 판정)를
  알려면 로컬에 전체 미러가 필요. 완료/삭제 델타(`checked`, `is_deleted`)도 증분으로 들어와 캐시에 반영.

## 4. Canonical(정규 표현) 과 해시

두 시스템을 **하나의 dict** 로 환원한다. 예:

```
{ title, completed, due, scheduled, priority(int), tags[], project,
  parent, stage, duration, recurring }
```

- `canon_from_task(task)` — TaskNotes 태스크 → canonical
- `canon_from_item(item)` — Todoist 아이템 → canonical
- 두 canonical 이 같으면 "동기화된 상태". 그 해시(sha1 of sorted-JSON)를 `links` 에 저장.

### 변경 감지
- `td_changed` = 현재 item 해시 ≠ 저장된 `td_hash`
- `tn_changed` = 현재 task 해시 ≠ 저장된 `tn_hash`
- 둘 다 안 바뀜 → skip. 한쪽만 → 그쪽→반대쪽 전파. 둘 다 → **충돌**.

### 에코 방지 (무한 업데이트 차단)
적용 직후 `links` 의 두 해시를 **합의된 canonical 해시로 갱신**한다.
다음 사이클엔 양쪽 canonical 이 같아 `hi == ht` → 아무 동작 안 함(조용함).
> 개발 중 "2~3회 연속 실행이 완전히 무음인가"로 에코 여부를 항상 검증했다.

## 5. 충돌 해결 (`conflict` 설정)

양쪽이 동시에 바뀌면:
- `newest_wins`(기본) — Todoist `updated_at` vs TN `dateModified` 비교, 최신 우선
- `todoist_wins` / `tasknotes_wins` — 고정

record 단위(태스크 전체)로 승자를 정한다(필드 단위 병합 아님).

## 6. 한 사이클(`run_once`)의 순서

1. **pull** — Todoist 증분 sync → items/projects/sections/token 캐시 갱신
   (섹션 캐시가 비면 1회 full sync 로 채움)
2. **컨텍스트 주입** — sections_by_id, 하위작업용 `제목→todoist_id`/역방향 맵을 Mapper 에 주입
3. **인덱싱** — vault 스캔, `tn_by_tid`(링크됨) / `tn_unlinked`(미링크) 분류
4. **업데이트/충돌** — 양쪽 링크된 쌍 조정(`_reconcile_pair`)
5. **TN 삭제 감지** — 링크는 있는데 파일 없음 → Todoist item_delete
   (★ 삭제한 id 는 아래 신규 생성에서 제외 — 같은 사이클 재생성 버그 방지)
6. **Todoist 삭제 감지** — 링크는 있는데 item 없음 → TN archive/delete/keep
7. **신규 링크** — `match_by_title` 로 제목 같은 것 우선 연결
8. **신규 생성** — 미매칭 item → TN 파일 생성 / 미링크 TN → Todoist item 생성
9. **명령 flush** — 큐에 쌓인 Todoist 쓰기 명령 일괄 전송

## 7. 안전장치

- **dry-run**: 어떤 쓰기도 안 하고 계획만 로그.
- **유료 기능 자동 degrade**: `deadline` 등 premium 오류 시 해당 필드를 빼고 재시도(`_exec`).
- **사이클 예외 격리**: 한 사이클이 실패해도 루프는 계속(`cmd_run` 의 try/except).

관련: [[todoist-sync-field-mapping|Todoist 동기화 필드 매핑]] · [[todoist-sync-code|Todoist 동기화 코드 구조]] · [[todoist-sync-tradeoffs|Todoist 동기화 제약과 트레이드오프]]
