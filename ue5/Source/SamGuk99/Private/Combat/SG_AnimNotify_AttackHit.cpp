// Copyright 삼국지 99일 생존. 전투 코어 — 타격 판정 노티파이
#include "Combat/SG_AnimNotify_AttackHit.h"

#include "Components/SkeletalMeshComponent.h"
#include "Monsters/SG_BaseMonster.h"

USG_AnimNotify_AttackHit::USG_AnimNotify_AttackHit()
{
#if WITH_EDITORONLY_DATA
	// 몽타주 타임라인에서 눈에 잘 띄게 붉은색으로
	NotifyColor = FColor(198, 65, 47);
#endif
}

void USG_AnimNotify_AttackHit::Notify(USkeletalMeshComponent* MeshComp, UAnimSequenceBase* Animation,
                                      const FAnimNotifyEventReference& EventReference)
{
	Super::Notify(MeshComp, Animation, EventReference);

	if (!MeshComp)
	{
		return;
	}

	// 애니메이션 미리보기 창(에디터)에서도 이 노티파이가 돌아갑니다.
	// 거기엔 진짜 몬스터가 없으므로 조용히 빠져나가야 로그가 더러워지지 않습니다.
	AActor* Owner = MeshComp->GetOwner();
	if (ASG_BaseMonster* Monster = Cast<ASG_BaseMonster>(Owner))
	{
		Monster->OnAttackHitWindow(HitTag);
	}
}

FString USG_AnimNotify_AttackHit::GetNotifyName_Implementation() const
{
	return FString::Printf(TEXT("타격: %s"), *HitTag.ToString());
}
