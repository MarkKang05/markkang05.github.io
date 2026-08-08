---
title: 코드 구조
description: 모듈별 역할과 핵심 알고리즘.
created: 2026-07-19
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

## 디렉터리
```
~/Develop/tnsync/
├─ config.yaml                 # 설정(비밀 포함, gitignore)
├─ config.example.yaml         # 설정 템플릿
├─ requirements.txt            # requests, PyYAML, python-dateutil
├─ com.markkang.tnsync.plist   # launchd 정의
├─ tnsync.log                  # 실행 로그
└─ tnsync/
   ├─ __init__.py
   ├─ cli.py                   # 진입점(argparse)
   ├─ vault.py                 # TaskNotes vault R/W
   ├─ todoist.py               # Todoist Sync API 클라이언트
   ├─ store.py                 # SQLite 상태 저장
   ├─ mapping.py               # 필드 매핑 + canonical + 해시
   └─ engine.py                # 동기화 조정 엔진
```

## `vault.py` — TaskNotes 접근
- **`Task`**(dataclass): `path, title, status, completed, priority, due, scheduled,
  tags, projects, completed_date, recurrence, time_estimate, todoist_id, fm(원본), body`.
  `is_recurring` 프로퍼티.
- **`TaskNotesSettings`**: `.obsidian/plugins/tasknotes/data.json` 을 읽어
  `fieldMapping`, 완료 status 집합(`isCompleted`), 기본값 로드.
- **`Vault`**:
  - `scan_tasks()` — 태스크 폴더에서 `task` 태그 있는 `.md` 수집.
  - `parse_frontmatter()` — 커스텀 YAML 로더로 **날짜를 문자열 그대로 유지**
    (`2026-07-15` 를 `datetime.date` 로 자동변환하지 않도록 timestamp resolver 제거).
  - `save()` — 관리 필드만 갱신 후 재직렬화, `dateModified` 갱신, 원자적 교체(tmp→replace).
  - `create_task()` — 파일명=제목(**title 필드는 안 남김**), 충돌 회피.
  - `rename_task()` — 제목 변경 시 파일 이름 변경.
  - `archive_task()` / `delete_task()`.
- 우리가 안 건드리는 필드(recurrence, googleCalendarEventId, complete_instances, 본문 등)는 보존.

## `todoist.py` — Todoist 클라이언트
- **`TodoistClient`**:
  - `sync(token, resource_types)` — 증분 읽기(기본 items/projects/labels/**sections**).
  - `write(commands)` — 쓰기. 명령별 `sync_status` 확인, 실패 시 `TodoistError`.
  - command 빌더(각각 `uuid` 자동): `cmd_item_add/update/complete/uncomplete/delete`,
    `cmd_item_move(project_id | section_id | parent_id)`, `cmd_project_add`,
    `cmd_note_add(item_id, content)`(**temp_id 필수**).
- 헬퍼: `item_is_completed()`, `item_is_recurring()`.

## `store.py` — SQLite
- 테이블: `meta / links / td_items / td_projects / td_sections`.
- `get_meta/set_meta`, `link_by_todoist/by_path`, `upsert_link`, `all_items/put_item/delete_item`,
  `all_projects/all_sections/put_*`, `clear_items`(캐시 초기화), `reset`(전체 초기화).

## `mapping.py` — 매핑/정규화
- **`normalize_dt()`** — 날짜/시간 문자열 정규화(date→`YYYY-MM-DD`, datetime→로컬 `…THH:MM`).
- **`Mapper`**:
  - `canon_from_item(item)` / `canon_from_task(task)` → canonical dict.
  - `hash_canon()` — sorted-JSON sha1.
  - `item_args_from_canon()` — item_add/update 용 args(content/priority/due/deadline/labels/duration).
  - 우선순위 맵, 라벨↔프로젝트 분리(`_split_labels`, `_proj_to_label`).
  - 섹션: `section_name_for()`, `status_for_section_id()`, `sections_by_id`(주입).
  - 하위작업: `task_parent_ids`, `id_to_title`(주입).
  - 반복: `rrule_to_todoist_string()`, `rrule_first_date()`, `todoist_string_to_rrule()`.
- **주입 패턴**: 엔진이 매 사이클 `mapper.sections_by_id / task_parent_ids / id_to_title /
  open_status` 를 채워준다(Mapper 가 vault/store 를 직접 참조하지 않도록).

## `engine.py` — 조정 엔진
- **`Engine`**: `_pull()`, `run_once()`, `_reconcile_pair()`, 적용 메서드들, 생성/삭제 처리.
- `_exec(cmds)` — Todoist 쓰기 래퍼. **premium 오류 시 deadline 등 빼고 재시도**(자동 degrade).
- 적용:
  - `_apply_item_to_tn` — Todoist→TN(제목 rename, 상태/완료/일정/소요시간/태그/프로젝트/부모).
  - `_apply_tn_to_item` — TN→Todoist(item_update + 섹션 이동 + 부모 이동 + 완료 전이).
- 생성:
  - `_create_item_from_tn` — TN→Todoist(라벨/섹션/부모/딥링크 댓글, 완료·반복 규칙 반영).
  - `_create_tn_from_item` — Todoist→TN(반복 역변환, 부모→projects).
- 삭제:
  - `_detect_tn_deletions` — TN 파일 사라짐 → Todoist delete. **삭제 id 반환**(같은 사이클 재생성 방지).
  - `_handle_todoist_deleted` — Todoist 삭제 → TN archive/delete/keep.

## `cli.py` — 진입점
- argparse 서브커맨드: `scan/doctor/reset/once/run`. `cmd_run` 은 무한 루프(사이클 예외 격리).

## canonical dict 예시
```python
{
  "title": "보고서 초안 작성",
  "completed": False,          # 반복 태스크는 None(비교 제외)
  "due": None,                 # todoist_deadline_to=none 이라 미사용
  "scheduled": "2026-07-20T09:00",
  "priority": 1,               # Todoist 정수
  "tags": ["work"],
  "project": None,             # 라벨용(하위작업이면 None)
  "parent": "<부모 todoist_id>",     # 부모 todoist_id(하위작업)
  "stage": "open",             # 섹션용 상태
  "duration": 60,              # 분
  "recurring": False,
}
```

관련: [[todoist-sync-architecture|Todoist 동기화 아키텍처]] · [[todoist-sync-field-mapping|Todoist 동기화 필드 매핑]]
