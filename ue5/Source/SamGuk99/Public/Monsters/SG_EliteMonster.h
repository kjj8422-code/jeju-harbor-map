// Copyright 삼국지 99일 생존. 전투 코어 — 정예 몬스터
#pragma once

#include "CoreMinimal.h"
#include "Monsters/SG_BaseMonster.h"
#include "SG_EliteMonster.generated.h"

/**
 * 정예 몬스터.
 *
 * 부모(ASG_BaseMonster)의 AI 흐름은 그대로 쓰고, 딱 두 가지만 얹습니다.
 *  ① 돌진 — 멀리 있을 때 가끔 튀어나옵니다. 방어선을 한 번에 뚫으려는 위협.
 *  ② 처치 보상 — 죽을 때 특수 재료를 떨굽니다(안전하게 막기 vs 이득 보기의 선택).
 *
 * ★ 여기서 부모의 TickAI 를 통째로 복사해 고치면 안 됩니다.
 *   부모를 고칠 때마다 자식도 같이 고쳐야 하는 지옥이 시작됩니다.
 *   필요한 함수 하나만 override 하세요.
 */
UCLASS()
class SAMGUK99_API ASG_EliteMonster : public ASG_BaseMonster
{
	GENERATED_BODY()

public:
	ASG_EliteMonster();

	virtual void OnAcquireFromPool(const FVector& SpawnLocation, const FRotator& SpawnRotation, float StatMultiplier) override;
	virtual void OnAttackHitWindow(FName HitTag) override;

protected:
	/** 추적 중 돌진 조건을 확인합니다 — 부모의 추적 로직은 그대로 두고 앞에 한 겹만 덧댑니다 */
	virtual void TickChase(float DeltaSeconds) override;

	virtual void Die(AActor* Killer) override;

	/** 돌진 시작 */
	virtual void BeginCharge();

	UFUNCTION()
	void OnChargeMontageEnded(UAnimMontage* Montage, bool bInterrupted);

protected:
	/** 돌진 몽타주. 이 안에 HitTag 가 "Charge" 인 타격 노티파이를 찍습니다. */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Elite")
	TObjectPtr<UAnimMontage> ChargeMontage;

	/** 이 거리(cm) 이상 떨어져 있을 때만 돌진합니다 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Elite", meta = (ClampMin = "100.0"))
	float ChargeMinDistance = 600.f;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Elite", meta = (ClampMin = "100.0"))
	float ChargeMaxDistance = 1400.f;

	/** 돌진 재사용 대기(초) */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Elite", meta = (ClampMin = "1.0"))
	float ChargeCooldown = 8.f;

	/** 돌진 추진력(cm/s) */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Elite", meta = (ClampMin = "0.0"))
	float ChargeImpulse = 1600.f;

	/** 돌진 피해 배율 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Elite", meta = (ClampMin = "0.1"))
	float ChargeDamageScale = 1.6f;

	/** 처치 시 떨어뜨릴 것 (특수 재료 액터) */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Elite")
	TSubclassOf<AActor> DropActorClass;

	/** 떨어뜨릴 개수 */
	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "SG|Elite", meta = (ClampMin = "0"))
	int32 DropCount = 1;

private:
	float ChargeCooldownRemaining = 0.f;
};
