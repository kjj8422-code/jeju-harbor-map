// Copyright 삼국지 99일 생존. 전투 코어 — 일차별 웨이브 스포너
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Monsters/SG_MonsterTypes.h"
#include "SG_WaveSpawner.generated.h"

class ASG_BaseMonster;
class USG_MonsterPool;
class UDataTable;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FSGOnWaveTelegraph, int32, Day, const FSGWaveRow&, WaveRow);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FSGOnWaveStarted, int32, Day, int32, TotalMonsters);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FSGOnMonsterKilled, ASG_BaseMonster*, Monster, AActor*, Killer, int32, RemainingCount);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FSGOnWaveCleared, int32, Day);

/**
 * ★ 데이터 테이블만 바꾸면 웨이브 구성이 바뀌는 스포너.
 *
 * 레벨에 하나 놓고, WaveTable에 데이터 테이블을 물리고,
 * SpawnPoints 배열에 스폰 지점 액터들을 순서대로 넣으면 끝입니다.
 *
 * 게임의 낮/밤 로직이 StartWaveForDay(11)을 부르면:
 *   1) 표에서 Day == 11 인 줄을 찾습니다
 *   2) 예고 시간(TelegraphSeconds)만큼 화살표를 띄울 수 있게 신호를 쏩니다
 *   3) 예고가 끝나면 묶음별로 정해진 간격으로 몬스터를 풀에서 꺼내 세웁니다
 *   4) 전멸하면 OnWaveCleared 를 쏩니다 → 게임은 다음 날로 넘어갑니다
 *
 * 33일까지 만들다가 99일로 늘릴 때, C++는 한 줄도 안 고칩니다. 표에 줄만 추가합니다.
 */
UCLASS()
class SAMGUK99_API ASG_WaveSpawner : public AActor
{
	GENERATED_BODY()

public:
	ASG_WaveSpawner();

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	//──────────────────────────────────────────────────────────────
	// 게임 쪽에서 부르는 함수
	//──────────────────────────────────────────────────────────────

	/** 해당 일차의 웨이브를 시작합니다. 표에 그 일차가 없으면 false를 돌려줍니다. */
	UFUNCTION(BlueprintCallable, Category = "SG|Wave")
	bool StartWaveForDay(int32 Day);

	/** 진행 중인 웨이브를 강제 종료하고 전부 풀로 돌려보냅니다 (패배·재시작 시) */
	UFUNCTION(BlueprintCallable, Category = "SG|Wave")
	void AbortWave();

	/** 아직 살아 있는 몬스터 수 */
	UFUNCTION(BlueprintPure, Category = "SG|Wave")
	int32 GetAliveCount() const { return AliveMonsters.Num(); }

	UFUNCTION(BlueprintPure, Category = "SG|Wave")
	bool IsWaveActive() const { return bWaveActive; }

	/**
	 * 명성 시스템 배율.
	 * 등급 높은 장수를 골랐을 때 몬스터가 더 강하게 몰려오도록 게임 시작 시 설정합니다.
	 * (여포 = 1.15, 요화 = 0.90)
	 */
	UFUNCTION(BlueprintCallable, Category = "SG|Wave")
	void SetGlobalStatScale(float NewScale) { GlobalStatScale = FMath::Max(0.1f, NewScale); }

	/** 게임 시작 시 한 번 — 표에 등장하는 모든 몬스터를 미리 만들어 둡니다 */
	UFUNCTION(BlueprintCallable, Category = "SG|Wave")
	void PrewarmAllWaves();

	//──────────────────────────────────────────────────────────────
	// 신호 — UI와 게임 로직이 구독합니다
	//──────────────────────────────────────────────────────────────

	/** 예고 시작 — "공격 방향: 동쪽" 화살표를 띄울 때 */
	UPROPERTY(BlueprintAssignable, Category = "SG|Wave")
	FSGOnWaveTelegraph OnWaveTelegraph;

	/** 실제 스폰 시작 */
	UPROPERTY(BlueprintAssignable, Category = "SG|Wave")
	FSGOnWaveStarted OnWaveStarted;

	/** 한 마리 죽을 때마다 — 웨이브 리포트(함정 처치 비율 등) 집계에 씁니다 */
	UPROPERTY(BlueprintAssignable, Category = "SG|Wave")
	FSGOnMonsterKilled OnMonsterKilled;

	/** 전멸 — 다음 날로 넘어가는 신호 */
	UPROPERTY(BlueprintAssignable, Category = "SG|Wave")
	FSGOnWaveCleared OnWaveCleared;

protected:
	/** 예고가 끝나고 실제 스폰을 시작 */
	void BeginSpawning();

	/** 묶음 하나에서 한 마리 꺼내기 (타이머가 반복 호출) */
	void SpawnOneFromGroup(int32 GroupIndex);

	/** 몬스터 사망 콜백 */
	UFUNCTION()
	void HandleMonsterDied(ASG_BaseMonster* Monster, AActor* Killer);

	/** 표에서 일차로 줄 찾기 */
	const FSGWaveRow* FindWaveRow(int32 Day) const;

	USG_MonsterPool* GetPool() const;

	FTransform GetSpawnTransform(int32 SpawnPointIndex) const;

protected:
	//──────────────────────────────────────────────────────────────
	// 에디터에서 물리는 것
	//──────────────────────────────────────────────────────────────

	/** ★ 일차별 웨이브 표. 행 구조는 FSGWaveRow. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave")
	TObjectPtr<UDataTable> WaveTable;

	/** 스폰 지점들. 배열 순서가 FSGSpawnGroup.SpawnPointIndex 와 맞습니다 (0=동, 1=북, 2=남, 3=서) */
	UPROPERTY(EditInstanceOnly, BlueprintReadWrite, Category = "SG|Wave")
	TArray<TObjectPtr<AActor>> SpawnPoints;

	/** 스폰 지점 주변으로 흩뿌리는 반경(cm) — 한 점에 겹쳐 나오면 서로 밀치느라 난리가 납니다 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "0.0"))
	float SpawnScatterRadius = 400.f;

	/** 명성 시스템 배율 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "0.1"))
	float GlobalStatScale = 1.f;

	/** 미리 만들어 둘 때 표상의 최대 수보다 몇 배 여유를 둘지 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Wave", meta = (ClampMin = "1.0"))
	float PrewarmHeadroom = 1.2f;

private:
	UPROPERTY()
	TArray<TObjectPtr<ASG_BaseMonster>> AliveMonsters;

	/** 지금 진행 중인 웨이브 정보 */
	FSGWaveRow CurrentWave;
	int32 CurrentDay = 0;
	bool bWaveActive = false;

	/** 묶음별로 몇 마리 냈는지 */
	TArray<int32> GroupSpawnedCount;
	int32 TotalToSpawn = 0;
	int32 TotalSpawned = 0;

	FTimerHandle TelegraphTimer;
	TArray<FTimerHandle> GroupTimers;
};
