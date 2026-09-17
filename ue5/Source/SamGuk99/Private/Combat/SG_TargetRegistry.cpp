// Copyright 삼국지 99일 생존. 전투 코어 — 타겟 등록소
#include "Combat/SG_TargetRegistry.h"

void USG_TargetRegistry::RegisterTarget(AActor* Target)
{
	if (!IsValid(Target) || !Target->Implements<USG_Targetable>())
	{
		return;
	}
	Targets.AddUnique(Target);
}

void USG_TargetRegistry::UnregisterTarget(AActor* Target)
{
	Targets.RemoveAll([Target](const TWeakObjectPtr<AActor>& Ptr)
	{
		return !Ptr.IsValid() || Ptr.Get() == Target;
	});
}

bool USG_TargetRegistry::IsUsable(const TWeakObjectPtr<AActor>& Ptr)
{
	AActor* Actor = Ptr.Get();
	if (!IsValid(Actor))
	{
		return false;
	}
	// 인터페이스에 "지금 노릴 수 있는 상태냐"를 물어봅니다(부상 중인 병사 등은 제외).
	return ISG_Targetable::Execute_IsValidTarget(Actor);
}

AActor* USG_TargetRegistry::FindBestTarget(const FVector& FromLocation, float DetectRadius) const
{
	AActor* Best = nullptr;
	uint8 BestPriority = MAX_uint8;
	float BestDistSq = TNumericLimits<float>::Max();
	const float RadiusSq = DetectRadius * DetectRadius;

	for (const TWeakObjectPtr<AActor>& Ptr : Targets)
	{
		if (!IsUsable(Ptr))
		{
			continue;
		}
		AActor* Actor = Ptr.Get();
		const ESGTargetPriority Priority = ISG_Targetable::Execute_GetTargetPriority(Actor);

		// 거점은 "탐지 반경"과 무관하게 항상 최종 목표이므로 여기서는 건너뜁니다.
		// (주변에 아무도 없을 때 GetBaseTarget()으로 따로 잡습니다)
		if (Priority == ESGTargetPriority::Base)
		{
			continue;
		}

		const float DistSq = FVector::DistSquared(FromLocation, ISG_Targetable::Execute_GetTargetLocation(Actor));
		if (DistSq > RadiusSq)
		{
			continue;
		}

		// 우선순위가 낮은 숫자(장수 → 병사)를 먼저, 같은 순위면 가까운 쪽을.
		const uint8 P = static_cast<uint8>(Priority);
		if (P < BestPriority || (P == BestPriority && DistSq < BestDistSq))
		{
			BestPriority = P;
			BestDistSq = DistSq;
			Best = Actor;
		}
	}
	return Best;
}

AActor* USG_TargetRegistry::GetBaseTarget() const
{
	for (const TWeakObjectPtr<AActor>& Ptr : Targets)
	{
		if (!IsUsable(Ptr))
		{
			continue;
		}
		AActor* Actor = Ptr.Get();
		if (ISG_Targetable::Execute_GetTargetPriority(Actor) == ESGTargetPriority::Base)
		{
			return Actor;
		}
	}
	return nullptr;
}

AActor* USG_TargetRegistry::FindNearestStructure(const FVector& FromLocation) const
{
	AActor* Best = nullptr;
	float BestDistSq = TNumericLimits<float>::Max();

	for (const TWeakObjectPtr<AActor>& Ptr : Targets)
	{
		if (!IsUsable(Ptr))
		{
			continue;
		}
		AActor* Actor = Ptr.Get();
		if (ISG_Targetable::Execute_GetTargetPriority(Actor) != ESGTargetPriority::Structure)
		{
			continue;
		}
		const float DistSq = FVector::DistSquared(FromLocation, ISG_Targetable::Execute_GetTargetLocation(Actor));
		if (DistSq < BestDistSq)
		{
			BestDistSq = DistSq;
			Best = Actor;
		}
	}
	return Best;
}
