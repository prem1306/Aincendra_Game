#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Interaction/AincendraInteractableInterface.h"
#include "AincendraNPC.generated.h"

class USphereComponent;

UENUM(BlueprintType)
enum class ENPCBehaviorState : uint8
{
	Idle		UMETA(DisplayName = "Idle"),
	Patrol		UMETA(DisplayName = "Patrol"),
	Work		UMETA(DisplayName = "Work"),
	Interact	UMETA(DisplayName = "Interact")
};

UCLASS()
class AINCENDRA_API AAincendraNPC : public ACharacter, public IAincendraInteractableInterface
{
	GENERATED_BODY()

public:
	AAincendraNPC();
	virtual void Tick(float DeltaSeconds) override;

	virtual FInteractionInfo GetInteractionInfo_Implementation() const override;
	virtual void OnInteract_Implementation(AActor* Interactor) override;

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "NPC|Awareness")
	TObjectPtr<USphereComponent> AwarenessSphere;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC|Behavior")
	ENPCBehaviorState BehaviorState = ENPCBehaviorState::Idle;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC|Behavior")
	float PatrolSpeed = 160.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC|Behavior")
	float WaypointWaitTime = 1.5f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC|Behavior")
	TArray<FVector> PatrolWaypoints;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC|Dialogue")
	FText DisplayRole = NSLOCTEXT("Aincendra", "DefaultNPCRole", "Citizen of Elarion");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "NPC|Dialogue")
	TArray<FText> DialogueLines;

	UFUNCTION(BlueprintImplementableEvent, Category = "NPC|Dialogue")
	void BP_OnSpokenTo(AActor* Interactor, const FInteractionInfo& Info);

private:
	TWeakObjectPtr<AActor> NearbyPlayer;
	FRotator HomeRotation = FRotator::ZeroRotator;
	int32 CurrentWaypointIndex = 0;
	float WaitTimer = 0.0f;

	UFUNCTION()
	void OnAwarenessBeginOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult);

	UFUNCTION()
	void OnAwarenessEndOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
		UPrimitiveComponent* OtherComp, int32 OtherBodyIndex);
};
