// Copyright 삼국지 99일 생존. 전투 코어 — 보스 몬스터
#include "Monsters/SG_BossMonster.h"

#include "AIController.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"

ASG_BossMonster::ASG_BossMonster()
{
	Grade = ESGMonsterGrade::Boss;

	// ★ 보스는 경직저항을 아주 높게 잡습니다.
	//   이게 없으면 병사 여섯이 둘러싸 때릴 때 보스가 아무 패턴도 못 쓰고 서서 죽습니다.
	Poise = 9999.f;
	KnockbackStrength = 0.f;     // 보스는 밀리지 않습니다
	HitStopSeconds = 0.03f;      // 히트스톱은 짧게만 (길면 보스전이 끈적해집니다)
	CorpseLingerSeconds = 4.f;   // 쓰러지는 연출을 충분히 보여줍니다

	// 기본 1페이즈 하나는 항상 있어야 합니다
	FSGBossPhase Phase1;
	Phase1.HealthThreshold = 1.f;
	Phases.Add(Phase1);
}

void ASG_BossMonster::OnAcquireFromPool(const FVector& SpawnLocation, const FRotator& SpawnRotation, float StatMultiplier)
{
	Super::OnAcquireFromPool(SpawnLocation, SpawnRotation, StatMultiplier);

	// 페이즈 배율을 곱하기 전의 원본 수치를 기억해 둡니다.
	// 이걸 안 하면 재사용할 때마다 배율이 누적돼 2회차 보스가 터무니없이 강해집니다.
	BaseAttackDamageSnapshot = BaseStats.AttackDamage;
	BaseMoveSpeedSnapshot = BaseStats.MoveSpeed;

	CurrentPhase = -1;
	SlamCooldownRemaining = 0.f;
	EnterPhase(0);
}

void ASG_BossMonster::TickAI(float DeltaSeconds)
{
	SlamCooldownRemaining = FMath::Max(0.f, SlamCooldownRemaining - DeltaSeconds);
	Super::TickAI(DeltaSeconds);
}

//──────────────────────────────────────────────────────────────────────
// ① 페이즈 전환
//──────────────────────────────────────────────────────────────────────

float ASG_BossMonster::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent,
                                  AController* EventInstigator, AActor* DamageCauser)
{
	const float Applied = Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);

	if (State == ESGMonsterState::Dead || Applied <= 0.f)
	{
		return Applied;
	}

	// 체력이 다음 페이즈 문턱을 넘었는지 확인합니다
	const float HealthPct = GetHealthPercent();
	for (int32 i = Phases.Num() - 1; i > CurrentPhase; --i)
	{
		if (HealthPct <= Phases[i].HealthThreshold)
		{
			EnterPhase(i);
			break;
		}
	}
	return Applied;
}

void ASG_BossMonster::EnterPhase(int32 NewPhase)
{
	if (!Phases.IsValidIndex(NewPhase) || NewPhase == CurrentPhase)
	{
		return;
	}
	CurrentPhase = NewPhase;
	const FSGBossPhase& Phase = Phases[CurrentPhase];

	// 원본 수치에 페이즈 배율을 곱합니다(누적이 아니라 매번 원본 기준)
	BaseStats.AttackDamage = BaseAttackDamageSnapshot * Phase.DamageScale;
	BaseStats.MoveSpeed = BaseMoveSpeedSnapshot * Phase.SpeedScale;

	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->MaxWalkSpeed = BaseStats.MoveSpeed;
	}

	// 페이즈가 오를수록 광역이 잦아집니다
	SlamCooldownRemaining = FMath::Min(SlamCooldownRemaining, Phase.SlamCooldown);

	OnPhaseChanged.Broadcast(CurrentPhase, GetHealthPercent());
	BP_OnPhaseChanged(CurrentPhase);

	// 전환 연출 — 그동안 무적은 아니지만 행동은 멈춥니다
	if (Phase.EnterMontage)
	{
		SetState(ESGMonsterState::Staggered);
		if (AAIController* AI = Cast<AAIController>(GetController()))
		{
			AI->StopMovement();
		}
		const float Duration = PlayAnimMontage(Phase.EnterMontage);
		if (USkeletalMeshComponent* MeshComp = GetMesh())
		{
			if (UAnimInstance* Anim = MeshComp->GetAnimInstance())
			{
				FOnMontageEnded EndDelegate;
				EndDelegate.BindUObject(this, &ASG_BossMonster::OnPhaseEnterMontageEnded);
				Anim->Montage_SetEndDelegate(EndDelegate, Phase.EnterMontage);
			}
		}
		if (Duration <= 0.f)
		{
			OnPhaseEnterMontageEnded(Phase.EnterMontage, true);
		}
	}
}

void ASG_BossMonster::OnPhaseEnterMontageEnded(UAnimMontage* Montage, bool bInterrupted)
{
	if (State == ESGMonsterState::Dead || State == ESGMonsterState::Pooled)
	{
		return;
	}
	SetState(CurrentTarget.IsValid() ? ESGMonsterState::Chasing : ESGMonsterState::Seeking);
}

//──────────────────────────────────────────────────────────────────────
// ② 광역 공격
//──────────────────────────────────────────────────────────────────────

void ASG_BossMonster::BeginAttack()
{
	AActor* Target = CurrentTarget.Get();

	// 광역 조건: 쿨다운이 돌았고, 몽타주가 있고, 대상이 충분히 가깝다
	const bool bCanSlam = SlamMontage
		&& SlamCooldownRemaining <= 0.f
		&& Target
		&& GetEdgeDistanceTo(Target) <= SlamTriggerRange;

	if (bCanSlam)
	{
		BeginSlam();
		return;
	}

	// 조건이 아니면 부모의 평범한 근접 공격을 그대로 씁니다
	Super::BeginAttack();
}

void ASG_BossMonster::BeginSlam()
{
	SetState(ESGMonsterState::Attacking);
	HitActorsThisSwing.Reset();

	const FSGBossPhase& Phase = Phases.IsValidIndex(CurrentPhase) ? Phases[CurrentPhase] : Phases[0];
	SlamCooldownRemaining = Phase.SlamCooldown;

	if (AAIController* AI = Cast<AAIController>(GetController()))
	{
		AI->StopMovement();
	}

	// 예고 — 바닥에 붉은 원을 띄울 시간을 줍니다.
	// 몽타주 앞부분(치켜드는 동작)이 예고 구간이고, 타격 노티파이는 내려찍는 프레임에 찍습니다.
	BP_OnSlamTelegraph(SlamRadius, SlamTelegraphSeconds);

	const float Duration = PlayAnimMontage(SlamMontage);
	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (UAnimInstance* Anim = MeshComp->GetAnimInstance())
		{
			FOnMontageEnded EndDelegate;
			EndDelegate.BindUObject(this, &ASG_BossMonster::OnSlamMontageEnded);
			Anim->Montage_SetEndDelegate(EndDelegate, SlamMontage);
		}
	}
	if (Duration <= 0.f)
	{
		OnSlamMontageEnded(SlamMontage, true);
	}
}

void ASG_BossMonster::OnSlamMontageEnded(UAnimMontage* Montage, bool bInterrupted)
{
	if (State == ESGMonsterState::Dead || State == ESGMonsterState::Pooled)
	{
		return;
	}
	AttackCooldownRemaining = BaseStats.AttackCooldown;
	HitActorsThisSwing.Reset();
	SetState(CurrentTarget.IsValid() ? ESGMonsterState::Chasing : ESGMonsterState::Seeking);
}

void ASG_BossMonster::OnAttackHitWindow(FName HitTag)
{
	if (HitTag == TEXT("Slam"))
	{
		PerformRadialSlam();
		return;
	}
	Super::OnAttackHitWindow(HitTag);
}

void ASG_BossMonster::PerformRadialSlam()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	const FVector Center = GetActorLocation();
	const float Damage = BaseStats.AttackDamage * SlamDamageScale;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(SGBossSlam), false, this);
	Params.AddIgnoredActor(this);

	TArray<FOverlapResult> Overlaps;
	World->OverlapMultiByChannel(Overlaps, Center, FQuat::Identity, ECC_Pawn,
	                             FCollisionShape::MakeSphere(SlamRadius), Params);

	for (const FOverlapResult& Overlap : Overlaps)
	{
		AActor* Victim = Overlap.GetActor();
		if (!IsValid(Victim) || HitActorsThisSwing.Contains(Victim))
		{
			continue;
		}
		if (Victim->IsA<ASG_BaseMonster>())
		{
			continue;   // 자기 편은 안 때립니다
		}
		HitActorsThisSwing.Add(Victim);
		UGameplayStatics::ApplyDamage(Victim, Damage, GetController(), this, nullptr);
		BP_OnAttackLanded(Victim, Victim->GetActorLocation());
	}
}
