---
title: 라즈베리파이 이전
description: Syncthing 으로 vault 를 미러링해 headless 서버에서 돌리기.
created: 2026-07-19
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

목표: 맥북 대신 **라즈베리파이 제로** 같은 저전력 상시 서버에서 동기화를 돌린다.
엔진은 파일시스템만 쓰므로 코드 변경은 거의 없다. **핵심은 vault 를 파이로 미러링하는 것.**

## 1. 가장 큰 제약: vault 접근 채널

- 라즈베리파이 제로는 **Obsidian 데스크톱 앱을 못 돌린다**(ARM/리소스).
  → **Obsidian Sync 에 직접 참여할 수 없다**(Obsidian Sync 는 headless 미지원).
- 따라서 vault 를 **별도 채널로 파이에 미러링**해야 한다:
  - **Syncthing**(권장): Mac/iPad ↔ Pi 양방향 파일 동기화. 무료·headless.
  - 또는 Git(주기적 pull/push), rsync, iCloud/드라이브 마운트 등.
- 구도 예시:
  ```
  iPad(Obsidian Sync) ──┐
                        ├─ (Obsidian Sync)  Mac ──(Syncthing)── Pi(tnsync 데몬)
  Todoist ───────────────────────────────────────────────────┘(API)
  ```
  또는 Mac 을 빼고 iPad ↔ Pi 를 Syncthing 으로 직접 연결(단 iPad Syncthing 은 제약 있음).

## 2. 코드 이식 절차

```bash
# 파이에서
sudo apt install python3 python3-venv git
git clone <repo 또는 rsync 로 복사> ~/todoist-tasknotes-sync
cd ~/todoist-tasknotes-sync
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp config.example.yaml config.yaml   # 토큰 입력
```

- **`config.yaml` 의 `vault.path` 를 파이의 vault 미러 경로로 변경**(예: `/home/pi/CASE`).
- `state_db` 경로도 파이 기준으로(예: `~/.local/share/tnsync/state.sqlite3`).
- 그 외 설정/코드는 동일.

## 3. 상시 구동 (systemd)

`launchd` 대신 `systemd` 서비스로. `/etc/systemd/system/tnsync.service`:
```ini
[Unit]
Description=todoist-tasknotes-sync
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/todoist-tasknotes-sync
ExecStart=/home/pi/todoist-tasknotes-sync/.venv/bin/python -m tnsync.cli -c /home/pi/todoist-tasknotes-sync/config.yaml run
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tnsync
journalctl -u tnsync -f      # 로그
```

- 리눅스는 macOS TCC 같은 폴더 보호가 없어 **전체 디스크 접근 권한 이슈 없음**.

## 4. 주의점
- **파일 동기화 충돌**: Syncthing 이 vault 파일을 쓰는 동안 데몬이 동시에 쓰면 충돌 파일 생길 수 있음.
  주기(60초)와 Syncthing 지연을 고려. 필요 시 주기를 늘림.
- **시간대**: 파이 TZ 를 로컬(Asia/Seoul)로 맞춰야 날짜/시간 정규화가 맞음(`timedatectl`).
- **파이썬 버전**: 3.9+ 권장(코드가 3.9 호환).

## 5. 전환 체크리스트
- [ ] vault 미러링(Syncthing 등) 구성 및 검증
- [ ] `config.yaml` 의 `vault.path` / `state_db` 변경
- [ ] `doctor` → `once --dry-run` → `once` 순서로 검증
- [ ] systemd 서비스 등록
- [ ] 맥북 launchd 는 **정지**(두 곳에서 동시에 돌리면 안 됨)

관련: [[todoist-sync-config|Todoist 동기화 설정 레퍼런스]] · [[todoist-sync-install|Todoist 동기화 설치와 CLI]]
