// Copyright 삼국지 99일 생존. 전투 코어 — 모든 몬스터의 부모 클래스
#include "Monsters/SG_BaseMonster.h"

#include "AIController.h"
#include "Combat/SG_TargetRegistry.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/DamageEvents.h"
#include "Engine/World.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Navigation/PathFollowingComponent.h"
#include "TimerManager.h"

ASG_BaseMonster::ASG_BaseMonster()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.bStartWithTickEnabled = false;   // 풀에서 대기 중엔 틱을 끕니다

	// 웨이브 전투에서는 캡슐끼리 서로 밀치는 비용이 큽니다.
	// 몬스터끼리는 겹치게 두고, 장수·건물과만 부딪히게 블루프린트에서 콜리전 프리셋을 잡으세요.
	GetCapsuleComponent()->SetCollisionProfileName(TEXT("Pawn"));

	// AI 컨트롤러는 풀에서 처음 만들 때 한 번만 붙입니다(재사용 시 재빙의 비용 절약).
	AutoPossessAI = EAutoPossessAI::Spawned;

	bUseControllerRotationYaw = false;
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->bOrientRotationToMovement = true;
		Move->RotationRate = FRotator(0.f, 540.f, 0.f);
		Move->bUseControllerDesiredRotation = false;
	}
}

void ASG_BaseMonster::BeginPlay()
{
	Super::BeginPlay();
	// 스폰 직후엔 풀 대기 상태입니다. 실제 투입은 OnAcquireFromPool에서 합니다.
	if (State == ESGMonsterState::Pooled)
	{
		OnReleaseToPool();
	}
}

USG_TargetRegistry* ASG_BaseMonster::GetRegistry() const
{
	const UWorld* World = GetWorld();
	return World ? World->GetSubsystem<USG_TargetRegistry>() : nullptr;
}

//──────────────────────────────────────────────────────────────────────
// 능력치
//──────────────────────────────────────────────────────────────────────

void ASG_BaseMonster::ApplyStats(const FSGMonsterStats& InStats, float Multiplier)
{
	AppliedMultiplier = FMath::Max(0.1f, Multiplier);
	BaseStats = InStats;

	// 배율은 체력과 공격력에만 겁니다.
	// 이동 속도까지 곱하면 후반 웨이브에서 몬스터가 순간이동하듯 보여 게임이 망가집니다.
	BaseStats.MaxHealth = InStats.MaxHealth * AppliedMultiplier;
	BaseStats.AttackDamage = InStats.AttackDamage * AppliedMultiplier;

	CurrentHealth = BaseStats.MaxHealth;

	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->MaxWalkSpeed = BaseStats.MoveSpeed;
	}
}

//──────────────────────────────────────────────────────────────────────
// ② 오브젝트 풀링
//──────────────────────────────────────────────────────────────────────

void ASG_BaseMonster::OnAcquireFromPool(const FVector& SpawnLocation, const FRotator& SpawnRotation, float StatMultiplier)
{
	// 1) 위치부터 옮깁니다 (숨어 있는 동안 옮겨야 이전 자리에서 순간이동하는 게 안 보입니다)
	SetActorLocationAndRotation(SpawnLocation, SpawnRotation, false, nullptr, ETeleportType::ResetPhysics);

	// 2) 능력치·체력 초기화
	ApplyStats(BaseStats, StatMultiplier);

	// 3) 런타임 상태 전부 리셋 — 하나라도 빠지면 재사용 시 버그가 됩니다
	CurrentTarget = nullptr;
	AttackCooldownRemaining = 0.f;
	ThinkAccumulator = 0.f;
	TargetRefreshTimer = 0.f;
	StuckTimer = 0.f;
	LastDistanceToTarget = TNumericLimits<float>::Max();
	HitActorsThisSwing.Reset();
	GetWorldTimerManager().ClearTimer(ReleaseTimerHandle);

	// 4) 애니메이션 상태 리셋 — 죽는 몽타주가 남아 있으면 서서 죽은 채로 걸어옵니다
	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (UAnimInstance* Anim = MeshComp->GetAnimInstance())
		{
			Anim->StopAllMontages(0.f);
		}
		MeshComp->SetVisibility(true, true);
		// 사망 시 래그돌로 눕혔다면 원래 자세로 되돌립니다
		MeshComp->SetSimulatePhysics(false);
		MeshComp->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		MeshComp->AttachToComponent(GetCapsuleComponent(), FAttachmentTransformRules::SnapToTargetNotIncludingScale);
		MeshComp->SetRelativeLocationAndRotation(
			GetClass()->GetDefaultObject<ACharacter>()->GetMesh()->GetRelativeLocation(),
			GetClass()->GetDefaultObject<ACharacter>()->GetMesh()->GetRelativeRotation());
	}

	// 5) 이동 컴포넌트 되살리기
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->SetMovementMode(MOVE_Walking);
		Move->StopMovementImmediately();
	}

	// 6) 보이게 + 부딪히게 + 틱 켜기
	SetActorHiddenInGame(false);
	SetActorEnableCollision(true);
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	SetActorTickEnabled(true);

	// 7) AI 컨트롤러 확보 (처음 한 번만 생성됩니다)
	if (!GetController())
	{
		SpawnDefaultController();
	}

	SetState(ESGMonsterState::Seeking);
}

void ASG_BaseMonster::OnReleaseToPool()
{
	SetState(ESGMonsterState::Pooled);

	// 이동 정지 — 풀에 들어간 채로 경로를 따라가려 하면 CPU를 계속 먹습니다
	if (AAIController* AI = Cast<AAIController>(GetController()))
	{
		AI->StopMovement();
	}
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->StopMovementImmediately();
		Move->DisableMovement();
	}
	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (UAnimInstance* Anim = MeshComp->GetAnimInstance())
		{
			Anim->StopAllMontages(0.f);
		}
	}

	CurrentTarget = nullptr;
	HitActorsThisSwing.Reset();

	// ★ 히트스톱 중에 죽으면 시간 배율이 0.05인 채로 풀에 들어갑니다.
	//   다음 웨이브에 슬로모션 몬스터가 등장하는 버그가 여기서 납니다.
	GetWorldTimerManager().ClearTimer(HitStopTimerHandle);
	CustomTimeDilation = 1.f;

	SetActorHiddenInGame(true);
	SetActorEnableCollision(false);
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	SetActorTickEnabled(false);

	// 지도 밖 먼 곳으로 치워둡니다 — 혹시 남은 오버랩 검사에 걸리지 않도록
	SetActorLocation(FVector(0.f, 0.f, -100000.f));
}

//──────────────────────────────────────────────────────────────────────
// AI 상태 머신
//──────────────────────────────────────────────────────────────────────

void ASG_BaseMonster::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (State == ESGMonsterState::Pooled || State == ESGMonsterState::Dead)
	{
		return;
	}

	AttackCooldownRemaining = FMath::Max(0.f, AttackCooldownRemaining - DeltaSeconds);

	// ★ 성능: 판단은 초당 10회만. 이동은 CharacterMovement가 매 프레임 부드럽게 처리합니다.
	ThinkAccumulator += DeltaSeconds;
	if (ThinkAccumulator < AIThinkInterval)
	{
		return;
	}
	const float ThinkDelta = ThinkAccumulator;
	ThinkAccumulator = 0.f;

	TickAI(ThinkDelta);
}

void ASG_BaseMonster::TickAI(float DeltaSeconds)
{
	switch (State)
	{
	case ESGMonsterState::Seeking:
	{
		// ① 타겟 탐색
		AActor* Target = FindTarget();
		if (Target)
		{
			CurrentTarget = Target;
			LastDistanceToTarget = GetEdgeDistanceTo(Target);
			StuckTimer = 0.f;
			SetState(ESGMonsterState::Chasing);
		}
		break;
	}

	case ESGMonsterState::Chasing:
	{
		// 타겟이 사라졌으면 다시 찾습니다 (장수가 죽었거나 목책이 부서졌을 때)
		if (!CurrentTarget.IsValid())
		{
			SetState(ESGMonsterState::Seeking);
			break;
		}

		// 주기적으로 더 좋은 타겟이 생겼는지 다시 봅니다
		TargetRefreshTimer += DeltaSeconds;
		if (TargetRefreshTimer >= TargetRefreshInterval)
		{
			TargetRefreshTimer = 0.f;
			if (AActor* Better = FindTarget())
			{
				if (Better != CurrentTarget.Get())
				{
					CurrentTarget = Better;
					LastDistanceToTarget = GetEdgeDistanceTo(Better);
					StuckTimer = 0.f;
				}
			}
		}

		// ③ 사거리 안이면 공격으로
		if (IsTargetInAttackRange(CurrentTarget.Get()))
		{
			if (AttackCooldownRemaining <= 0.f)
			{
				BeginAttack();
			}
			else if (AAIController* AI = Cast<AAIController>(GetController()))
			{
				AI->StopMovement();   // 쿨다운 중엔 제자리에서 대기
			}
			break;
		}

		// ② 추적
		TickChase(DeltaSeconds);
		break;
	}

	case ESGMonsterState::Breaching:
	{
		if (!CurrentTarget.IsValid())
		{
			SetState(ESGMonsterState::Seeking);
			break;
		}
		if (IsTargetInAttackRange(CurrentTarget.Get()))
		{
			if (AttackCooldownRemaining <= 0.f)
			{
				BeginAttack();
			}
		}
		else
		{
			TickChase(DeltaSeconds);
		}
		break;
	}

	case ESGMonsterState::Attacking:
	case ESGMonsterState::Staggered:
	default:
		break;   // 몽타주가 끝나면 콜백이 상태를 되돌립니다
	}
}

AActor* ASG_BaseMonster::FindTarget()
{
	USG_TargetRegistry* Registry = GetRegistry();
	if (!Registry)
	{
		return nullptr;
	}

	// 탐지 반경 안의 장수·병사를 먼저
	if (AActor* Near = Registry->FindBestTarget(GetActorLocation(), BaseStats.DetectRadius))
	{
		return Near;
	}
	// 없으면 최종 목표인 거점으로 직행
	return Registry->GetBaseTarget();
}

void ASG_BaseMonster::TickChase(float DeltaSeconds)
{
	AAIController* AI = Cast<AAIController>(GetController());
	AActor* Target = CurrentTarget.Get();
	if (!AI || !Target)
	{
		SetState(ESGMonsterState::Seeking);
		return;
	}

	// 대상 몸집만큼 뺀 거리에서 멈춰야 벽에 붙어서 때립니다
	const float Acceptance = FMath::Max(30.f, BaseStats.AttackRange * 0.8f);

	const EPathFollowingRequestResult::Type Result =
		AI->MoveToActor(Target, Acceptance, /*bStopOnOverlap*/ true, /*bUsePathfinding*/ true,
		                /*bCanStrafe*/ false, nullptr, /*bAllowPartialPath*/ true);

	// 길이 아예 없으면 곧바로 목책을 부수러 갑니다
	if (Result == EPathFollowingRequestResult::Failed)
	{
		EnterBreachMode();
		return;
	}

	// ★ 막힘 감지: 일정 시간 동안 가까워지지 못하면 길이 막힌 것으로 봅니다.
	//   (부분 경로로 벽 앞까지만 간 경우가 여기 걸립니다)
	const float Dist = GetEdgeDistanceTo(Target);
	if (Dist < LastDistanceToTarget - 20.f)
	{
		LastDistanceToTarget = Dist;
		StuckTimer = 0.f;
	}
	else
	{
		StuckTimer += DeltaSeconds;
		if (StuckTimer >= StuckThresholdSeconds && State != ESGMonsterState::Breaching)
		{
			EnterBreachMode();
		}
	}
}

void ASG_BaseMonster::EnterBreachMode()
{
	USG_TargetRegistry* Registry = GetRegistry();
	AActor* Wall = Registry ? Registry->FindNearestStructure(GetActorLocation()) : nullptr;

	if (!Wall)
	{
		// 부술 목책조차 없으면 그냥 계속 추적합니다
		StuckTimer = 0.f;
		return;
	}

	CurrentTarget = Wall;
	LastDistanceToTarget = GetEdgeDistanceTo(Wall);
	StuckTimer = 0.f;
	SetState(ESGMonsterState::Breaching);
}

//──────────────────────────────────────────────────────────────────────
// ③ 공격 — 몽타주 재생 → AnimNotify가 타격 판정
//──────────────────────────────────────────────────────────────────────

void ASG_BaseMonster::BeginAttack()
{
	if (!AttackMontage)
	{
		// 몽타주가 없으면(프로토타입 단계) 즉시 판정만 하고 넘어갑니다
		OnAttackHitWindow(TEXT("Melee"));
		AttackCooldownRemaining = BaseStats.AttackCooldown;
		return;
	}

	SetState(ESGMonsterState::Attacking);
	HitActorsThisSwing.Reset();

	// 타겟 쪽으로 몸을 돌립니다 (등 뒤를 때리는 어색함 방지)
	if (AActor* Target = CurrentTarget.Get())
	{
		FVector Dir = Target->GetActorLocation() - GetActorLocation();
		Dir.Z = 0.f;
		if (!Dir.IsNearlyZero())
		{
			SetActorRotation(Dir.Rotation());
		}
	}

	if (AAIController* AI = Cast<AAIController>(GetController()))
	{
		AI->StopMovement();
	}

	if (AttackSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, AttackSound, GetActorLocation());
	}

	const float Duration = PlayAnimMontage(AttackMontage);

	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (UAnimInstance* Anim = MeshComp->GetAnimInstance())
		{
			FOnMontageEnded EndDelegate;
			EndDelegate.BindUObject(this, &ASG_BaseMonster::OnAttackMontageEnded);
			Anim->Montage_SetEndDelegate(EndDelegate, AttackMontage);
		}
	}

	// 몽타주가 어떤 이유로든 안 돌면 상태가 영원히 Attacking에 갇힙니다 — 안전장치
	if (Duration <= 0.f)
	{
		OnAttackMontageEnded(AttackMontage, true);
	}
}

void ASG_BaseMonster::OnAttackHitWindow(FName HitTag)
{
	// 기본 공격만 처리합니다. 보스의 광역 패턴은 자식 클래스가 override 해서 받습니다.
	if (HitTag == TEXT("Melee") || HitTag.IsNone())
	{
		PerformMeleeSweep(BaseStats.AttackDamage, BaseStats.AttackRange, BaseStats.AttackSweepRadius);
	}
}

void ASG_BaseMonster::PerformMeleeSweep(float Damage, float Range, float Radius)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	const FVector Start = GetActorLocation() + GetActorForwardVector() * GetCapsuleComponent()->GetScaledCapsuleRadius();
	const FVector End = Start + GetActorForwardVector() * Range;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(SGMeleeSweep), false, this);
	Params.AddIgnoredActor(this);

	TArray<FHitResult> Hits;
	World->SweepMultiByChannel(Hits, Start, End, FQuat::Identity, ECC_Pawn,
	                           FCollisionShape::MakeSphere(Radius), Params);

	for (const FHitResult& Hit : Hits)
	{
		AActor* Victim = Hit.GetActor();
		if (!IsValid(Victim) || HitActorsThisSwing.Contains(Victim))
		{
			continue;
		}
		// 같은 몬스터끼리는 때리지 않습니다
		if (Victim->IsA<ASG_BaseMonster>())
		{
			continue;
		}
		HitActorsThisSwing.Add(Victim);
		UGameplayStatics::ApplyDamage(Victim, Damage, GetController(), this, nullptr);

		// 타격 연출은 블루프린트에서 (피 튀김, 카메라 흔들림 등)
		BP_OnAttackLanded(Victim, Hit.ImpactPoint);
	}
}

void ASG_BaseMonster::OnAttackMontageEnded(UAnimMontage* Montage, bool bInterrupted)
{
	if (State == ESGMonsterState::Dead || State == ESGMonsterState::Pooled)
	{
		return;
	}
	AttackCooldownRemaining = BaseStats.AttackCooldown;
	HitActorsThisSwing.Reset();
	SetState(CurrentTarget.IsValid() ? ESGMonsterState::Chasing : ESGMonsterState::Seeking);
}

//──────────────────────────────────────────────────────────────────────
// 피해와 사망
//──────────────────────────────────────────────────────────────────────

float ASG_BaseMonster::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent,
                                  AController* EventInstigator, AActor* DamageCauser)
{
	if (State == ESGMonsterState::Dead || State == ESGMonsterState::Pooled || DamageAmount <= 0.f)
	{
		return 0.f;
	}

	const float Applied = FMath::Min(DamageAmount, CurrentHealth);
	CurrentHealth -= Applied;

	Super::TakeDamage(DamageAmount, DamageEvent, EventInstigator, DamageCauser);

	if (CurrentHealth <= 0.f)
	{
		Die(DamageCauser);
		return Applied;
	}

	// 살아남았으면 피격 반응 — "때린 맛"은 여기서 나옵니다
	PlayHitReaction(DamageAmount, DamageCauser);
	return Applied;
}

void ASG_BaseMonster::Die(AActor* Killer)
{
	if (State == ESGMonsterState::Dead)
	{
		return;
	}
	SetState(ESGMonsterState::Dead);

	if (AAIController* AI = Cast<AAIController>(GetController()))
	{
		AI->StopMovement();
	}
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->StopMovementImmediately();
		Move->DisableMovement();
	}
	// 시체를 밟고 지나갈 수 있게 충돌을 끕니다
	GetCapsuleComponent()->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	if (DeathMontage)
	{
		PlayAnimMontage(DeathMontage);
	}
	if (DeathSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, DeathSound, GetActorLocation());
	}
	BP_OnDeath(Killer);

	// 스포너·리포트에 알립니다 (누가 잡았는지까지 넘겨서 "함정 처치 비율"을 집계할 수 있게)
	OnMonsterDied.Broadcast(this, Killer);

	// 잠시 시체를 보여준 뒤 풀로 반납 — Destroy 하지 않습니다
	if (CorpseLingerSeconds > 0.f)
	{
		GetWorldTimerManager().SetTimer(ReleaseTimerHandle, this,
			&ASG_BaseMonster::OnReleaseToPool, CorpseLingerSeconds, false);
	}
	else
	{
		OnReleaseToPool();
	}
}

//──────────────────────────────────────────────────────────────────────
// 타격감 — 히트스톱 · 넉백 · 경직
//──────────────────────────────────────────────────────────────────────

void ASG_BaseMonster::PlayHitReaction(float DamageAmount, AActor* DamageCauser)
{
	const FVector HitLocation = GetActorLocation();

	if (HitSound)
	{
		UGameplayStatics::PlaySoundAtLocation(this, HitSound, HitLocation);
	}
	BP_OnHitReaction(HitLocation, DamageAmount);

	// ① 히트스톱 — 이 몬스터의 시간만 아주 짧게 늦춥니다.
	//    전역 시간(Global Time Dilation)을 건드리면 화면 전체가 끊겨 멀미가 납니다.
	if (HitStopSeconds > 0.f)
	{
		CustomTimeDilation = HitStopTimeDilation;
		GetWorldTimerManager().ClearTimer(HitStopTimerHandle);
		GetWorldTimerManager().SetTimer(HitStopTimerHandle, this,
			&ASG_BaseMonster::ClearHitStop, HitStopSeconds, false);
	}

	// ② 넉백 — 때린 쪽 반대 방향으로 밀립니다
	if (KnockbackStrength > 0.f && IsValid(DamageCauser))
	{
		FVector Dir = GetActorLocation() - DamageCauser->GetActorLocation();
		Dir.Z = 0.f;
		if (!Dir.IsNearlyZero())
		{
			Dir.Normalize();
			// 공중에 붕 뜨지 않게 살짝만 위로
			LaunchCharacter(Dir * KnockbackStrength + FVector(0.f, 0.f, 60.f), true, false);
		}
	}

	// ③ 경직 — 경직저항을 넘는 피해만 동작을 끊습니다.
	//    보스는 Poise를 높게 잡아 슈퍼아머를 줍니다.
	if (DamageAmount <= Poise || !HitReactMontage)
	{
		return;
	}
	if (State == ESGMonsterState::Dead || State == ESGMonsterState::Pooled)
	{
		return;
	}

	// 휘두르던 공격을 끊습니다 — 이게 있어야 "끊었다"는 쾌감이 생깁니다
	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (UAnimInstance* Anim = MeshComp->GetAnimInstance())
		{
			Anim->StopAllMontages(0.1f);
		}
	}
	HitActorsThisSwing.Reset();
	SetState(ESGMonsterState::Staggered);

	const float Duration = PlayAnimMontage(HitReactMontage);
	if (USkeletalMeshComponent* MeshComp = GetMesh())
	{
		if (UAnimInstance* Anim = MeshComp->GetAnimInstance())
		{
			FOnMontageEnded EndDelegate;
			EndDelegate.BindUObject(this, &ASG_BaseMonster::OnHitReactMontageEnded);
			Anim->Montage_SetEndDelegate(EndDelegate, HitReactMontage);
		}
	}
	// 몽타주가 안 돌면 경직 상태에 영원히 갇힙니다 — 안전장치
	if (Duration <= 0.f)
	{
		OnHitReactMontageEnded(HitReactMontage, true);
	}
}

void ASG_BaseMonster::OnHitReactMontageEnded(UAnimMontage* Montage, bool bInterrupted)
{
	if (State != ESGMonsterState::Staggered)
	{
		return;
	}
	SetState(CurrentTarget.IsValid() ? ESGMonsterState::Chasing : ESGMonsterState::Seeking);
}

void ASG_BaseMonster::ClearHitStop()
{
	CustomTimeDilation = 1.f;
}

//──────────────────────────────────────────────────────────────────────
// 거리 계산 — ★ 가장 흔한 함정
//──────────────────────────────────────────────────────────────────────

float ASG_BaseMonster::GetEdgeDistanceTo(AActor* Target) const
{
	if (!IsValid(Target))
	{
		return TNumericLimits<float>::Max();
	}

	FVector TargetLoc = Target->GetActorLocation();
	float Footprint = 0.f;

	if (Target->Implements<USG_Targetable>())
	{
		TargetLoc = ISG_Targetable::Execute_GetTargetLocation(Target);
		Footprint = ISG_Targetable::Execute_GetTargetFootprintRadius(Target);
	}
	else
	{
		// 인터페이스가 없으면 바운딩 박스로 대신 잽니다
		FVector Origin, Extent;
		Target->GetActorBounds(true, Origin, Extent);
		TargetLoc = Origin;
		Footprint = FMath::Max(Extent.X, Extent.Y);
	}

	// 높이 차이는 무시합니다 (언덕 위 거점을 못 때리는 문제 방지)
	FVector Delta = TargetLoc - GetActorLocation();
	Delta.Z = 0.f;

	// ★ 중심까지 거리에서 대상 몸집을 뺍니다.
	//   이걸 안 하면 3x3 크기의 거점 벽에 딱 붙어도 "아직 멀다"가 되어 영원히 공격을 시작하지 않습니다.
	return FMath::Max(0.f, Delta.Size() - Footprint - GetCapsuleComponent()->GetScaledCapsuleRadius());
}

bool ASG_BaseMonster::IsTargetInAttackRange(AActor* Target) const
{
	return GetEdgeDistanceTo(Target) <= BaseStats.AttackRange;
}

void ASG_BaseMonster::SetState(ESGMonsterState NewState)
{
	if (State == NewState)
	{
		return;
	}
	State = NewState;
}
