---
title: Proxmox LXC 이전
description: 컨테이너 안에서 Obsidian 을 직접 돌려 Sync 에 참여시키기. 실제로 밟은 함정 6가지.
created: 2026-07-26
maturity: growing
publish: true
---
← [[todoist-sync|Todoist 동기화]]

목표: 맥북 대신 **Proxmox LXC 컨테이너**에서 동기화를 상시 구동한다.
[[todoist-sync-raspberry-pi|Todoist 동기화 라즈베리파이 이전]]과 결정적으로 다른 점: **컨테이너 안에서 Obsidian 데스크톱을 직접 돌려
Obsidian Sync 에 참여**한다. Syncthing 같은 별도 미러링 채널이 필요 없고, 맥북과 완전히 같은 파일 상태를 본다.

```
iPad ─┐
      ├─ Obsidian Sync ─ LXC(Obsidian + tnsync 데몬) ── Todoist API
Mac ──┘
```

스크립트 위치: `~/Develop/tnsync/deploy/` (볼트 밖)

---

## 1. 설계 결정과 근거

### vault 접근 채널

| 방식 | 판단 |
|---|---|
| **컨테이너에서 Obsidian 실행** ← 채택 | Obsidian Sync 에 직접 참여. 미러링 채널 0개. 대가는 Electron 을 돌릴 RAM |
| Syncthing 미러링 | Pi Zero 처럼 Obsidian 을 못 돌릴 때의 대안([[todoist-sync-raspberry-pi|Todoist 동기화 라즈베리파이 이전]]) |
| NFS/SMB 마운트 | vault 원본이 NAS 에 있을 때. unprivileged LXC 는 마운트 제약 있음 |
| 호스트 bind mount | vault 가 이미 Proxmox 호스트에 있을 때만 |

### GUI 스택 — 최소 구성

| 역할 | 선택 | 이유 |
|---|---|---|
| X 서버 + 원격 화면 | **Xvnc** (tigervnc-standalone-server) | X 서버와 VNC 서버가 **한 프로세스**. `Xvfb + x11vnc` 2개보다 가볍고 리사이즈 지원 |
| WM | **Openbox** (~2MB) | Electron 창·모달·파일선택창을 정상 처리하는 최소선. `dwm`/`matchbox` 는 더 작지만 설정 모달에서 깨질 위험 |
| 앱 | Obsidian 공식 **`.deb`** | AppImage 는 FUSE 필요 → unprivileged LXC 에서 골치. deb 는 apt 가 의존성 해결 |
| 브라우저 접속(선택) | **noVNC + websockify** | VNC 클라이언트 없이 브라우저로 |

데스크톱 환경(XFCE/LXQt)은 불필요 — 실행할 앱이 하나뿐이다.
**VNC 는 평소 접속하지 않아도 된다.** 초기 로그인·플러그인 설정 때만 붙고, 이후엔 Obsidian 이 백그라운드로 돌 뿐이다.

### 컨테이너 스펙

- Debian 13(없으면 12) · **unprivileged** · `features: nesting=1,keyctl=1`
- 2 코어 / **2048MB** RAM / 512MB swap / 12GB 디스크 · TZ `Asia/Seoul` · `onboot=1`
- Electron 이라 1GB RAM 은 빡빡하다. idle CPU 는 거의 0.

---

## 2. Proxmox noVNC 로는 GUI 를 볼 수 없다

**Proxmox UI 의 CT 콘솔 버튼은 컨테이너의 텍스트 tty 에 붙는 것**이다.
그래픽 noVNC 는 에뮬레이트된 VGA 장치가 있는 **QEMU VM 전용**이고, LXC 는 커널을 공유하며
가상 그래픽 장치가 없어 구조적으로 불가능하다.

브라우저로 GUI 를 보려면 컨테이너 안에 noVNC 를 직접 띄운다(`04-add-novnc.sh`):

```
브라우저 ──http/ws:6080── websockify ──vnc:5901(localhost)── Xvnc ── Openbox + Obsidian
```

Proxmox UI 콘솔 버튼으로 GUI 를 보려면 LXC 대신 VM 으로 가야 하지만,
얻는 건 콘솔 버튼 하나뿐이고 커널·디스크 이미지 오버헤드(RAM 약 +500MB)를 낸다. 권하지 않는다.

---

## 3. 절차

### ① Proxmox 호스트: 컨테이너 생성

```bash
scp deploy/01-host-create-lxc.sh root@<proxmox>:/root/
ssh root@<proxmox>
bash /root/01-host-create-lxc.sh
# 덮어쓰기:  CTID=215 STORAGE=local-zfs RAM=3072 PUBKEY=/root/id_ed25519.pub bash 01-...sh
```

템플릿 확보 → `pct create` → 부팅 → sshd 준비 → **IP 출력**.

### ② 맥: 소스 전송

```bash
cd ~/Develop/tnsync
rsync -av --exclude __pycache__ --exclude '*.pyc' ./ root@<CT-IP>:/opt/tnsync-src/
```

> vault 안이 아니라 `/opt/tnsync-src` 에 두는 이유:
> vault 는 Obsidian Sync 가 관리하는 영역이라 `__pycache__`·venv 가 섞이면 동기화 잡음이 된다.
> 코드 수정 후에는 이 rsync 를 다시 돌리고 `systemctl restart tnsync`.

### ③ 컨테이너: GUI + Obsidian

```bash
ssh -t root@<CT-IP> 'bash /opt/tnsync-src/deploy/02-container-desktop.sh'   # -t 필수(§4-B)
# 비대화식:  ssh root@<CT-IP> 'VNC_PASSWORD=xxxxxxxx bash /opt/.../02-container-desktop.sh'
```

패키지 → 사용자 `tnsync` → Obsidian `.deb` → **Electron 런타임 라이브러리 보강** →
Openbox 설정 → VNC 비밀번호 → `xvnc.service` + `obsidian.service`.

### ④ 브라우저 접속을 원하면 (선택)

```bash
ssh -t root@<CT-IP> 'bash /opt/tnsync-src/deploy/04-add-novnc.sh'
# → http://<CT-IP>:6080/vnc.html?autoconnect=1&resize=remote
```

### ⑤ 화면 붙어서 Obsidian Sync 설정

```bash
# VNC 클라이언트로 (Xvnc 는 localhost 바인딩이므로 터널 필요)
ssh -N -L 5901:127.0.0.1:5901 root@<CT-IP>
# Finder ⌘K → vnc://localhost:5901
```

1. Obsidian 계정 로그인 → **Sync** 활성화
2. 원격 vault 를 **`/home/tnsync/CASE`** 로 받기 (경로 정확히)
3. 첫 전체 동기화 완료 확인: `ls /home/tnsync/CASE/TaskNotes/Tasks | wc -l`
4. TaskNotes 플러그인 자체는 tnsync 동작에 **필요 없다**(엔진은 마크다운만 읽고 쓴다).
   컨테이너 UI 에서 태스크를 볼 일이 있으면 켠다.

### ⑥ tnsync 데몬

```bash
ssh -t root@<CT-IP> 'bash /opt/tnsync-src/deploy/03-tnsync-install.sh'
# 비대화식:  TODOIST_TOKEN=xxx bash /opt/.../03-tnsync-install.sh
```

`vault.path`/`state_db` 를 컨테이너 경로로, `interval_seconds` 를 **120초**로 맞춘 config 를
`~tnsync/.config/tnsync/config.yaml` 에 만든다(vault 밖 · `chmod 600`).

**유닛을 등록만 하고 시작하지 않는다.** 순서대로 검증:

```bash
P="runuser -u tnsync -- env PYTHONPATH=/opt/tnsync-src /home/tnsync/tnsync-venv/bin/python -m tnsync.cli -c /home/tnsync/.config/tnsync/config.yaml"
$P doctor
$P once --dry-run     # ← 삭제/생성 건수를 반드시 눈으로 확인
$P once               # 여기서 state.sqlite3 가 처음 생성된다
systemctl start tnsync && journalctl -u tnsync -f
```

> ③번(`--dry-run`)을 건너뛰지 말 것. vault 가 덜 받아진 상태로 `once` 를 돌리면
> 엔진이 "TN 에서 파일이 삭제됐다"고 판단할 수 있다. `max_deletes: 5` 가 막아주지만 확인이 먼저다.

### ⑦ 맥북 쪽 정지 (필수)

```bash
launchctl bootout gui/$(id -u)/com.tnsync.sync 2>/dev/null || true
```

두 곳에서 동시에 돌리면 안 된다.

---

## 4. 실제로 밟은 함정 — 증상 → 원인 → 해결

이 절이 이 문서의 핵심이다. 전부 실제로 겪은 것들이다.

### A. root SSH 접속 거부 (콘솔 로그인은 되는데)

- **증상**: `pct create` 로 설정한 비밀번호로 `ssh root@<CT-IP>` 가 거부됨. Proxmox 콘솔로는 정상 로그인.
- **원인**: Debian `sshd_config` 는 첫 줄에서 `Include /etc/ssh/sshd_config.d/*.conf` 를 하고,
  **sshd 는 각 키워드의 '첫 번째' 값을 채택**한다. 드롭인이 본 파일을 이기므로
  `sshd_config` 를 직접 sed 해도 무시된다. Debian 13 은 `ssh.socket` 활성화라 재시작도 어긋난다.
- **해결**: 드롭인으로, 가장 먼저 읽히도록 `00-` 접두사를 붙여 박는다.
  ```bash
  CTID=210 bash fix-ssh-root.sh
  CTID=210 PUBKEY=/root/id_ed25519.pub bash fix-ssh-root.sh   # 키 주입 = 근본 해결
  ```
- **확인**: `pct exec <CTID> -- sshd -T | grep -Ei 'permitrootlogin|passwordauthentication'`
- IP 를 재사용한 경우라면 맥에서 `ssh-keygen -R <CT-IP>` 도 확인.

### B. 스크립트가 프롬프트도 없이 멈춤

- **증상**: `ssh root@host 'bash 02-...sh'` 가 "VNC 비밀번호 설정" 에서 입력창도 없이 정지.
- **원인**: `ssh host '명령'` 은 **의사 TTY 를 만들지 않는다.** bash 의 `read -p` 는
  **stdin 이 터미널일 때만** 프롬프트를 표시하고, ssh 채널은 열린 채 데이터가 안 와 블록된다.
- **해결**: `ssh -t` 를 쓰거나, 환경변수로 값을 넘긴다.
  ```bash
  ssh -t root@<CT-IP> 'bash /opt/tnsync-src/deploy/02-container-desktop.sh'
  ssh root@<CT-IP> 'VNC_PASSWORD=xxxxxxxx bash .../02-container-desktop.sh'
  ssh root@<CT-IP> 'TODOIST_TOKEN=xxx    bash .../03-tnsync-install.sh'
  CT_PASSWORD=xxxxx bash 01-host-create-lxc.sh
  ```
  스크립트는 환경변수 우선 → `/dev/tty` 직접 읽기 → 둘 다 없으면 **멈추지 않고 즉시 안내 후 종료**로 고쳤다.
- **어느 스크립트가 `-t` 를 요구하는가**(입력을 받는 것만):

  | 스크립트 | `-t` | 비대화식 대안 |
  |---|---|---|
  | `01-host-create-lxc.sh` | 호스트에서 직접 실행 시 불필요 | `CT_PASSWORD=xxxxx` |
  | `02-container-desktop.sh` | **필요** (VNC 비밀번호) | `VNC_PASSWORD=xxxxxxxx` |
  | `03-tnsync-install.sh` | **필요** (Todoist 토큰) | `TODOIST_TOKEN=xxx` |
  | `04-add-novnc.sh` | **필요** (VNC 비밀번호) | `VNC_PASSWORD=xxxxxxxx` |
  | `05` / `06` / `fix-ssh-root` / `diagnose-gui` | 불필요 (입력 없음) | — |

### C. VNC 연결은 되는데 macOS 화면 공유가 실패

- **증상**: SSH 터널은 정상, 서버도 응답하는데 macOS 화면 공유가 붙지 못함.
- **원인**: **Apple 클라이언트는 무인증(SecurityTypes None) VNC 서버에 접속하지 못한다.**
  localhost 바인딩이라 비밀번호가 불필요해 보여도 그렇다.
- **해결**: localhost 바인딩이어도 **항상 VncAuth(비밀번호)** 를 쓴다.
- **진단**(터널 열어둔 채 맥에서):
  ```bash
  printf 'RFB 003.008\n' | nc -w 4 127.0.0.1 5901 | xxd | head -1
  # ...0101 → 보안타입 1개 = None  (macOS 접속 불가)
  # ...0102 → VncAuth                (정상)
  ```
  TigerVNC / RealVNC Viewer 는 None 도 지원하므로 대안이 된다.

### D. 검정 화면 ① — `libasound.so.2` 없음

- **증상**: VNC 접속은 되는데 완전 검정. `journalctl -u obsidian` 에
  `error while loading shared libraries: libasound.so.2` + `status=127` 무한 재시작.
- **원인**: **Obsidian `.deb` 가 Electron 런타임 의존성을 전부 선언하지 않는다.**
  `libasound2` 가 `Depends` 에 없어 apt 가 설치하지 않는다.
  Debian 13 은 t64 전환으로 패키지명이 **`libasound2t64`** 다.
- **해결**: `05-fix-obsidian-deps.sh` — t64/구명칭을 순차 시도해 설치하고 `ldd` 로 미해결 심볼 검사.
  (`02` 에도 반영됨)
- **부수 현상**: 프로세스 목록에 Openbox 도 없었다. `obsidian-session` 이 openbox 를 백그라운드로
  띄우고 `exec obsidian` 하는데, Obsidian 이 즉사하면 systemd 가 **cgroup 째 정리**하며 openbox 도 죽인다.

### E. 검정 화면 ② — `Failed to get 'userData' path`

- **증상**: 커서는 보이는데 여전히 검정. 로그에 `Failed to get 'userData' path` + `status=133`.
  `xwininfo -root -children` 결과가 `0 children`.
- **원인**: Electron 은 userData 를 `$XDG_CONFIG_HOME` 또는 `$HOME/.config` 아래에 만든다.
  `HOME` 이 없거나 그 아래가 쓰기 불가면 창을 띄우기 전에 죽는다. 후보 두 가지:
  (a) `/home/tnsync` 하위 소유권이 root 로 남음  (b) 유닛/런처에 `HOME` 미명시
- **해결**: `06-fix-obsidian-home.sh` — 소유권 보정 후 **실제로 사용자 권한으로 써 보고 검증**,
  유닛·런처에 `HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` 명시,
  추가로 **`--user-data-dir` 을 명시**해 경로 추론에 아예 의존하지 않게 한다. (`02` 에도 반영됨)

### F. 컨테이너에 `sudo` 가 없다

- **증상**: 진단 스크립트가 `sudo: 그런 파일이나 디렉터리가 없습니다` 로 실패.
  X 서버는 정상인데 "X 접속 실패" 로 오진하게 만든다.
- **원인**: Debian 최소 컨테이너에는 `sudo` 패키지가 없다.
- **해결**: util-linux 의 **`runuser -u <user> --`** 를 쓴다(항상 존재).
  단 `runuser` 는 `-l` 없이는 환경을 갈아끼우지 않아 **`HOME=/root` 인 채로 실행된다.**
  Electron·pip 등을 수동 실행할 때는 `env HOME=/home/tnsync` 를 함께 준다.
  → `03-tnsync-install.sh` 의 venv/pip/doctor 도 전부 이 문제에 걸렸을 것이므로 함께 교체함.

### 필수 Electron 플래그 정리

```
--no-sandbox                unprivileged LXC 에서 chrome SUID 샌드박스가 초기화되지 않음
--disable-gpu               GPU 패스스루 없음 (+ LIBGL_ALWAYS_SOFTWARE=1)
--disable-dev-shm-usage     컨테이너 /dev/shm 이 작아 렌더러 크래시
--user-data-dir=<경로>       userData 경로 추론 실패 방지 (§4-E)
dbus-run-session --         세션 D-Bus 없으면 시작 시 에러/지연
```

`fonts-noto-cjk` + `ko_KR.UTF-8` 도 필수. 없으면 한글이 □ 로 보이고,
로케일이 POSIX 면 한글 **파일명** 처리에서 문제가 생길 수 있다.

---

## 5. 로그와 상태 확인

```bash
journalctl -u tnsync -f                    # 실시간
journalctl -u tnsync -n 50 --no-pager      # 최근 50줄
journalctl -u tnsync -p warning            # 경고/에러만
journalctl -u obsidian -n 40 -o cat        # GUI 쪽
systemctl status tnsync xvnc obsidian novnc
```

### 정상일 때 로그는 조용하다

`engine.run_once()` 에는 **사이클마다 찍는 로그가 없다.** 시작 시 한 줄만 나온다:

```
14:23:01 INFO 동기화 루프 시작 (interval=120s, dry=False)
```

이후 침묵은 **변경이 없어서 정상**인 것이지 멈춘 게 아니다. 변경이 있을 때만 찍힌다:

```
Todoist→TN create: 회의록 정리        TN→Todoist update: 보고서 초안
link by title: 주간회의 준비           Todoist deleted → TN archive: 지난 작업
conflict '문서 검토' → newest wins
```

주의해서 볼 줄:

```
⚠️ TN 삭제 후보 12건 > 상한 5 → 대량삭제로 판단, 삭제 보류
cycle error: ...                              ← 사이클 실패(루프는 유지됨)
Todoist 무료 플랜: deadline 미지원 → deadline 동기화 비활성화
```

### 로그가 조용할 때 살아있는지 확인

```bash
systemctl show tnsync -p ActiveEnterTimestamp -p NRestarts --value   # NRestarts 0 이어야 정상
ls -l --time-style=full-iso /home/tnsync/.local/share/tnsync/state.sqlite3
$P doctor    # vault: <경로> (tasks=N) / Todoist: 연결 OK, 프로젝트 N개 ✓
```

**`state.sqlite3` 가 없다 = 아직 한 번도 돌지 않았다.** 첫 사이클에 생성된다.
`03` 을 안 돌렸거나, 돌렸지만 `systemctl start tnsync` 를 안 한 것이다
(`03` 은 의도적으로 `enable` 만 한다).

---

## 6. 스크립트 목록 (`source/deploy/`)

| 파일 | 실행 위치 | 역할 |
|---|---|---|
| `01-host-create-lxc.sh` | Proxmox 호스트 | 템플릿 확보, `pct create`, 부팅, sshd, 공개키 주입 |
| `02-container-desktop.sh` | 컨테이너 | Xvnc + Openbox + Obsidian + 런타임 라이브러리 + 유닛 |
| `03-tnsync-install.sh` | 컨테이너 | venv, config(토큰), `tnsync.service` 등록 |
| `04-add-novnc.sh` | 컨테이너 | 브라우저 접속용 noVNC(websockify) |
| `05-fix-obsidian-deps.sh` | 컨테이너 | §4-D 사후 수정 (`02` 에 이미 반영) |
| `06-fix-obsidian-home.sh` | 컨테이너 | §4-E 사후 수정 (`02` 에 이미 반영) |
| `fix-ssh-root.sh` | Proxmox 호스트 | §4-A 사후 수정 (`01` 에 이미 반영) |
| `diagnose-gui.sh` | 컨테이너 | 검정 화면 원인 진단 (유닛·로그·경로·창·수동실행) |

> `05`·`06`·`fix-ssh-root` 는 원래 `01`/`02` 에 있어야 할 내용을 사후에 때운 것이다.
> 이미 본편에 반영했으므로 **새로 만드는 컨테이너는 `01`→`02`→(`04`)→`03` 만으로 끝난다.**
> 상황이 정리되면 정리·삭제해도 된다.

---

## 7. 재부팅 후 동작

컨테이너·호스트를 재시작해도 **다시 해줄 것은 없다.**

| 항목 | 근거 |
|---|---|
| 컨테이너 자동 시작 | `pct create --onboot 1` |
| `xvnc` / `obsidian` / `novnc` | `systemctl enable --now` |
| `tnsync` | `03` 이 `enable` |
| Obsidian 로그인·Sync 설정 | `~/.config/obsidian` 에 저장 → 재로그인 불필요 |
| VNC 비밀번호 · config · 토큰 | 파일로 존속 |

```bash
pct config <CTID> | grep onboot                    # onboot: 1
systemctl is-enabled xvnc obsidian novnc tnsync    # 전부 enabled
```

### 부팅 직후 경합 — 첫 사이클을 늦춰야 한다

`After=obsidian.service` 는 **Obsidian 프로세스가 떴다**는 뜻일 뿐,
**Obsidian Sync 가 vault 를 다 받았다**는 뜻이 아니다. 부팅 직후 vault 가 비었거나 일부만 있는 상태로
첫 사이클이 돌면 엔진이 "TN 에서 파일이 삭제됐다"고 오판해 Todoist 쪽을 지우려 할 수 있다.
`max_deletes: 5` 가 상한을 걸지만 방어선 하나에만 의존할 이유는 없다.

```ini
# /etc/systemd/system/tnsync.service.d/10-startup-delay.conf
[Service]
ExecStartPre=/bin/sleep 180
TimeoutStartSec=300      # ExecStartPre 도 TimeoutStartSec(기본 90초)에 걸린다 → 지연보다 크게
```

```bash
systemctl daemon-reload && systemctl cat tnsync | tail -8
```

> `TimeoutStartSec` 를 안 늘리면 `sleep 180` 이 기본 타임아웃 90초에 걸려
> 서비스가 시작 실패로 죽는다. `03` 에는 반영돼 있다.

## 8. 운영

| | |
|---|---|
| 코드 갱신 | 맥에서 rsync → `systemctl restart tnsync` |
| 화면이 굳음 | `systemctl restart obsidian` |
| RAM 부족 | `pct set <CTID> --memory 3072` |
| 백업 | Proxmox `vzdump`. **`state.sqlite3` 포함 여부 확인**(매핑 원본) |

### 주의점

- **Obsidian Sync 지연 vs 폴링 주기**: Obsidian 이 파일을 쓰는 중 데몬이 같은 파일을 쓰면
  충돌 사본이 생길 수 있다. 그래서 120초. 충돌 파일이 보이면 더 늘린다.
- **시간대**: 컨테이너 TZ 를 `Asia/Seoul` 로. 날짜 정규화가 여기에 달려 있다.
- **noVNC 는 평문 HTTP**: 신뢰하는 LAN 전용. 외부에서 쓸 일이 있으면
  `NOVNC_BIND=127.0.0.1` 로 실행해 SSH 터널로만 연다. vault 화면이 그대로 보이는 통로다.
- **동시 실행 금지**: 맥북 launchd 를 반드시 정지.

---

## 9. 체크리스트

- [ ] `01` 로 컨테이너 생성, IP 확보, root SSH 접속 확인 (§4-A)
- [ ] 소스 rsync → `/opt/tnsync-src`
- [ ] `02` 실행 (**`ssh -t`**, §4-B) — VNC 비밀번호 설정
- [ ] VNC/noVNC 접속해 **Obsidian 창이 실제로 뜨는지** 확인 (§4-C/D/E)
- [ ] Obsidian 로그인 → Sync → vault 를 `/home/tnsync/CASE` 로 받고 **완료 확인**
- [ ] `03` 실행 → `doctor` → `once --dry-run`(건수 확인) → `once`
- [ ] `systemctl start tnsync` → 로그 확인
- [ ] 맥북 launchd 정지
- [ ] `vzdump` 백업 스케줄 확인

관련: [[todoist-sync-raspberry-pi|Todoist 동기화 라즈베리파이 이전]] · [[todoist-sync-install|Todoist 동기화 설치와 CLI]] · [[todoist-sync-troubleshooting|Todoist 동기화 트러블슈팅]] · [[todoist-sync-config|Todoist 동기화 설정 레퍼런스]]
