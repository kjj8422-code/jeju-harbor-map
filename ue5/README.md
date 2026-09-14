# 삼국지 99일 생존 — UE5 전투 코어

밤 웨이브 방어의 전투 코어입니다. **몬스터 클래스 구조 + 오브젝트 풀링 + 데이터 테이블 스포너 +
AI 3단계 + 보스 페이즈**를 담고 있습니다. 그대로 복사해 쓰면 됩니다.

> ⚠️ 이 코드는 **컴파일 검증을 받지 않았습니다.** 이 작업 환경에는 언리얼 엔진이 없습니다.
> UE 5.3~5.5 기준으로 작성했고, 처음 빌드할 때 헤더 경로나 API 이름에서 한두 개 걸릴 수 있습니다.
> 에러가 나면 그 문구를 그대로 저에게 주세요. 바로 고쳐 드립니다.

---

## 1. 뭐가 들어 있나

| 파일 | 역할 | 요청 항목 |
|---|---|---|
| `SG_MonsterTypes.h` | 능력치·웨이브 표의 데이터 구조 | ③ |
| `SG_BaseMonster.h/.cpp` | **모든 몬스터의 부모** — 상태머신·풀링·타격감 | ①②④ |
| `SG_EliteMonster.h/.cpp` | 정예 — 돌진 + 재료 드랍 | ① |
| `SG_BossMonster.h/.cpp` | 보스 — 페이즈 전환 + 광역 공격 | ⑤ |
| `SG_MonsterPool.h/.cpp` | 오브젝트 풀 | ② |
| `SG_WaveSpawner.h/.cpp` | 일차별 스포너 | ③ |
| `SG_AnimNotify_AttackHit.h/.cpp` | **애니메이션 타이밍 타격 판정** | ④ |
| `SG_Targetable.h` / `SG_TargetRegistry.h/.cpp` | 타겟 명부 (장수·병사·거점·목책) | ④ |
| `SG_MonsterShowroom.h/.cpp` | 에셋·모션 검수용 쇼룸 | (추가) |
| `Data/WaveTable_9대대란.json` | 9대 대란 웨이브 표 | ③ |

## 1-1. ⚠️ 먼저 확인 — 이 코드가 전제하는 것

| 항목 | 이 코드 | 다른 선택을 하셨다면 |
|---|---|---|
| 엔진 버전 | **UE 5.3 ~ 5.5** | 5.6/5.7 이면 API가 일부 바뀌어 수정이 필요합니다. 에러 문구를 주시면 고쳐 드립니다 |
| 프로젝트 형태 | **C++ 프로젝트** | 블루프린트 전용 프로젝트에는 이 코드를 넣을 곳이 없습니다 (2-1 참고) |

`VibeUE-working-agreement.md` 의 워크플로(UE 5.7 + VibeUE MCP)를 쓰실 계획이라면 **두 가지가 충돌합니다**:

1. 그 문서는 **5.7** 기준입니다 — 이 코드는 5.5 기준으로 작성됐습니다
2. 그 문서는 **"C++ 모듈 없는 블루프린트 전용"** 프로젝트를 전제합니다 — 이 전투 코어는 C++입니다

→ 선택지는 셋입니다.
   - **(가)** C++ 프로젝트로 가고 이 코드를 그대로 쓴다 (전투 코어가 튼튼하고 성능이 좋습니다)
   - **(나)** 블루프린트 전용으로 가고 전투 코어를 블루프린트로 다시 만든다 (VibeUE 워크플로와 맞습니다)
   - **(다)** 블루프린트 프로젝트에 C++ 모듈을 추가한다 (둘 다 쓰지만 설정이 늘어납니다)

무엇을 고르든 **기획서의 수치와 구조(웨이브 표·풀링·AI 3단계·보스 페이즈)는 그대로 옮겨집니다.**
버리는 건 문법뿐입니다.

## 2. 설치 (처음 한 번)

### 2-1. C++ 프로젝트 만들기
언리얼 에디터 → 새 프로젝트 → **Games → Blank** → 우측 상단 **C++** 선택 → 프로젝트 이름 `SamGuk99`

> 블루프린트 프로젝트로 만들면 C++ 파일을 넣을 곳이 없습니다. 반드시 C++로 만드세요.
> (이미 블루프린트로 만들었다면: 에디터 메뉴 → Tools → New C++ Class 를 한 번 만들면 C++ 프로젝트로 바뀝니다)

### 2-2. 파일 복사
이 폴더의 `Source/SamGuk99/` 안 내용을 프로젝트의 같은 위치에 통째로 덮어씁니다.

```
내프로젝트/
  SamGuk99.uproject
  Source/
    SamGuk99/
      SamGuk99.Build.cs      ← 여기 있는 걸로 교체
      Public/  Private/      ← 여기 있는 걸 복사
```

### 2-3. 컴파일
`.uproject` 우클릭 → **Generate Visual Studio project files** → `.sln` 열고 빌드
(맥은 Xcode). 또는 에디터가 켜져 있으면 **Compile** 버튼.

## 3. 몬스터 한 마리 만들기

### 3-1. 블루프린트 만들기
콘텐츠 브라우저 우클릭 → Blueprint Class → 우측 **All Classes** 검색창에 `SG_BaseMonster`
→ 이름 `BP_Grunt` (황건적 졸개)

정예는 부모를 `SG_EliteMonster`, 보스는 `SG_BossMonster` 로 고릅니다.

### 3-2. 겉모습 붙이기
BP 열고 → 좌측 컴포넌트에서 **Mesh** 선택 → 우측 Skeletal Mesh 에 캐릭터 모델 지정
→ Anim Class 에 애니메이션 블루프린트 지정

### 3-3. 능력치 넣기
BP의 **Class Defaults** → `SG|Stats` 카테고리:

| 항목 | 졸개 예시 | 뜻 |
|---|---|---|
| Max Health | 34 | 체력 |
| Attack Damage | 6 | 한 대 피해 |
| Attack Range | 180 | 사거리(cm) |
| Attack Cooldown | 1.1 | 공격 간격(초) |
| Move Speed | 300 | 이동 속도(cm/s) |
| Detect Radius | 1200 | 이 안의 장수·병사를 먼저 노림 |

`SG|Feel` 카테고리에서 타격감도 잡습니다: **Poise**(경직저항)는 졸개 0, 정예 25, 보스 9999.

### 3-4. ★ 공격 몽타주에 타격 판정 찍기 — 이게 제일 중요합니다
1. 공격 애니메이션 우클릭 → **Create → AnimMontage**
2. 몽타주를 열고, 타임라인의 **Notifies** 줄을 우클릭
3. **Add Notify → SG Attack Hit (타격 판정)** 선택
4. 그 노티파이를 **칼이 실제로 몸에 닿는 프레임**으로 끌어다 놓습니다
5. 노티파이를 클릭해 `Hit Tag` 확인 — 기본 공격은 `Melee`, 보스 광역은 `Slam`, 정예 돌진은 `Charge`
6. BP의 Class Defaults → `SG|Anim` → **Attack Montage** 에 이 몽타주를 지정

> 이걸 안 하면 몬스터가 칼을 휘두르는데 아무 일도 안 일어납니다. 반대로 아무 데나 찍으면
> 칼을 뽑기도 전에 피가 닳아서 "때린 것 같지 않은" 느낌이 납니다.

## 4. 웨이브 표 만들기

1. 콘텐츠 브라우저 우클릭 → **Miscellaneous → Data Table**
2. Row Structure 에 **SGWaveRow** 선택 → 이름 `DT_WaveTable`
3. `Data/WaveTable_9대대란.json` 을 콘텐츠 브라우저로 **끌어다 놓으면** 9개 웨이브가 한 번에 들어옵니다
4. JSON 안의 `MonsterClass` 경로를 **본인 블루프린트 경로**로 고쳐야 합니다
   (BP 우클릭 → Copy Reference 로 경로를 얻고, 끝에 `_C` 를 붙입니다)

> 표를 고치는 가장 쉬운 방법은 에디터에서 `DT_WaveTable` 을 더블클릭해 직접 수정하는 겁니다.
> **몬스터 수나 구성을 바꿀 때 C++를 다시 컴파일할 필요가 전혀 없습니다.**

## 5. 레벨에 놓기

1. 레벨에 **SG_WaveSpawner** 를 하나 끌어다 놓습니다
2. Details → `Wave Table` 에 `DT_WaveTable` 지정
3. `Spawn Points` 배열에 스폰 지점 액터를 **순서대로** 넣습니다 — 0=동, 1=북, 2=남, 3=서
   (빈 액터나 TargetPoint 를 지도 가장자리에 4개 놓으면 됩니다)
4. **NavMeshBoundsVolume** 을 지도 전체에 덮습니다 → Details → Runtime Generation 을 **Dynamic**

> ★ Runtime Generation 을 Dynamic 으로 해야 **플레이어가 목책을 세울 때 몬스터가 실제로 우회**합니다.
> Static 으로 두면 몬스터가 벽을 뚫고 지나가거나 벽 앞에서 멈춰 섭니다.

## 6. 장수·병사·거점을 타겟으로 등록하기

몬스터가 노릴 대상들은 `SG_Targetable` 인터페이스를 구현하고 명부에 이름을 올려야 합니다.

1. 장수/병사/거점/목책 블루프린트 → Class Settings → **Implemented Interfaces → Add → SG Targetable**
2. 4개 함수를 구현합니다
   - `Is Valid Target` → 살아 있으면 true
   - `Get Target Priority` → 장수는 Hero, 병사는 Soldier, 거점은 Base, 목책은 Structure
   - `Get Target Location` → 보통 GetActorLocation
   - `Get Target Footprint Radius` → **몸집 반지름**. 장수는 40 정도, **거점처럼 큰 건물은 실제 크기의 절반**
3. BeginPlay 에서 `Get World Subsystem (SG Target Registry)` → `Register Target(self)`
4. 죽거나 파괴될 때 `Unregister Target(self)`

> ★ `Get Target Footprint Radius` 를 0으로 두면 **몬스터가 거점 벽에 붙어도 "아직 멀다"고 판단해
> 영원히 공격을 시작하지 않습니다.** 유닛이 코앞에서 맴도는 버그의 99%가 이것 때문입니다.

## 7. 게임에 연결하기

게임모드나 레벨 블루프린트에서:

```
BeginPlay
  → Get Actor Of Class (SG_WaveSpawner)
  → Prewarm All Waves          // 로딩 중에 몬스터를 미리 만들어 둡니다
  → Set Global Stat Scale      // 장수 등급 배율 (여포 1.15 / 요화 0.90)

밤이 되면
  → Start Wave For Day (현재 일차)

스포너의 신호를 구독
  → On Wave Telegraph  : "공격 방향: 동쪽" 화살표 UI 띄우기
  → On Wave Started    : 밤 BGM 재생, 조명 어둡게
  → On Monster Killed  : 처치 수 집계 (누가 잡았는지도 넘어옵니다 → 함정 처치 비율)
  → On Wave Cleared    : 웨이브 리포트 띄우고 다음 날로
```

## 8. 쇼룸으로 검수하기

빈 레벨을 하나 만들고 **SG_MonsterShowroom** 을 놓습니다.
`Monster Classes` 에 검수할 몬스터들을, `Test Montages` 에 확인할 몽타주들을 넣습니다.

플레이 중 물결표(`~`)로 콘솔을 열고:

| 명령어 | 하는 일 |
|---|---|
| `ShowroomNext` | 다음 몬스터로 교체 |
| `ShowroomPlayMontage 0` | 0번 몽타주 재생 |
| `ShowroomHit 30` | 30 피해를 먹여 피격 반응·히트스톱 확인 |
| `ShowroomReset` | 처음 상태로 |

## 9. 처음 돌려볼 때 확인할 것

- [ ] 웨이브가 시작되면 몬스터가 스폰 지점에서 나온다
- [ ] 몬스터가 거점 쪽으로 **길을 따라** 이동한다 (벽을 뚫지 않는다)
- [ ] 장수가 근처에 가면 몬스터가 장수를 먼저 노린다
- [ ] 사거리에 들어오면 공격 모션이 나온다
- [ ] **칼이 닿는 순간에** 피가 닳는다 (모션 시작과 동시가 아니라)
- [ ] 맞으면 히트스톱·넉백·경직이 보인다
- [ ] 거점을 목책으로 완전히 둘러싸면 몬스터가 목책을 때린다
- [ ] 전멸하면 `On Wave Cleared` 가 불린다
- [ ] **두 번째 웨이브의 몬스터가 첫 웨이브와 똑같이 정상 동작한다** ← 풀링이 제대로 됐는지
- [ ] 보스 체력이 줄면 페이즈가 바뀌고 광역 공격이 나온다

마지막 항목이 가장 중요합니다. 풀링 버그는 **2회차부터** 나타납니다.

## 10. 성능 확인

콘솔에 `stat fps`, `stat unit`, `stat game` 을 칩니다.
몬스터 30마리가 동시에 있을 때 프레임이 떨어지면:

- 몬스터 BP의 `AI Think Interval` 을 0.1 → 0.15 로 올립니다 (판단 횟수 감소)
- 몬스터끼리 서로 밀치지 않게 캡슐 콜리전 프리셋을 조정합니다
- `Prewarm` 수를 늘려 전투 중 새로 만드는 일이 없게 합니다
