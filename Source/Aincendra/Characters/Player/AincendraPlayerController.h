#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "AincendraPlayerController.generated.h"

class UInputMappingContext;

UCLASS()
class AINCENDRA_API AAincendraPlayerController : public APlayerController
{
	GENERATED_BODY()

protected:
	virtual void BeginPlay() override;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
	TObjectPtr<UInputMappingContext> DefaultMappingContext;
};
