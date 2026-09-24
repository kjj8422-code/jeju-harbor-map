// Copyright 삼국지 99일 생존. 전투 코어 — 타겟 등록소
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "SG_Targetable.h"
#include "SG_TargetRegistry.generated.h"

/**
 * 장수·병사·거점·목책이 스스로 등록하는 명부.
 *
 * 왜 필요한가: 몬스터 20마리가 매 프레임 "주변에 뭐가 있나" 충돌 검사를 돌리면
 * 프레임이 무너집니다. 대신 대상들이 스스로 여기 이름을 올려두고,
 * 몬스터는 이 짧은 목록만 훑습니다. (20마리 × 명부 10개 = 200번 비교, 공짜나 마찬가지)
 */
UCLASS()
class SAMGUK99_API USG_TargetRegistry : public UWorldSubsystem
{
	GENERATED_BODY()

public:
	/** 등록 — 장수/병사는 BeginPlay에서, 목책은 건설 완료 시 호출 */
	UFUNCTION(BlueprintCallable, Category = "SG|Target")
	void RegisterTarget(AActor* Target);

	/** 해제 — 사망/파괴/풀 반납 시 호출 */
	UFUNCTION(BlueprintCallable, Category = "SG|Target")
	void UnregisterTarget(AActor* Target);

	/**
	 * 이 위치에서 가장 적합한 타겟 하나를 고릅니다.
	 * 규칙: 탐지 반경 안의 장수·병사를 먼저, 없으면 거점.
	 * (2D 프로토타입에서 검증한 우선순위 그대로)
	 */
	UFUNCTION(BlueprintCallable, Category = "SG|Target")
	AActor* FindBestTarget(const FVector& FromLocation, float DetectRadius) const;

	/** 거점(최종 목표)만 따로 얻기 — 탐지 반경 밖일 때 쓰는 기본 목표 */
	UFUNCTION(BlueprintCallable, Category = "SG|Target")
	AActor* GetBaseTarget() const;

	/** 가장 가까운 건물(목책) — 길이 완전히 막혔을 때 부술 대상 */
	UFUNCTION(BlueprintCallable, Category = "SG|Target")
	AActor* FindNearestStructure(const FVector& FromLocation) const;

private:
	/** 등록된 대상들. TWeakObjectPtr이라 대상이 파괴돼도 댕글링 포인터가 안 남습니다. */
	TArray<TWeakObjectPtr<AActor>> Targets;

	static bool IsUsable(const TWeakObjectPtr<AActor>& Ptr);
};
