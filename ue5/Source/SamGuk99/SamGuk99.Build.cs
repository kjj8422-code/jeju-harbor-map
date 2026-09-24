// Copyright 삼국지 99일 생존.
using UnrealBuildTool;

public class SamGuk99 : ModuleRules
{
	public SamGuk99(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"AIModule",          // AAIController, MoveToActor
			"NavigationSystem",  // 내비메시 위치 보정
			"GameplayTasks"      // AIModule 이 요구합니다
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}
