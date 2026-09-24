// Copyright 삼국지 99일 생존. 전투 코어 — 타겟 인터페이스
#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "SG_Targetable.generated.h"

/**
 * 몬스터가 노릴 수 있는 대상의 우선순위.
 * 숫자가 낮을수록 먼저 노립니다. 2D 프로토타입에서 검증한 우선순위와 동일합니다:
 *   눈앞의 장수·병사 → 거점.
 */
UENUM(BlueprintType)
enum class ESGTargetPriority : uint8
{
	Hero      UMETA(DisplayName = "장수"),
	Soldier   UMETA(DisplayName = "병사"),
	Structure UMETA(DisplayName = "건물(목책 등)"),
	Base      UMETA(DisplayName = "거점")
};

UINTERFACE(MinimalAPI, Blueprintable)
class USG_Targetable : public UInterface
{
	GENERATED_BODY()
};

/**
 * 장수·병사·거점·목책이 구현하는 인터페이스.
 * 이걸 구현한 액터만 몬스터의 타겟 후보가 됩니다.
 */
class SAMGUK99_API ISG_Targetable
{
	GENERATED_BODY()

public:
	/** 아직 살아 있어서 노릴 가치가 있는가 (죽었거나 부상 중이면 false) */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "SG|Target")
	bool IsValidTarget() const;

	/** 이 대상의 우선순위 */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "SG|Target")
	ESGTargetPriority GetTargetPriority() const;

	/** 타격 판정에 쓸 중심 위치 (거점처럼 큰 건물은 액터 위치가 아니라 별도 지점일 수 있음) */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "SG|Target")
	FVector GetTargetLocation() const;

	/**
	 * 이 대상의 몸집 반지름(cm).
	 * ★ 중요: 거점처럼 큰 건물은 "중심까지의 거리"로 도착 판정을 하면 영원히 도착 못 합니다.
	 *   반드시 (중심까지 거리 - 이 반지름)으로 판정해야 벽에 붙었을 때 공격이 시작됩니다.
	 */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "SG|Target")
	float GetTargetFootprintRadius() const;
};
