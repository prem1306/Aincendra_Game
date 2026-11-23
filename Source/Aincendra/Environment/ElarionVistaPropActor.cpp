#include "Environment/ElarionVistaPropActor.h"
#include "Components/StaticMeshComponent.h"

AElarionVistaPropActor::AElarionVistaPropActor()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickInterval = 0.033f; // 30 Hz vista motion for Intel Iris Xe budget

	MeshComponent = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("MeshComponent"));
	RootComponent = MeshComponent;

	// Distant vista props never require collision or dynamic shadow maps
	MeshComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	MeshComponent->SetCastShadow(false);
}

void AElarionVistaPropActor::BeginPlay()
{
	Super::BeginPlay();
	StartLocation = GetActorLocation();
	StartRotation = GetActorRotation();
}

void AElarionVistaPropActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	ElapsedTime += DeltaSeconds;

	switch (MotionMode)
	{
	case EVistaMotionMode::LinearLoop:
	{
		const FVector Dir = TravelDirection.GetSafeNormal();
		const float Dist = FMath::Fmod(ElapsedTime * Speed, FMath::Max(100.0f, LoopDistance));
		SetActorLocation(StartLocation + Dir * Dist);
		break;
	}
	case EVistaMotionMode::CraneSlew:
	{
		const float YawDelta = FMath::Sin(ElapsedTime * (Speed * 0.01f)) * OscillationDegrees;
		SetActorRotation(StartRotation + FRotator(0.0f, YawDelta, 0.0f));
		break;
	}
	case EVistaMotionMode::ContinuousSpin:
	{
		AddActorLocalRotation(FRotator(0.0f, 0.0f, Speed * DeltaSeconds));
		break;
	}
	default:
		break;
	}
}
