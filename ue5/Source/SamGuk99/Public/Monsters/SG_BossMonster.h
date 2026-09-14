// Copyright 삼국지 99일 생존. 전투 코어 — 보스 몬스터
#pragma once

#include "CoreMinimal.h"
#include "Monsters/SG_BaseMonster.h"
#include "SG_BossMonster.generated.h"

/** 보스 페이즈 하나의 설정 */
USTRUCT(BlueprintType)
struct SAMGUK99_API FSGBossPhase
{
	GENERATED_BODY()

	/** 체력이 이 비율 아래로 내려가면 이 페이즈로 넘어갑니다 (1.0 = 시작, 0.6 = 60%) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Boss", meta = (ClampMin = "0.0", ClampMax = "1.0"))
	float HealthThreshold = 1.f;

	/** 이 페이즈의 공격력 배율 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Boss", meta = (ClampMin = "0.1"))
	float DamageScale = 1.f;

	/** 이 페이즈의 이동 속도 배율 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Boss", meta = (ClampMin = "0.1"))
	float SpeedScale = 1.f;

	/** 광역 공격 재사용 대기(초). 페이즈가 올라갈수록 짧게 잡습니다. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Boss", meta = (ClampMin = "0.5"))
	float SlamCooldown = 10.f;

	/** 페이즈 진입 연출 몽타주 (포효 등). 비워두면 즉시 전환됩니다. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Boss")
	TObjectPtr<UAnimMontage> EnterMontage;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FSGOnBossPhaseChanged, int32, NewPhase, float, HealthPercent);

/**
 * 보스 몬스터 (33일 산적 두목 → 66일 오두미도 광신도 → 99일 최후의 결전).
 *
 * ★ 설계 원칙: 기본 몬스터 로직은 한 줄도 다시 쓰지 않습니다.
 *   상속받아 쓰고, 보스만의 것 두 가지를 얹습니다.
 *     ① 페이즈 전환 — 체력이 깎일수록 더 빠르고 아프게
 *     ② 광역 공격 — 방어선을 한 번에 쓸어버리는 패턴
 *
 * 부모에서 물려받아 그대로 쓰는 것: 타겟 탐색, 추적, 사거리 판정,
 * 애니메이션 타이밍 타격, 풀링, 피격 반응, 목책 파괴.
 */
UCLASS()
class SAMGUK99_API ASG_BossMonster : public ASG_BaseMonster
{
	GENERATED_BODY()

public:
	ASG_BossMonster();

	virtual void OnAcquireFromPool(const FVector& SpawnLocation, const FRotator& SpawnRotation, float StatMultiplier) override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent,
	                         AController* EventInstigator, AActor* DamageCauser) override;
	virtual void OnAttackHitWindow(FName HitTag) override;

	UFUNCTION(BlueprintPure, Category = "SG|Boss")
	int32 GetCurrentPhase() const { return CurrentPhase; }

	/** UI 체력바·연출이 구독합니다 */
	UPROPERTY(BlueprintAssignable, Category = "SG|Boss")
	FSGOnBossPhaseChanged OnPhaseChanged;

protected:
	/** 공격 선택 — 광역 쿨다운이 돌아왔으면 광역, 아니면 부모의 기본 공격 */
	virtual void BeginAttack() override;

	virtual void TickAI(float DeltaSeconds) override;

	/** 페이즈 전환 */
	virtual void EnterPhase(int32 NewPhase);

	/** 광역 내려찍기 시작 */
	virtual void BeginSlam();

	UFUNCTION()
	void OnSlamMontageEnded(UAnimMontage* Montage, bool bInterrupted);

	/** 광역 타격 판정 — 앞이 아니라 자기 주변 전체를 때립니다 */
	virtual void PerformRadialSlam();

	/** 페이즈 진입 연출이 끝났을 때 */
	UFUNCTION()
	void OnPhaseEnterMontageEnded(UAnimMontage* Montage, bool bInterrupted);

protected:
	/**
	 * 페이즈 목록. HealthThreshold 가 큰 것부터 순서대로 넣으세요.
	 * 예: [0] 1.0(1페이즈) / [1] 0.6(2페이즈) / [2] 0.3(3페이즈)
	 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Boss")
	TArray<FSGBossPhase> Phases;

	/** 광역 몽타주. 이 안에 HitTag 가 "Slam" 인 타격 노티파이를 찍습니다. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Boss")
	TObjectPtr<UAnimMontage> SlamMontage;

	/** 광역 반경(cm) */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Boss", meta = (ClampMin = "100.0"))
	float SlamRadius = 500.f;

	/** 광역 피해 배율 (기본 공격력 기준) */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Boss", meta = (ClampMin = "0.1"))
	float SlamDamageScale = 2.0f;

	/** 광역을 쓰려면 이 거리 안에 대상이 있어야 합니다 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Boss", meta = (ClampMin = "100.0"))
	float SlamTriggerRange = 450.f;

	/**
	 * 광역 예고 시간(초).
	 * ★ 피할 시간을 안 주면 유저는 "내가 못 피했다"가 아니라 "이건 사기다"라고 느낍니다.
	 *   바닥에 붉은 원을 띄우는 연출을 BP_OnSlamTelegraph 에 붙이세요.
	 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Boss", meta = (ClampMin = "0.0"))
	float SlamTelegraphSeconds = 1.2f;

	/** 광역 예고 연출 — 바닥 붉은 원, 경고음을 여기에 */
	UFUNCTION(BlueprintImplementableEvent, Category = "SG|Boss")
	void BP_OnSlamTelegraph(float Radius, float LeadSeconds);

	/** 페이즈 전환 연출 — 화면 흔들림, 보스 이름 UI 갱신을 여기에 */
	UFUNCTION(BlueprintImplementableEvent, Category = "SG|Boss")
	void BP_OnPhaseChanged(int32 NewPhase);

private:
	int32 CurrentPhase = 0;
	float SlamCooldownRemaining = 0.f;
	float BaseAttackDamageSnapshot = 0.f;
	float BaseMoveSpeedSnapshot = 0.f;
};
