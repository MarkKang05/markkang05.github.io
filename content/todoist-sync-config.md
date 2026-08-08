---
title: 설정 레퍼런스
description: config.yaml 의 모든 옵션 설명.
created: 2026-07-19
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

`~/Develop/tnsync/config.yaml`. (`config.example.yaml` 을 복사해 사용,
`config.yaml` 은 `.gitignore` 됨 — API 토큰 포함하므로 커밋 금지.)

## 전체 예시 (현재 값, 토큰은 마스킹)

```yaml
todoist:
  api_token: "<< Todoist API 토큰 >>"      # 설정→통합→개발자에서 발급
  base_url: "https://api.todoist.com/api/v1"
  only_projects: []                        # 특정 프로젝트만; 비우면 전체

vault:
  path: "/Users/markkang05/Documents/CASE" # vault 루트(Pi 이전 시 이것만 변경)
  tasks_folder: "TaskNotes/Tasks"
  archive_folder: "TaskNotes/Archive"
  task_tag: "task"
  on_todoist_delete: "archive"             # archive | delete | keep

sync:
  interval_seconds: 60                     # 폴링 주기(초)
  state_db: "~/.local/share/tnsync/state.sqlite3"
  initial_link: "match_by_title"           # match_by_title | todoist_to_tn | tn_to_todoist
  conflict: "newest_wins"                  # newest_wins | todoist_wins | tasknotes_wins
  skip_recurring: false                    # true 면 반복 태스크 미동기화
  recurring_date_from_tn: true             # 반복 예정일을 TN→Todoist 로도 전달

mapping:
  todoist_due_to: "scheduled"              # Todoist due → TN scheduled|due
  todoist_deadline_to: "none"              # deadline 유료 → 무료는 none
  priority_td_to_tn: { 4: "high", 3: "normal", 2: "low", 1: "normal" }
  priority_tn_to_td: { high: 4, normal: 1, low: 2, none: 1 }
  sync_status_sections: true
  status_sections: { open: "Open", "in-progress": "In-progress" }
  sync_labels_as_tags: true
  sync_project: true
  project_label_prefix: "프로젝트/"
```

## 옵션 설명

### `todoist`
| 키 | 의미 |
|---|---|
| `api_token` | Todoist API 토큰. **비밀** — 유출 주의. |
| `base_url` | API 베이스. 통합 v1 기본값. |
| `only_projects` | 이름 목록. 지정 시 그 프로젝트의 태스크만 동기화. 비우면 전체. |

### `vault`
| 키 | 의미 |
|---|---|
| `path` | Obsidian vault 루트. **Pi 이전 시 이 경로만 바꾸면 됨.** |
| `tasks_folder` | TaskNotes 태스크 폴더(설정의 `tasksFolder` 와 동일). |
| `archive_folder` | 아카이브 대상 폴더. |
| `task_tag` | 태스크 식별 태그(기본 `task`). 이 태그가 있어야 태스크로 인식. |
| `on_todoist_delete` | Todoist 에서 삭제된 태스크의 TN 처리: `archive`(권장)/`delete`/`keep`. |

### `sync`
| 키 | 의미 |
|---|---|
| `interval_seconds` | `run` 모드 폴링 주기. 현재 **60**. |
| `state_db` | 상태 DB 경로. **vault 밖**에 둘 것(안 그러면 Obsidian 이 인덱싱). |
| `initial_link` | 첫 연결 방식. `match_by_title`(제목 같은 것 링크, 권장). |
| `conflict` | 충돌 해결 정책. `newest_wins` = 최신 수정 우선. |
| `skip_recurring` | `false`=반복 느슨 동기화 / `true`=반복 미동기화. |
| `recurring_date_from_tn` | 반복 태스크의 다음 예정일을 TaskNotes 에서 바꿨을 때 Todoist 로 밀지. `true`(기본)=양방향, `false`=Todoist 가 날짜 소유. 에코가 의심되면 `false`. |

### `mapping`
| 키 | 의미 |
|---|---|
| `todoist_due_to` | Todoist due 를 TN 의 어느 필드로: `scheduled`(기본) / `due`. |
| `todoist_deadline_to` | Todoist deadline 매핑: `none`(무료) / `due` / `scheduled`. |
| `priority_td_to_tn` | Todoist 정수 → TN 우선순위 문자열. **medium 금지.** |
| `priority_tn_to_td` | TN 우선순위 → Todoist 정수. 목록 밖은 1로 흡수. |
| `sync_status_sections` | 상태↔섹션 동기화 on/off. |
| `status_sections` | TN status → Todoist 섹션 이름. **Todoist 에 미리 섹션 생성 필요.** |
| `sync_labels_as_tags` | 태그↔라벨 on/off. |
| `sync_project` | 프로젝트(라벨)/하위작업 동기화 on/off. |
| `project_label_prefix` | 프로젝트 라벨 접두사(기본 `프로젝트/`). |

## 값 변경 후 반영
데몬이 돌고 있으면 config 는 **시작 시 1회** 읽으므로 재시작 필요:
```bash
launchctl kickstart -k gui/$(id -u)/com.markkang.tnsync
```

관련: [[todoist-sync-install|Todoist 동기화 설치와 CLI]] · [[todoist-sync-field-mapping|Todoist 동기화 필드 매핑]]
