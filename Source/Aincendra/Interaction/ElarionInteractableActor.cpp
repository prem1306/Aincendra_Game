#include "Interaction/ElarionInteractableActor.h"
#include "Components/StaticMeshComponent.h"

AElarionInteractableActor::AElarionInteractableActor()
{
	PrimaryActorTick.bCanEverTick = false;

	MeshComponent = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("MeshComponent"));
	RootComponent = MeshComponent;
	MeshComponent->SetMobility(EComponentMobility::Static);
	MeshComponent->SetCollisionProfileName(TEXT("BlockAll"));
}

FInteractionInfo AElarionInteractableActor::GetInteractionInfo_Implementation() const
{
	return InteractionData;
}

void AElarionInteractableActor::OnInteract_Implementation(AActor* Interactor)
{
	BP_OnInspected(Interactor, InteractionData);
}
