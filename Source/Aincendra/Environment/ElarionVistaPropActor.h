#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ElarionVistaPropActor.generated.h"

class UStaticMeshComponent;

UENUM(BlueprintType)
enum class EVistaMotionMode : uint8
{
	None			UMETA(DisplayName = "None"),
	LinearLoop		UMETA(DisplayName = "Linear Patrol Loop (Ships / Train)"),
	CraneSlew		UMETA(DisplayName = "Crane Slew Oscillation"),
	ContinuousSpin	UMETA(DisplayName = "Continuous Rotation (Flywheel)")
};

/**
 * Lightweight UE5 Actor for distant Harbour & Industrial Vista animations
 * (ships, freight trains, cranes, flywheels) running at 30 Hz without physics simulation.
 */
UCLASS()
class AINCENDRA_API AElarionVistaPropActor : public AActor
{
	GENERATED_BODY()

public:
	AElarionVistaPropActor();
	virtual void Tick(float DeltaSeconds) override;

protected:
	virtual void BeginPlay() override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Vista")
	TObjectPtr<UStaticMeshComponent> MeshComponent;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vista|Motion")
	EVistaMotionMode MotionMode = EVistaMotionMode::None;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vista|Motion")
	FVector TravelDirection = FVector(1.0f, 0.0f, 0.0f);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vista|Motion")
	float Speed = 300.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vista|Motion")
	float LoopDistance = 24000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Vista|Motion")
	float OscillationDegrees = 18.0f;

private:
	FVector StartLocation = FVector::ZeroVector;
	FRotator StartRotation = FRotator::ZeroRotator;
	float ElapsedTime = 0.0f;
};
