#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/AincendraInteractableInterface.h"
#include "ElarionInteractableActor.generated.h"

class UStaticMeshComponent;

/**
 * Lightweight UE5 Interactable Prop Actor (notice boards, mana manifolds, plaques, counters).
 * Uses zero per-frame tick overhead; evaluated on player trace/proximity query.
 */
UCLASS()
class AINCENDRA_API AElarionInteractableActor : public AActor, public IAincendraInteractableInterface
{
	GENERATED_BODY()

public:
	AElarionInteractableActor();

	virtual FInteractionInfo GetInteractionInfo_Implementation() const override;
	virtual void OnInteract_Implementation(AActor* Interactor) override;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Interaction")
	TObjectPtr<UStaticMeshComponent> MeshComponent;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	FInteractionInfo InteractionData;

	UFUNCTION(BlueprintImplementableEvent, Category = "Interaction")
	void BP_OnInspected(AActor* Interactor, const FInteractionInfo& Info);
};
