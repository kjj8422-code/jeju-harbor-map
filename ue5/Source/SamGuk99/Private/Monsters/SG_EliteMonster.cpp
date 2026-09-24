// Copyright 삼국지 99일 생존. 전투 코어 — 정예 몬스터
#include "Monsters/SG_EliteMonster.h"

#include "AIController.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"

ASG_EliteMonster::ASG_EliteMonster()
{
	Grade = ESGMonsterGrade::Elite;

	// 정예는 잡몹보다 덜 흔들립니다 — 몇 대 맞았다고 패턴이 끊기면 위협이 안 됩니다
	Poise = 25.f;
	KnockbackStrength = 120.f;
}

void ASG_EliteMonster::OnAcquireFromPool(const FVector& SpawnLocation, const FRotator& SpawnRotation, float StatMultiplier)
{
	Super::OnAcquireFromPool(SpawnLocation, SpawnRotation, StatMultiplier);

	// ★ 재사용 시 반드시 자식 클래스의 상태도 리셋해야 합니다.
	//   이걸 빠뜨리면 두 번째 웨이브의 정예가 돌진 쿨다운을 물려받아 한참 안 씁니다.
	ChargeCooldownRemaining = 0.f;
}

void ASG_EliteMonster::TickChase(float DeltaSeconds)
{
	ChargeCooldownRemaining = FMath::Max(0.f, ChargeCooldownRemaining - DeltaSeconds);

	AActor* Target = CurrentTarget.Get();
	if (Target && ChargeCooldownRemaining <= 0.f && ChargeMontage)
	{
		const float Dist = GetEdgeDistanceTo(Target);
		if (Dist >= ChargeMinDistance && Dist <= ChargeMaxDistance)
		{
			BeginCharge();
			return;   // 이번 판단에서는 일반 추적을 건너뜁니다
		}
	}

	// 조건이 안 맞으면 부모의 평범한 추적을 그대로 씁니다
	Super::TickChase(DeltaSeconds);
}

void ASG_EliteMonster::BeginCharge()
{
	AActor* Target = CurrentTarget.Get();
	if (!Target)
	{
		return;
	}

	SetState(ESGMonsterState::Attacking);
	HitActorsThisSwing.Reset();
	ChargeCooldownRemaining = ChargeCooldown;

	// 타겟 쪽으로 몸을 돌리고 밀어냅니다
	FVector Dir = Target->GetActorLocation() - GetActorLocation();
	Dir.Z = 0.f;
	if (!Dir.IsNearlyZero())
	{
		Dir.Normalize();
		SetActorRotation(Dir.Rotation());
	}

	if (AAIController* AI = Cast<AAIController>(GetController()))
	{
		AI->StopMovement();
	}

	PlayAnimMontage(ChargeMontage);
	LaunchCharacter(Dir * ChargeImpulse + FVector(0.f, 0.f, 120.f), true, false);

	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (UAnimInstance* Anim = MeshComp->GetAnimInstance())
		{
			FOnMontageEnded EndDelegate;
			EndDelegate.BindUObject(this, &ASG_EliteMonster::OnChargeMontageEnded);
			Anim->Montage_SetEndDelegate(EndDelegate, ChargeMontage);
		}
	}
}

void ASG_EliteMonster::OnChargeMontageEnded(UAnimMontage* Montage, bool bInterrupted)
{
	if (State == ESGMonsterState::Dead || State == ESGMonsterState::Pooled)
	{
		return;
	}
	HitActorsThisSwing.Reset();
	SetState(CurrentTarget.IsValid() ? ESGMonsterState::Chasing : ESGMonsterState::Seeking);
}

void ASG_EliteMonster::OnAttackHitWindow(FName HitTag)
{
	if (HitTag == TEXT("Charge"))
	{
		// 돌진은 더 아프고, 더 넓게 쓸어 담습니다
		PerformMeleeSweep(BaseStats.AttackDamage * ChargeDamageScale,
		                  BaseStats.AttackRange * 1.2f,
		                  BaseStats.AttackSweepRadius * 1.4f);
		return;
	}

	// 그 외에는 부모의 기본 근접 판정
	Super::OnAttackHitWindow(HitTag);
}

void ASG_EliteMonster::Die(AActor* Killer)
{
	// 부모의 사망 처리(신호 발송·풀 반납 예약)를 먼저 돌립니다
	Super::Die(Killer);

	// 특수 재료 드랍 — "무시하고 방어만 할까, 잡아서 이득을 볼까"의 선택을 만듭니다
	if (!DropActorClass || DropCount <= 0)
	{
		return;
	}
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	for (int32 i = 0; i < DropCount; ++i)
	{
		const FVector Offset(FMath::FRandRange(-80.f, 80.f), FMath::FRandRange(-80.f, 80.f), 40.f);
		FActorSpawnParameters Params;
		Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		World->SpawnActor<AActor>(DropActorClass, GetActorLocation() + Offset, FRotator::ZeroRotator, Params);
	}
}
