// Copyright 삼국지 99일 생존. 전투 코어 — 일차별 웨이브 스포너
#include "Spawning/SG_WaveSpawner.h"

#include "Engine/DataTable.h"
#include "Engine/World.h"
#include "Monsters/SG_BaseMonster.h"
#include "NavigationSystem.h"
#include "Spawning/SG_MonsterPool.h"
#include "TimerManager.h"

ASG_WaveSpawner::ASG_WaveSpawner()
{
	PrimaryActorTick.bCanEverTick = false;   // 전부 타이머와 이벤트로 돕니다
}

void ASG_WaveSpawner::BeginPlay()
{
	Super::BeginPlay();

	if (!WaveTable)
	{
		UE_LOG(LogTemp, Error, TEXT("[SG_WaveSpawner] WaveTable 이 비어 있습니다. 웨이브가 한 번도 안 옵니다."));
	}
	if (SpawnPoints.Num() == 0)
	{
		UE_LOG(LogTemp, Error, TEXT("[SG_WaveSpawner] SpawnPoints 가 비어 있습니다. 몬스터가 스포너 자리에서 나옵니다."));
	}
}

void ASG_WaveSpawner::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	AbortWave();
	Super::EndPlay(EndPlayReason);
}

USG_MonsterPool* ASG_WaveSpawner::GetPool() const
{
	const UWorld* World = GetWorld();
	return World ? World->GetSubsystem<USG_MonsterPool>() : nullptr;
}

//──────────────────────────────────────────────────────────────────────
// 표 읽기
//──────────────────────────────────────────────────────────────────────

const FSGWaveRow* ASG_WaveSpawner::FindWaveRow(int32 Day) const
{
	if (!WaveTable)
	{
		return nullptr;
	}

	// 행 이름을 "Day11"로 지어두면 한 번에 찾습니다(빠른 길)
	const FString RowKey = FString::Printf(TEXT("Day%d"), Day);
	if (const FSGWaveRow* Fast = WaveTable->FindRow<FSGWaveRow>(FName(*RowKey), TEXT("SG_WaveSpawner"), false))
	{
		return Fast;
	}

	// 행 이름이 다르게 지어졌으면 Day 값으로 훑습니다(느린 길, 표가 작아 문제없음)
	TArray<FSGWaveRow*> Rows;
	WaveTable->GetAllRows<FSGWaveRow>(TEXT("SG_WaveSpawner"), Rows);
	for (const FSGWaveRow* Row : Rows)
	{
		if (Row && Row->Day == Day)
		{
			return Row;
		}
	}
	return nullptr;
}

void ASG_WaveSpawner::PrewarmAllWaves()
{
	USG_MonsterPool* Pool = GetPool();
	if (!Pool || !WaveTable)
	{
		return;
	}

	// 클래스별로 "한 웨이브에 최대 몇 마리나 동시에 나오는가"를 구해 그만큼만 미리 만듭니다.
	// 전체 합계로 만들면 쓰지도 않을 몬스터를 수백 마리 들고 있게 됩니다.
	TMap<UClass*, int32> MaxPerClass;

	TArray<FSGWaveRow*> Rows;
	WaveTable->GetAllRows<FSGWaveRow>(TEXT("SG_WaveSpawner"), Rows);

	for (const FSGWaveRow* Row : Rows)
	{
		if (!Row)
		{
			continue;
		}
		TMap<UClass*, int32> ThisWave;
		for (const FSGSpawnGroup& Group : Row->Groups)
		{
			// TSoftClassPtr 이므로 여기서 실제로 읽어 들입니다(로딩 시점에 하는 게 맞습니다)
			UClass* Loaded = Group.MonsterClass.LoadSynchronous();
			if (!Loaded)
			{
				continue;
			}
			ThisWave.FindOrAdd(Loaded) += Group.Count;
		}
		for (const TPair<UClass*, int32>& Pair : ThisWave)
		{
			int32& Current = MaxPerClass.FindOrAdd(Pair.Key);
			Current = FMath::Max(Current, Pair.Value);
		}
	}

	for (const TPair<UClass*, int32>& Pair : MaxPerClass)
	{
		const int32 Count = FMath::CeilToInt(Pair.Value * PrewarmHeadroom);
		Pool->Prewarm(Pair.Key, Count);
	}
}

//──────────────────────────────────────────────────────────────────────
// 웨이브 시작
//──────────────────────────────────────────────────────────────────────

bool ASG_WaveSpawner::StartWaveForDay(int32 Day)
{
	if (bWaveActive)
	{
		UE_LOG(LogTemp, Warning, TEXT("[SG_WaveSpawner] 이미 %d일차 웨이브가 진행 중입니다."), CurrentDay);
		return false;
	}

	const FSGWaveRow* Row = FindWaveRow(Day);
	if (!Row)
	{
		// 웨이브가 없는 날입니다 — 정상입니다(99일 중 9일만 대란이므로)
		return false;
	}

	CurrentWave = *Row;
	CurrentDay = Day;
	bWaveActive = true;

	TotalSpawned = 0;
	TotalToSpawn = 0;
	GroupSpawnedCount.Init(0, CurrentWave.Groups.Num());
	for (const FSGSpawnGroup& Group : CurrentWave.Groups)
	{
		TotalToSpawn += Group.Count;
	}

	// ① 예고 — "공격 방향: 동쪽" 화살표를 띄울 시간을 줍니다.
	//    예고 없이 당하면 유저는 "내가 못 막았다"가 아니라 "억울하다"고 느낍니다.
	OnWaveTelegraph.Broadcast(Day, CurrentWave);

	if (CurrentWave.TelegraphSeconds > 0.f)
	{
		GetWorldTimerManager().SetTimer(TelegraphTimer, this,
			&ASG_WaveSpawner::BeginSpawning, CurrentWave.TelegraphSeconds, false);
	}
	else
	{
		BeginSpawning();
	}
	return true;
}

void ASG_WaveSpawner::BeginSpawning()
{
	OnWaveStarted.Broadcast(CurrentDay, TotalToSpawn);

	GroupTimers.SetNum(CurrentWave.Groups.Num());

	for (int32 i = 0; i < CurrentWave.Groups.Num(); ++i)
	{
		const FSGSpawnGroup& Group = CurrentWave.Groups[i];
		if (Group.Count <= 0)
		{
			continue;
		}

		// 한 마리씩 간격을 두고 냅니다.
		// 20마리를 한 프레임에 쏟으면 풀링을 써도 애니메이션 초기화 때문에 끊깁니다.
		const float Interval = FMath::Max(0.02f, Group.SpawnInterval);
		FTimerDelegate Del = FTimerDelegate::CreateUObject(this, &ASG_WaveSpawner::SpawnOneFromGroup, i);

		GetWorldTimerManager().SetTimer(GroupTimers[i], Del, Interval, true, Group.StartDelay);
	}
}

void ASG_WaveSpawner::SpawnOneFromGroup(int32 GroupIndex)
{
	if (!bWaveActive || !CurrentWave.Groups.IsValidIndex(GroupIndex))
	{
		return;
	}

	const FSGSpawnGroup& Group = CurrentWave.Groups[GroupIndex];
	int32& Spawned = GroupSpawnedCount[GroupIndex];

	if (Spawned >= Group.Count)
	{
		GetWorldTimerManager().ClearTimer(GroupTimers[GroupIndex]);
		return;
	}

	USG_MonsterPool* Pool = GetPool();
	UClass* MonsterClass = Group.MonsterClass.LoadSynchronous();
	if (!Pool || !MonsterClass)
	{
		GetWorldTimerManager().ClearTimer(GroupTimers[GroupIndex]);
		UE_LOG(LogTemp, Error, TEXT("[SG_WaveSpawner] %d번 묶음의 몬스터 클래스가 비어 있습니다."), GroupIndex);
		return;
	}

	const FTransform Xf = GetSpawnTransform(Group.SpawnPointIndex);

	// 웨이브 배율 × 묶음 배율 × 명성 배율
	const float Multiplier = CurrentWave.WaveStatScale * Group.StatMultiplier * GlobalStatScale;

	ASG_BaseMonster* Monster = Pool->Acquire(MonsterClass, Xf.GetLocation(), Xf.Rotator(), Multiplier);
	if (!Monster)
	{
		return;
	}

	// 죽음 신호를 받아 집계합니다. 풀에서 재사용되므로 중복 구독을 먼저 끊습니다.
	Monster->OnMonsterDied.RemoveDynamic(this, &ASG_WaveSpawner::HandleMonsterDied);
	Monster->OnMonsterDied.AddDynamic(this, &ASG_WaveSpawner::HandleMonsterDied);

	AliveMonsters.Add(Monster);
	++Spawned;
	++TotalSpawned;

	if (Spawned >= Group.Count)
	{
		GetWorldTimerManager().ClearTimer(GroupTimers[GroupIndex]);
	}
}

FTransform ASG_WaveSpawner::GetSpawnTransform(int32 SpawnPointIndex) const
{
	FVector Origin = GetActorLocation();
	FRotator Rot = GetActorRotation();

	if (SpawnPoints.IsValidIndex(SpawnPointIndex) && IsValid(SpawnPoints[SpawnPointIndex]))
	{
		Origin = SpawnPoints[SpawnPointIndex]->GetActorLocation();
		Rot = SpawnPoints[SpawnPointIndex]->GetActorRotation();
	}

	// 한 점에 겹쳐 나오지 않게 주변으로 흩뿌립니다
	FVector Location = Origin;
	if (SpawnScatterRadius > 0.f)
	{
		const float Angle = FMath::FRandRange(0.f, 2.f * PI);
		const float Dist = FMath::FRandRange(0.f, SpawnScatterRadius);
		Location += FVector(FMath::Cos(Angle) * Dist, FMath::Sin(Angle) * Dist, 0.f);

		// ★ 흩뿌린 자리가 절벽이나 벽 속일 수 있습니다.
		//   내비메시 위의 가장 가까운 지점으로 보정해야 몬스터가 허공에서 떨어지지 않습니다.
		if (const UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(GetWorld()))
		{
			FNavLocation Projected;
			if (Nav->ProjectPointToNavigation(Location, Projected, FVector(200.f, 200.f, 400.f)))
			{
				Location = Projected.Location;
			}
		}
	}

	return FTransform(Rot, Location);
}

//──────────────────────────────────────────────────────────────────────
// 사망 집계 · 웨이브 종료
//──────────────────────────────────────────────────────────────────────

void ASG_WaveSpawner::HandleMonsterDied(ASG_BaseMonster* Monster, AActor* Killer)
{
	if (!bWaveActive)
	{
		return;
	}

	AliveMonsters.Remove(Monster);

	if (USG_MonsterPool* Pool = GetPool())
	{
		Pool->Release(Monster);
	}

	// 누가 잡았는지 함께 넘깁니다 → "함정이 처치한 비율", "MVP 시설" 집계에 씁니다
	OnMonsterKilled.Broadcast(Monster, Killer, AliveMonsters.Num());

	// 다 냈고, 다 죽었으면 웨이브 종료
	const bool bAllSpawned = (TotalSpawned >= TotalToSpawn);
	if (bAllSpawned && AliveMonsters.Num() == 0)
	{
		bWaveActive = false;
		OnWaveCleared.Broadcast(CurrentDay);
	}
}

void ASG_WaveSpawner::AbortWave()
{
	GetWorldTimerManager().ClearTimer(TelegraphTimer);
	for (FTimerHandle& Handle : GroupTimers)
	{
		GetWorldTimerManager().ClearTimer(Handle);
	}
	GroupTimers.Reset();

	USG_MonsterPool* Pool = GetPool();
	for (ASG_BaseMonster* Monster : AliveMonsters)
	{
		if (!IsValid(Monster))
		{
			continue;
		}
		Monster->OnMonsterDied.RemoveDynamic(this, &ASG_WaveSpawner::HandleMonsterDied);
		Monster->OnReleaseToPool();
		if (Pool)
		{
			Pool->Release(Monster);
		}
	}
	AliveMonsters.Reset();
	bWaveActive = false;
}
