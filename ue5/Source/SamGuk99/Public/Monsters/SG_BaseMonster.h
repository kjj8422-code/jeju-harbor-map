// Copyright 삼국지 99일 생존. 전투 코어 — 모든 몬스터의 부모 클래스
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Animation/AnimMontage.h"
#include "Sound/SoundBase.h"
#include "Monsters/SG_MonsterTypes.h"
#include "SG_BaseMonster.generated.h"

class USG_TargetRegistry;
class AAIController;

/** 몬스터가 죽었을 때 스포너·풀이 받는 신호 */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FSGOnMonsterDied, ASG_BaseMonster*, Monster, AActor*, Killer);

/**
 * 모든 몬스터의 부모.
 *
 * ── 이 클래스가 책임지는 것 ──
 *  ① 능력치 보관과 배율 적용 (데이터 테이블에서 주입받음)
 *  ② 오브젝트 풀링 (죽어도 Destroy 하지 않고 재사용)
 *  ③ AI 3단계 상태 머신: 타겟 탐색 → 추적 → 애니메이션 타이밍 타격
 *  ④ 길이 막혔을 때 목책을 부수는 예외 행동
 *
 * ── 자식 클래스가 하는 것 ──
 *  정예: 고유 패턴 하나 추가 (돌진 등)
 *  보스: 페이즈 전환 + 광역 공격 패턴 추가
 *  → 부모의 AI 흐름은 건드리지 않고 필요한 함수만 override 합니다.
 *
 * 추상 클래스입니다. 실제로 배치하는 건 이걸 상속한 블루프린트(BP_Grunt 등)입니다.
 */
UCLASS(Abstract, Blueprintable)
class SAMGUK99_API ASG_BaseMonster : public ACharacter
{
	GENERATED_BODY()

public:
	ASG_BaseMonster();

	virtual void Tick(float DeltaSeconds) override;
	virtual void BeginPlay() override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent,
	                         AController* EventInstigator, AActor* DamageCauser) override;

	//──────────────────────────────────────────────────────────────
	// ② 오브젝트 풀링
	//──────────────────────────────────────────────────────────────

	/**
	 * 풀에서 꺼내 전장에 세울 때 호출됩니다.
	 * 체력·상태·충돌·애니메이션을 전부 초기 상태로 되돌립니다.
	 * ★ 여기서 하나라도 빠뜨리면 "두 번째 웨이브부터 몬스터가 이상해지는" 버그가 납니다.
	 */
	virtual void OnAcquireFromPool(const FVector& SpawnLocation, const FRotator& SpawnRotation, float StatMultiplier);

	/** 풀로 되돌릴 때 호출 — 화면에서 숨기고 틱을 끕니다 */
	virtual void OnReleaseToPool();

	/** 지금 전장에 나와 있는가 */
	UFUNCTION(BlueprintPure, Category = "SG|Pool")
	bool IsActiveInField() const { return State != ESGMonsterState::Pooled && State != ESGMonsterState::Dead; }

	//──────────────────────────────────────────────────────────────
	// ① 능력치
	//──────────────────────────────────────────────────────────────

	/** 능력치에 배율을 곱해 적용합니다 (웨이브 강도·명성 시스템 배율) */
	UFUNCTION(BlueprintCallable, Category = "SG|Stats")
	void ApplyStats(const FSGMonsterStats& InStats, float Multiplier);

	UFUNCTION(BlueprintPure, Category = "SG|Stats")
	float GetHealthPercent() const { return BaseStats.MaxHealth > 0.f ? CurrentHealth / BaseStats.MaxHealth : 0.f; }

	UFUNCTION(BlueprintPure, Category = "SG|Stats")
	ESGMonsterGrade GetGrade() const { return Grade; }

	/** 죽었을 때 스포너가 구독하는 신호 */
	UPROPERTY(BlueprintAssignable, Category = "SG|Combat")
	FSGOnMonsterDied OnMonsterDied;

	//──────────────────────────────────────────────────────────────
	// 연출 훅 — 이펙트·카메라 흔들림은 블루프린트에서 붙입니다.
	// C++에 Niagara를 직접 물리지 않아 아티스트가 코드 없이 교체할 수 있습니다.
	//──────────────────────────────────────────────────────────────

	/** 맞았을 때 — 피 튀김, 카메라 흔들림, 히트 마커를 여기에 */
	UFUNCTION(BlueprintImplementableEvent, Category = "SG|FX")
	void BP_OnHitReaction(const FVector& HitLocation, float DamageAmount);

	/** 공격 타격 프레임에 실제로 뭔가를 맞혔을 때 — 타격 이펙트를 여기에 */
	UFUNCTION(BlueprintImplementableEvent, Category = "SG|FX")
	void BP_OnAttackLanded(AActor* Victim, const FVector& HitLocation);

	/** 죽을 때 — 사망 이펙트, 드랍 아이템 스폰을 여기에 */
	UFUNCTION(BlueprintImplementableEvent, Category = "SG|FX")
	void BP_OnDeath(AActor* Killer);

	//──────────────────────────────────────────────────────────────
	// ③ 애니메이션 타이밍 타격 — AnimNotify가 이 함수를 부릅니다
	//──────────────────────────────────────────────────────────────

	/**
	 * 공격 애니메이션의 "칼이 실제로 닿는 프레임"에 AnimNotify가 호출합니다.
	 * 이렇게 해야 휘두르기 시작하자마자 피가 닳는 어색함이 사라집니다.
	 * @param HitTag  어떤 타격인지 구분 (기본 공격 "Melee", 보스 광역 "Slam" 등)
	 */
	UFUNCTION(BlueprintCallable, Category = "SG|Combat")
	virtual void OnAttackHitWindow(FName HitTag);

protected:
	//──────────────────────────────────────────────────────────────
	// AI 3단계 — 자식 클래스는 이 함수들만 갈아끼우면 됩니다
	//──────────────────────────────────────────────────────────────

	/** 상태 머신 본체. 매 틱이 아니라 AIThinkInterval 간격으로만 돕니다. */
	virtual void TickAI(float DeltaSeconds);

	/** ① 타겟 탐색 — 누구를 칠 것인가 */
	virtual AActor* FindTarget();

	/** ② 추적 — 타겟까지 이동 명령 */
	virtual void TickChase(float DeltaSeconds);

	/** ③ 공격 시작 — 몽타주를 재생합니다. 실제 피해는 AnimNotify가 줍니다. */
	virtual void BeginAttack();

	/** 공격 몽타주가 끝났을 때 */
	UFUNCTION()
	virtual void OnAttackMontageEnded(UAnimMontage* Montage, bool bInterrupted);

	/** 사망 처리 */
	virtual void Die(AActor* Killer);

	//──────────────────────────────────────────────────────────────
	// 타격감 — 맞았을 때의 반응
	//──────────────────────────────────────────────────────────────

	/**
	 * 피격 반응. "때린 것 같은 느낌"은 피가 닳는 숫자가 아니라 여기서 나옵니다.
	 *  - 히트스톱: 맞는 순간 아주 짧게 시간을 멈춰 충격을 각인시킵니다
	 *  - 넉백: 뒤로 밀립니다
	 *  - 경직: 경직저항(Poise)보다 큰 피해면 동작이 끊기고 피격 모션이 나옵니다
	 */
	virtual void PlayHitReaction(float DamageAmount, AActor* DamageCauser);

	/** 경직 몽타주가 끝났을 때 */
	UFUNCTION()
	virtual void OnHitReactMontageEnded(UAnimMontage* Montage, bool bInterrupted);

	/** 히트스톱 해제 (타이머가 부릅니다) */
	UFUNCTION()
	void ClearHitStop();

	/** 길이 완전히 막혔을 때 — 가장 가까운 목책을 부수러 갑니다 */
	virtual void EnterBreachMode();

	/** 타겟까지의 "가장자리 기준" 거리. ★ 큰 건물은 중심 거리로 재면 영원히 도착 못 합니다. */
	float GetEdgeDistanceTo(AActor* Target) const;

	/** 지금 공격 사거리 안에 들어왔는가 */
	bool IsTargetInAttackRange(AActor* Target) const;

	/** 타격 판정 — 앞쪽으로 구체를 쓸어 담아 맞은 대상에게 피해를 줍니다 */
	virtual void PerformMeleeSweep(float Damage, float Range, float Radius);

	/** 상태 전환 (로그·애니메이션 연동 지점) */
	void SetState(ESGMonsterState NewState);

	USG_TargetRegistry* GetRegistry() const;

protected:
	//──────────────────────────────────────────────────────────────
	// 에디터에서 조정하는 값들
	//──────────────────────────────────────────────────────────────

	/** 이 몬스터의 기본 능력치. 블루프린트에서 종류별로 다르게 설정합니다. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Stats")
	FSGMonsterStats BaseStats;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Stats")
	ESGMonsterGrade Grade = ESGMonsterGrade::Normal;

	/** 기본 공격 몽타주 — 이 안에 SG Attack Hit Window 노티파이를 찍어둬야 합니다 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Anim")
	TObjectPtr<UAnimMontage> AttackMontage;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Anim")
	TObjectPtr<UAnimMontage> DeathMontage;

	/**
	 * AI 판단 주기(초). 0.1이면 초당 10번만 생각합니다.
	 * ★ 성능의 핵심: 몬스터 30마리가 매 프레임 판단하면 프레임이 무너집니다.
	 *   이동 자체는 CharacterMovement가 매 프레임 부드럽게 처리하므로 끊겨 보이지 않습니다.
	 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|AI", meta = (ClampMin = "0.02"))
	float AIThinkInterval = 0.1f;

	/** 타겟을 다시 고르는 주기(초) — 매번 고르면 낭비, 너무 늦으면 멍청해 보입니다 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|AI", meta = (ClampMin = "0.1"))
	float TargetRefreshInterval = 0.8f;

	/** 이 시간(초) 동안 타겟에 가까워지지 못하면 "길이 막혔다"고 판단합니다 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|AI", meta = (ClampMin = "0.5"))
	float StuckThresholdSeconds = 2.5f;

	//──────────────────────────────────────────────────────────────
	// 타격감 설정
	//──────────────────────────────────────────────────────────────

	/** 피격 모션. 없으면 경직 없이 맞기만 합니다. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Feel")
	TObjectPtr<UAnimMontage> HitReactMontage;

	/**
	 * 경직저항. 한 번에 이 값을 넘는 피해를 받아야 동작이 끊깁니다.
	 * 일반 몹은 0(늘 경직), 정예는 중간, 보스는 아주 높게(슈퍼아머) 잡습니다.
	 * ★ 이 값이 없으면 보스가 다구리에 아무것도 못 하고 서서 죽습니다.
	 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Feel", meta = (ClampMin = "0.0"))
	float Poise = 0.f;

	/** 히트스톱 길이(초). 0.03~0.08이 적당합니다. 길면 게임이 버벅이는 것처럼 느껴집니다. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Feel", meta = (ClampMin = "0.0", ClampMax = "0.2"))
	float HitStopSeconds = 0.05f;

	/** 히트스톱 동안 이 몬스터의 시간 배율 (0.05 = 거의 정지) */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Feel", meta = (ClampMin = "0.01", ClampMax = "1.0"))
	float HitStopTimeDilation = 0.05f;

	/** 넉백 세기(cm/s). 0이면 안 밀립니다. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Feel", meta = (ClampMin = "0.0"))
	float KnockbackStrength = 250.f;

	/** 공격 휘두를 때 소리 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Sound")
	TObjectPtr<USoundBase> AttackSound;

	/** 맞았을 때 소리 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Sound")
	TObjectPtr<USoundBase> HitSound;

	/** 죽을 때 소리 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Sound")
	TObjectPtr<USoundBase> DeathSound;

	/** 사망 후 풀로 돌아가기까지의 시간(초) — 사망 애니메이션이 보일 시간 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Pool", meta = (ClampMin = "0.0"))
	float CorpseLingerSeconds = 2.0f;

	//──────────────────────────────────────────────────────────────
	// 런타임 상태
	//──────────────────────────────────────────────────────────────

	UPROPERTY(BlueprintReadOnly, Category = "SG|Runtime")
	ESGMonsterState State = ESGMonsterState::Pooled;

	UPROPERTY(BlueprintReadOnly, Category = "SG|Runtime")
	float CurrentHealth = 0.f;

	/** 이번 스폰에 적용된 배율 (리포트·디버그용) */
	UPROPERTY(BlueprintReadOnly, Category = "SG|Runtime")
	float AppliedMultiplier = 1.f;

	UPROPERTY(BlueprintReadOnly, Category = "SG|Runtime")
	TWeakObjectPtr<AActor> CurrentTarget;

	float AttackCooldownRemaining = 0.f;
	float ThinkAccumulator = 0.f;
	float TargetRefreshTimer = 0.f;
	float StuckTimer = 0.f;
	float LastDistanceToTarget = TNumericLimits<float>::Max();

	/** 한 번의 타격에서 같은 대상을 두 번 때리지 않도록 */
	UPROPERTY()
	TArray<TObjectPtr<AActor>> HitActorsThisSwing;

	FTimerHandle ReleaseTimerHandle;
	FTimerHandle HitStopTimerHandle;
};
