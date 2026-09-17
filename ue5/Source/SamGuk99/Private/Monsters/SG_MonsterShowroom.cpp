// Copyright 삼국지 99일 생존. 전투 코어 — 몬스터 쇼룸(에셋 검수용)
#include "Monsters/SG_MonsterShowroom.h"

#include "AIController.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "Monsters/SG_BaseMonster.h"

ASG_MonsterShowroom::ASG_MonsterShowroom()
{
	PrimaryActorTick.bCanEverTick = false;
}

void ASG_MonsterShowroom::BeginPlay()
{
	Super::BeginPlay();
	SpawnCurrent();
}

void ASG_MonsterShowroom::SpawnCurrent()
{
	UWorld* World = GetWorld();
	if (!World || MonsterClasses.Num() == 0)
	{
		UE_LOG(LogTemp, Warning, TEXT("[Showroom] MonsterClasses 가 비어 있습니다."));
		return;
	}

	if (IsValid(CurrentMonster))
	{
		CurrentMonster->Destroy();   // 쇼룸은 풀링을 쓰지 않습니다 — 매번 깨끗한 상태로 봐야 하므로
		CurrentMonster = nullptr;
	}

	CurrentIndex = (CurrentIndex % MonsterClasses.Num() + MonsterClasses.Num()) % MonsterClasses.Num();
	TSubclassOf<ASG_BaseMonster> Cls = MonsterClasses[CurrentIndex];
	if (!Cls)
	{
		return;
	}

	const AActor* Point = IsValid(DisplayPoint) ? DisplayPoint : this;

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	CurrentMonster = World->SpawnActor<ASG_BaseMonster>(Cls, Point->GetActorLocation(), Point->GetActorRotation(), Params);

	if (!CurrentMonster)
	{
		return;
	}

	// 풀에서 꺼낸 것처럼 정상 상태로 세웁니다
	CurrentMonster->OnAcquireFromPool(Point->GetActorLocation(), Point->GetActorRotation(), 1.f);

	if (bDisableAI)
	{
		// AI 판단만 끕니다. 애니메이션은 그대로 볼 수 있습니다.
		CurrentMonster->SetActorTickEnabled(false);
		if (AAIController* AI = Cast<AAIController>(CurrentMonster->GetController()))
		{
			AI->StopMovement();
		}
	}

	UE_LOG(LogTemp, Log, TEXT("[Showroom] %s 를 세웠습니다. (%d/%d)"),
		*Cls->GetName(), CurrentIndex + 1, MonsterClasses.Num());
}

void ASG_MonsterShowroom::ShowroomNext()
{
	++CurrentIndex;
	SpawnCurrent();
}

void ASG_MonsterShowroom::ShowroomPrev()
{
	--CurrentIndex;
	SpawnCurrent();
}

void ASG_MonsterShowroom::ShowroomPlayMontage(int32 MontageIndex)
{
	if (!IsValid(CurrentMonster) || !TestMontages.IsValidIndex(MontageIndex))
	{
		UE_LOG(LogTemp, Warning, TEXT("[Showroom] %d번 몽타주가 없습니다."), MontageIndex);
		return;
	}
	CurrentMonster->PlayAnimMontage(TestMontages[MontageIndex]);
}

void ASG_MonsterShowroom::ShowroomHit(float DamageAmount)
{
	if (!IsValid(CurrentMonster))
	{
		return;
	}
	// 이 액터가 때린 것으로 처리 → 넉백 방향까지 실제 전투와 같게 확인됩니다
	UGameplayStatics::ApplyDamage(CurrentMonster, DamageAmount, nullptr, this, nullptr);
}

void ASG_MonsterShowroom::ShowroomReset()
{
	SpawnCurrent();
}

FString ASG_MonsterShowroom::GetCurrentMonsterName() const
{
	return IsValid(CurrentMonster) ? CurrentMonster->GetClass()->GetName() : TEXT("(없음)");
}
