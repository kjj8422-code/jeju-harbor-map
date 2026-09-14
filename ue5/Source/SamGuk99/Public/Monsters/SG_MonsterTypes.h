// Copyright 삼국지 99일 생존. 전투 코어 — 몬스터 공용 데이터 타입
#pragma once

#include "CoreMinimal.h"
#include "Engine/DataTable.h"
#include "SG_MonsterTypes.generated.h"

class ASG_BaseMonster;

/** 몬스터 등급 — 일반 / 정예 / 보스 */
UENUM(BlueprintType)
enum class ESGMonsterGrade : uint8
{
	Normal UMETA(DisplayName = "일반"),
	Elite  UMETA(DisplayName = "정예"),
	Boss   UMETA(DisplayName = "보스")
};

/** 몬스터 AI 상태 머신 */
UENUM(BlueprintType)
enum class ESGMonsterState : uint8
{
	Pooled     UMETA(DisplayName = "풀에서 대기"),   // 화면 밖, 틱 꺼짐
	Seeking    UMETA(DisplayName = "타겟 탐색"),     // ① 누구를 칠지 고른다
	Chasing    UMETA(DisplayName = "추적"),          // ② 거기까지 간다
	Attacking  UMETA(DisplayName = "공격"),          // ③ 애니메이션 타이밍에 맞춰 때린다
	Breaching  UMETA(DisplayName = "목책 파괴"),     // 길이 완전히 막혔을 때
	Staggered  UMETA(DisplayName = "경직"),
	Dead       UMETA(DisplayName = "사망")
};

/**
 * 몬스터 한 마리의 능력치 골격.
 * 값은 전부 에디터에서 조정합니다. 코드를 고치지 않고 밸런싱할 수 있어야 합니다.
 */
USTRUCT(BlueprintType)
struct SAMGUK99_API FSGMonsterStats
{
	GENERATED_BODY()

	/** 최대 체력 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Stats")
	float MaxHealth = 100.f;

	/** 한 번 때릴 때의 피해량 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Stats")
	float AttackDamage = 10.f;

	/** 공격 사거리(cm). 대상 몸집 반지름은 따로 빼서 계산합니다. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Stats")
	float AttackRange = 180.f;

	/** 타격 판정 구체의 반지름(cm) — 애니메이션 타격 프레임에 이 크기로 쓸어 담습니다 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Stats")
	float AttackSweepRadius = 60.f;

	/** 공격 후 다음 공격까지 쉬는 시간(초) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Stats")
	float AttackCooldown = 1.2f;

	/** 이동 속도(cm/s) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Stats")
	float MoveSpeed = 300.f;

	/** 타겟을 찾아보는 반경(cm). 이 밖에 있으면 거점으로 직행합니다. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Stats")
	float DetectRadius = 1200.f;

	/** 처치 시 주는 옥새 조각 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Stats")
	int32 ShardReward = 1;
};

/**
 * 웨이브 한 줄에 들어가는 "스폰 묶음" 하나.
 * 예: "황건적 졸개를 동쪽에서 0.25초 간격으로 10마리".
 */
USTRUCT(BlueprintType)
struct SAMGUK99_API FSGSpawnGroup
{
	GENERATED_BODY()

	/** 어떤 몬스터를 뽑을지 (블루프린트 클래스) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave")
	TSoftClassPtr<ASG_BaseMonster> MonsterClass;

	/** 몇 마리 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "0"))
	int32 Count = 1;

	/** 이 묶음만의 능력치 배율 (같은 몬스터를 후반 웨이브에 강화해 재사용할 때) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "0.1"))
	float StatMultiplier = 1.f;

	/** 스폰 지점 인덱스 — 스포너에 등록된 지점 배열의 순번 (0=동, 1=북, 2=남, 3=서) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave")
	int32 SpawnPointIndex = 0;

	/** 한 마리씩 나오는 간격(초). 0이면 동시에 쏟아집니다(프레임 끊김 주의). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "0.0"))
	float SpawnInterval = 0.25f;

	/** 이 묶음이 나오기 전 대기 시간(초) — 2차 파도를 만들 때 씁니다 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "0.0"))
	float StartDelay = 0.f;
};

/**
 * ★ 데이터 테이블 한 줄 = 하루치 웨이브.
 * 이 표만 고치면 몬스터 구성과 수가 바뀝니다. C++를 다시 컴파일할 필요가 없습니다.
 * 행 이름(Row Name)은 "Day11"처럼 짓습니다.
 */
USTRUCT(BlueprintType)
struct SAMGUK99_API FSGWaveRow : public FTableRowBase
{
	GENERATED_BODY()

	/** 몇 일차에 오는 웨이브인가 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave")
	int32 Day = 11;

	/** 화면에 띄울 이름 — "황건적의 습격" */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave")
	FText WaveName;

	/** 부제 — "튜토리얼 웨이브 · 소수 약체" */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave")
	FText WaveNote;

	/** 이 웨이브를 구성하는 스폰 묶음들 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave")
	TArray<FSGSpawnGroup> Groups;

	/** 웨이브 전체 배율 — 명성 시스템(장수 등급이 높을수록 더 강하게 몰려옴)이 여기 곱해집니다 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "0.1"))
	float WaveStatScale = 1.f;

	/** 공격 방향 예고를 몇 초 전에 띄울지 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "0.0"))
	float TelegraphSeconds = 5.f;
};
