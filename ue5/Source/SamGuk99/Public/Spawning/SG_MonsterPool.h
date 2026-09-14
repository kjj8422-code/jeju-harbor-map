// Copyright 삼국지 99일 생존. 전투 코어 — 몬스터 오브젝트 풀
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "SG_MonsterPool.generated.h"

class ASG_BaseMonster;

/** 몬스터 클래스 하나에 대한 풀 (노는 놈 / 쓰는 놈) */
USTRUCT()
struct FSGMonsterPoolBucket
{
	GENERATED_BODY()

	/** 지금 쉬고 있는 몬스터들 — 여기서 꺼내 씁니다 */
	UPROPERTY()
	TArray<TObjectPtr<ASG_BaseMonster>> Free;

	/** 지금 전장에 나가 있는 몬스터들 */
	UPROPERTY()
	TArray<TObjectPtr<ASG_BaseMonster>> InUse;
};

/**
 * ★ 오브젝트 풀링.
 *
 * 왜 필요한가:
 * 몬스터를 SpawnActor로 만들고 Destroy로 지우는 건 생각보다 비쌉니다.
 * 캐릭터 하나에 스켈레탈 메시·애니메이션 인스턴스·이동 컴포넌트·AI 컨트롤러가 딸려 오는데,
 * 이걸 웨이브마다 20~30번씩 반복하면 웨이브 시작 순간마다 화면이 뚝뚝 끊깁니다.
 * 게다가 버린 객체가 쌓여 가비지 컬렉션이 돌 때 또 한 번 끊깁니다.
 *
 * 그래서 만들어두고 재사용합니다. 죽은 몬스터는 사라지는 게 아니라
 * 화면 밖으로 치워져 다음 웨이브를 기다립니다.
 *
 * 사용 순서:
 *   1) 게임 시작 시 Prewarm()으로 미리 만들어 둡니다 (로딩 중에 비용을 몰아넣음)
 *   2) 웨이브 때 Acquire()로 꺼냅니다
 *   3) 죽으면 몬스터가 스스로 OnReleaseToPool()을 부르고, 스포너가 Release()로 명부를 정리합니다
 */
UCLASS()
class SAMGUK99_API USG_MonsterPool : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	/**
	 * 미리 만들어 둡니다. 반드시 로딩 화면·게임 시작 시점에 부르세요.
	 * 웨이브 직전에 부르면 풀링을 쓰는 의미가 없습니다.
	 */
	UFUNCTION(BlueprintCallable, Category = "SG|Pool")
	void Prewarm(TSubclassOf<ASG_BaseMonster> MonsterClass, int32 Count);

	/**
	 * 풀에서 하나 꺼내 전장에 세웁니다.
	 * 노는 놈이 없으면 새로 만듭니다(풀이 자동으로 늘어남).
	 */
	UFUNCTION(BlueprintCallable, Category = "SG|Pool")
	ASG_BaseMonster* Acquire(TSubclassOf<ASG_BaseMonster> MonsterClass,
	                         const FVector& Location, const FRotator& Rotation, float StatMultiplier = 1.f);

	/** 전장에서 내려 풀로 되돌립니다 */
	UFUNCTION(BlueprintCallable, Category = "SG|Pool")
	void Release(ASG_BaseMonster* Monster);

	/** 지금 전장에 나가 있는 총 수 */
	UFUNCTION(BlueprintPure, Category = "SG|Pool")
	int32 GetActiveCount() const;

	/** 디버그용 — 클래스별 풀 상태를 로그로 */
	UFUNCTION(BlueprintCallable, Category = "SG|Pool")
	void LogPoolStatus() const;

private:
	ASG_BaseMonster* CreateNewPooled(TSubclassOf<ASG_BaseMonster> MonsterClass);

	/** 클래스별 풀. UPROPERTY라서 가비지 컬렉터가 여기 담긴 몬스터를 지우지 않습니다. */
	UPROPERTY()
	TMap<TObjectPtr<UClass>, FSGMonsterPoolBucket> Buckets;
};
