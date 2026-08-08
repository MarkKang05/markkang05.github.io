---
title: 설치와 CLI
description: 설치, CLI 명령, launchd 상시구동, macOS 전체 디스크 접근 권한.
created: 2026-07-19
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

## 1. 설치

```bash
cd ~/Develop/tnsync
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt   # requests, PyYAML, python-dateutil
cp config.example.yaml config.yaml            # 없으면
# config.yaml 에 Todoist API 토큰 입력
```

## 2. CLI 명령

```bash
./.venv/bin/python -m tnsync.cli [-c config.yaml] [-v] <명령>
```

| 명령 | 설명 |
|---|---|
| `scan` | (토큰 불필요) vault 태스크 파싱 결과 출력. 오프라인 검증용. |
| `doctor` | 설정/연결 점검(Todoist 연결, 프로젝트 수). |
| `reset` | **모든 `todoist_id` 제거 + Inbox 오염 정리 + 상태 DB 초기화.** Todoist 를 비운 뒤. |
| `once [--dry-run]` | 한 번 동기화. `--dry-run` 이면 계획만 로그. |
| `run [--dry-run]` | `interval_seconds` 주기로 반복(포그라운드). launchd 가 이걸 실행. |

### 첫 실행 권장 순서
```bash
./.venv/bin/python -m tnsync.cli doctor           # 연결 확인
./.venv/bin/python -m tnsync.cli once --dry-run   # 계획 먼저 확인 (중요!)
./.venv/bin/python -m tnsync.cli once             # 실제 1회
```

## 3. 상시 구동 (macOS launchd)

plist: `~/Develop/tnsync/com.markkang.tnsync.plist`
(60초 주기 `run`, `RunAtLoad`+`KeepAlive`, 로그 `tnsync.log`).

```bash
# 등록
cp ~/Develop/tnsync/com.markkang.tnsync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.markkang.tnsync.plist

# 상태 확인 (PID  마지막exit  라벨)
launchctl list | grep tnsync

# 재시작(코드/설정 변경 후)
launchctl kickstart -k gui/$(id -u)/com.markkang.tnsync

# 정지/해제
launchctl unload ~/Library/LaunchAgents/com.markkang.tnsync.plist

# 로그
tail -f ~/Develop/tnsync/tnsync.log
```

## 4. ⚠️ 전체 디스크 접근 권한 (필수)

vault 가 `~/Documents` 안에 있으면 macOS TCC 보호로 **launchd 프로세스는 접근 불가**
(`Operation not permitted`). 터미널에서 `once` 는 되지만 데몬은 막힌다.

**해결(1회, GUI)**: 시스템 설정 → 개인정보 보호 및 보안 → **전체 디스크 접근 권한** →
`+` → `⌘⇧G` 로 아래 경로 이동 → `python3.9` 추가 → 토글 켜기:
```
/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/bin/
```
(명령어로는 부여 불가 — Apple 보안 정책.)

## 5. 개발/테스트 시 주의
- 데몬과 수동 `once` 를 **동시에 돌리면** 같은 상태 DB 를 공유해 충돌할 수 있다.
  개발/테스트 중엔 `launchctl unload` 로 데몬을 잠시 내리고, 끝나면 다시 로드.
- 로그의 `skip completed/recurring` 은 debug 레벨(평소엔 안 찍힘). `-v` 로 보임.

관련: [[todoist-sync-config|Todoist 동기화 설정 레퍼런스]] · [[todoist-sync-troubleshooting|Todoist 동기화 트러블슈팅]]
