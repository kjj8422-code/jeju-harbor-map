// Copyright 삼국지 99일 생존. 전투 코어 — 몬스터 오브젝트 풀
#include "Spawning/SG_MonsterPool.h"

#include "Engine/World.h"
#include "Monsters/SG_BaseMonster.h"

void USG_MonsterPool::Prewarm(TSubclassOf<ASG_BaseMonster> MonsterClass, int32 Count)
{
	if (!MonsterClass || Count <= 0)
	{
		return;
	}

	FSGMonsterPoolBucket& Bucket = Buckets.FindOrAdd(MonsterClass.Get());
	Bucket.Free.Reserve(Bucket.Free.Num() + Count);

	for (int32 i = 0; i < Count; ++i)
	{
		if (ASG_BaseMonster* Monster = CreateNewPooled(MonsterClass))
		{
			Bucket.Free.Add(Monster);
		}
	}

	UE_LOG(LogTemp, Log, TEXT("[SG_MonsterPool] %s 를 %d 마리 미리 만들었습니다."),
		*MonsterClass->GetName(), Count);
}

ASG_BaseMonster* USG_MonsterPool::CreateNewPooled(TSubclassOf<ASG_BaseMonster> MonsterClass)
{
	UWorld* World = GetWorld();
	if (!World || !MonsterClass)
	{
		return nullptr;
	}

	FActorSpawnParameters Params;
	// 풀 대기 자리는 지도 밖 깊은 곳입니다. 거기엔 바닥이 없으므로
	// "끼임 판정"으로 스폰이 취소되지 않도록 항상 스폰하라고 지정합니다.
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	Params.ObjectFlags |= RF_Transient;   // 레벨 저장 파일에 남기지 않습니다

	ASG_BaseMonster* Monster = World->SpawnActor<ASG_BaseMonster>(
		MonsterClass, FVector(0.f, 0.f, -100000.f), FRotator::ZeroRotator, Params);

	if (Monster)
	{
		Monster->OnReleaseToPool();   // 숨기고 틱 끄고 대기 상태로
	}
	return Monster;
}

ASG_BaseMonster* USG_MonsterPool::Acquire(TSubclassOf<ASG_BaseMonster> MonsterClass,
                                          const FVector& Location, const FRotator& Rotation, float StatMultiplier)
{
	if (!MonsterClass)
	{
		return nullptr;
	}

	FSGMonsterPoolBucket& Bucket = Buckets.FindOrAdd(MonsterClass.Get());

	ASG_BaseMonster* Monster = nullptr;

	// 쉬고 있는 놈 중에 유효한 걸 꺼냅니다 (레벨 전환 등으로 파괴된 항목은 버림)
	while (Bucket.Free.Num() > 0 && !IsValid(Monster))
	{
		Monster = Bucket.Free.Pop(EAllowShrinking::No);
	}

	// 없으면 새로 만듭니다. 풀은 최고 동시 등장 수만큼 자동으로 커집니다.
	if (!IsValid(Monster))
	{
		Monster = CreateNewPooled(MonsterClass);
		if (!Monster)
		{
			return nullptr;
		}
		UE_LOG(LogTemp, Verbose, TEXT("[SG_MonsterPool] 풀이 비어 %s 를 새로 만들었습니다. Prewarm 수를 늘리세요."),
			*MonsterClass->GetName());
	}

	Bucket.InUse.Add(Monster);
	Monster->OnAcquireFromPool(Location, Rotation, StatMultiplier);
	return Monster;
}

void USG_MonsterPool::Release(ASG_BaseMonster* Monster)
{
	if (!IsValid(Monster))
	{
		return;
	}

	FSGMonsterPoolBucket* Bucket = Buckets.Find(Monster->GetClass());
	if (!Bucket)
	{
		return;
	}

	Bucket->InUse.Remove(Monster);

	// 같은 놈이 두 번 들어가지 않게 (죽을 때와 웨이브 종료 때 두 번 불릴 수 있습니다)
	if (!Bucket->Free.Contains(Monster))
	{
		Bucket->Free.Add(Monster);
	}
}

int32 USG_MonsterPool::GetActiveCount() const
{
	int32 Total = 0;
	for (const TPair<TObjectPtr<UClass>, FSGMonsterPoolBucket>& Pair : Buckets)
	{
		Total += Pair.Value.InUse.Num();
	}
	return Total;
}

void USG_MonsterPool::LogPoolStatus() const
{
	for (const TPair<TObjectPtr<UClass>, FSGMonsterPoolBucket>& Pair : Buckets)
	{
		UE_LOG(LogTemp, Log, TEXT("[SG_MonsterPool] %s — 대기 %d / 출전 %d"),
			*GetNameSafe(Pair.Key), Pair.Value.Free.Num(), Pair.Value.InUse.Num());
	}
}
