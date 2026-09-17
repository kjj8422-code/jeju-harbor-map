// Copyright 삼국지 99일 생존. 전투 코어 — 몬스터 쇼룸(에셋 검수용)
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "SG_MonsterShowroom.generated.h"

class ASG_BaseMonster;
class UAnimMontage;

/**
 * 쇼룸 — 만든 몬스터와 모션을 게임에 넣기 전에 혼자 돌려보는 시험대.
 *
 * 왜 필요한가:
 * 새 몬스터를 바로 게임에 넣으면 "웨이브를 기다렸다가, 걔가 나오길 기다렸다가,
 * 운 좋게 공격 모션이 나오길 기다려야" 확인이 됩니다. 한 번 보는 데 몇 분씩 걸리죠.
 * 쇼룸 씬에 이 액터 하나만 놓으면 버튼 한 번에 원하는 몬스터·모션을 즉시 봅니다.
 *
 * 쓰는 법:
 *   1) 빈 레벨(쇼룸 씬)을 만들고 이 액터를 놓습니다
 *   2) MonsterClasses 배열에 검수할 몬스터 블루프린트들을 넣습니다
 *   3) 플레이 → 콘솔(~)에서 SG.Showroom.Next / SG.Showroom.PlayMontage 0 입력
 *      또는 블루프린트에서 버튼 UI에 함수들을 연결
 */
UCLASS()
class SAMGUK99_API ASG_MonsterShowroom : public AActor
{
	GENERATED_BODY()

public:
	ASG_MonsterShowroom();

	virtual void BeginPlay() override;

	/** 다음 몬스터로 교체 */
	UFUNCTION(BlueprintCallable, Exec, Category = "SG|Showroom")
	void ShowroomNext();

	/** 이전 몬스터로 */
	UFUNCTION(BlueprintCallable, Exec, Category = "SG|Showroom")
	void ShowroomPrev();

	/** 지금 세워둔 몬스터의 몽타주를 인덱스로 재생 (공격·피격·사망 순서로 넣어두면 편합니다) */
	UFUNCTION(BlueprintCallable, Exec, Category = "SG|Showroom")
	void ShowroomPlayMontage(int32 MontageIndex);

	/** 가상의 피해를 먹여 피격 반응과 타격감을 확인 */
	UFUNCTION(BlueprintCallable, Exec, Category = "SG|Showroom")
	void ShowroomHit(float DamageAmount = 10.f);

	/** 지금 몬스터를 처음 상태로 되돌립니다 (체력·애니메이션 초기화) */
	UFUNCTION(BlueprintCallable, Exec, Category = "SG|Showroom")
	void ShowroomReset();

	/** 현재 몬스터 이름 — UI에 띄우면 편합니다 */
	UFUNCTION(BlueprintPure, Category = "SG|Showroom")
	FString GetCurrentMonsterName() const;

protected:
	/** 검수할 몬스터 블루프린트 목록 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Showroom")
	TArray<TSubclassOf<ASG_BaseMonster>> MonsterClasses;

	/** 쇼룸에서 재생해볼 몽타주 목록 (몬스터 클래스와 별개로 직접 지정) */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Showroom")
	TArray<TObjectPtr<UAnimMontage>> TestMontages;

	/** 몬스터를 세울 위치 (비우면 이 액터 위치) */
	UPROPERTY(EditInstanceOnly, BlueprintReadWrite, Category = "SG|Showroom")
	TObjectPtr<AActor> DisplayPoint;

	/** 쇼룸에서는 AI를 꺼둡니다 — 안 그러면 카메라를 향해 걸어옵니다 */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SG|Showroom")
	bool bDisableAI = true;

private:
	void SpawnCurrent();

	UPROPERTY()
	TObjectPtr<ASG_BaseMonster> CurrentMonster;

	int32 CurrentIndex = 0;
};
