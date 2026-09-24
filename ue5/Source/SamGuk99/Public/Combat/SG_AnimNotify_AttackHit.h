// Copyright 삼국지 99일 생존. 전투 코어 — 타격 판정 노티파이
#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimNotifies/AnimNotify.h"
#include "SG_AnimNotify_AttackHit.generated.h"

/**
 * ★ 애니메이션 타이밍에 맞춘 타격 판정의 정체.
 *
 * 공격 몽타주 타임라인에서 "칼이 실제로 몸에 닿는 프레임"에 이 노티파이를 찍습니다.
 * 그 순간 엔진이 이 클래스를 호출하고, 그때서야 피해 판정이 돌아갑니다.
 *
 * 이걸 안 쓰고 공격 시작과 동시에 피해를 주면:
 *  - 칼을 뽑기도 전에 피가 닳아서 "맞은 것 같지 않은" 느낌이 납니다
 *  - 공격을 중간에 끊어도 피해가 이미 들어가 있어 회피가 의미를 잃습니다
 *
 * 사용법: 몽타주 편집창 → Notifies 트랙 우클릭 → Add Notify → SG Attack Hit
 */
UCLASS(meta = (DisplayName = "SG Attack Hit (타격 판정)"))
class SAMGUK99_API USG_AnimNotify_AttackHit : public UAnimNotify
{
	GENERATED_BODY()

public:
	USG_AnimNotify_AttackHit();

	virtual void Notify(USkeletalMeshComponent* MeshComp, UAnimSequenceBase* Animation,
	                    const FAnimNotifyEventReference& EventReference) override;

	virtual FString GetNotifyName_Implementation() const override;

	/**
	 * 어떤 타격인지 구분하는 이름.
	 *  "Melee" — 기본 근접 공격
	 *  "Slam"  — 보스 광역 내려찍기
	 * 보스가 패턴마다 다른 판정을 쓰려면 이 이름만 바꿔 찍으면 됩니다.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG")
	FName HitTag = TEXT("Melee");
};
