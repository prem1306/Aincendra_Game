#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "AincendraInteractableInterface.generated.h"

USTRUCT(BlueprintType)
struct FInteractionInfo
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	FText PromptAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	FText Title;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	FText Subtitle;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	TArray<FText> Lines;
};

UINTERFACE(MinimalAPI, Blueprintable)
class UAincendraInteractableInterface : public UInterface
{
	GENERATED_BODY()
};

class AINCENDRA_API IAincendraInteractableInterface
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Interaction")
	FInteractionInfo GetInteractionInfo() const;

	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Interaction")
	void OnInteract(AActor* Interactor);
};
