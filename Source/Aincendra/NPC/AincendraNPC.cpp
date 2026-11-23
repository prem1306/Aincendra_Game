#include "NPC/AincendraNPC.h"
#include "Components/CapsuleComponent.h"
#include "Components/SphereComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"

AAincendraNPC::AAincendraNPC()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.033f; // 30 Hz ambient update for Iris Xe CPU budget

	GetCapsuleComponent()->InitCapsuleSize(34.0f, 88.0f);
	bUseControllerRotationYaw = false;

	UCharacterMovementComponent* MoveComp = GetCharacterMovement();
	MoveComp->bOrientRotationToMovement = true;
	MoveComp->RotationRate = FRotator(0.0f, 360.0f, 0.0f);
	MoveComp->MaxWalkSpeed = PatrolSpeed;

	AwarenessSphere = CreateDefaultSubobject<USphereComponent>(TEXT("AwarenessSphere"));
	AwarenessSphere->SetupAttachment(RootComponent);
	AwarenessSphere->SetSphereRadius(280.0f);
	AwarenessSphere->SetCollisionProfileName(TEXT("Trigger"));
}

void AAincendraNPC::BeginPlay()
{
	Super::BeginPlay();

	HomeRotation = GetActorRotation();
	if (UCharacterMovementComponent* MoveComp = GetCharacterMovement())
	{
		MoveComp->MaxWalkSpeed = PatrolSpeed;
	}

	AwarenessSphere->OnComponentBeginOverlap.AddDynamic(this, &AAincendraNPC::OnAwarenessBeginOverlap);
	AwarenessSphere->OnComponentEndOverlap.AddDynamic(this, &AAincendraNPC::OnAwarenessEndOverlap);
}

void AAincendraNPC::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// React gently when the player stands near
	if (NearbyPlayer.IsValid())
	{
		const FVector ToPlayer = NearbyPlayer->GetActorLocation() - GetActorLocation();
		const float DistSq = ToPlayer.SizeSquared2D();

		if (BehaviorState != ENPCBehaviorState::Patrol || DistSq < 150.0f * 150.0f)
		{
			const FRotator TargetYaw(0.0f, ToPlayer.Rotation().Yaw, 0.0f);
			SetActorRotation(FMath::RInterpTo(GetActorRotation(), TargetYaw, DeltaSeconds, 5.0f));
			return;
		}
	}

	if (BehaviorState == ENPCBehaviorState::Patrol && PatrolWaypoints.Num() > 1)
	{
		if (WaitTimer > 0.0f)
		{
			WaitTimer -= DeltaSeconds;
			return;
		}

		const FVector Target = PatrolWaypoints[CurrentWaypointIndex];
		FVector ToTarget = Target - GetActorLocation();
		ToTarget.Z = 0.0f;

		if (ToTarget.SizeSquared() < 40.0f * 40.0f)
		{
			CurrentWaypointIndex = (CurrentWaypointIndex + 1) % PatrolWaypoints.Num();
			WaitTimer = WaypointWaitTime;
		}
		else
		{
			AddMovementInput(ToTarget.GetSafeNormal(), 1.0f);
		}
	}
	else
	{
		SetActorRotation(FMath::RInterpTo(GetActorRotation(), HomeRotation, DeltaSeconds, 3.5f));
	}
}

void AAincendraNPC::OnAwarenessBeginOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex, bool bFromSweep, const FHitResult& SweepResult)
{
	if (APawn* Pawn = Cast<APawn>(OtherActor))
	{
		if (Pawn->IsPlayerControlled())
		{
			NearbyPlayer = OtherActor;
		}
	}
}

void AAincendraNPC::OnAwarenessEndOverlap(UPrimitiveComponent* OverlappedComp, AActor* OtherActor,
	UPrimitiveComponent* OtherComp, int32 OtherBodyIndex)
{
	if (OtherActor == NearbyPlayer.Get())
	{
		NearbyPlayer = nullptr;
	}
}

FInteractionInfo AAincendraNPC::GetInteractionInfo_Implementation() const
{
	FInteractionInfo Info;
	Info.PromptAction = NSLOCTEXT("Aincendra", "SpeakAction", "Speak");
	Info.Title = DisplayRole;
	Info.Subtitle = BehaviorState == ENPCBehaviorState::Patrol
		? NSLOCTEXT("Aincendra", "PatrolSubtitle", "Patrolling Elarion")
		: NSLOCTEXT("Aincendra", "StationarySubtitle", "At post");
	Info.Lines = DialogueLines;
	return Info;
}

void AAincendraNPC::OnInteract_Implementation(AActor* Interactor)
{
	if (Interactor)
	{
		const FVector ToInteractor = Interactor->GetActorLocation() - GetActorLocation();
		SetActorRotation(FRotator(0.0f, ToInteractor.Rotation().Yaw, 0.0f));
	}
	BP_OnSpokenTo(Interactor, GetInteractionInfo_Implementation());
}
