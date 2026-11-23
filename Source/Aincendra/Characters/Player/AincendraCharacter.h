#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "InputActionValue.h"
#include "Interaction/AincendraInteractableInterface.h"
#include "AincendraCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UInputAction;

UCLASS()
class AINCENDRA_API AAincendraCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AAincendraCharacter();
	virtual void Tick(float DeltaSeconds) override;

protected:
	virtual void BeginPlay() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void Landed(const FHitResult& Hit) override;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Camera")
	TObjectPtr<UCameraComponent> FollowCamera;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
	TObjectPtr<UInputAction> MoveAction;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
	TObjectPtr<UInputAction> LookAction;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
	TObjectPtr<UInputAction> JumpAction;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
	TObjectPtr<UInputAction> SprintAction;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
	TObjectPtr<UInputAction> CrouchAction;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category = "Input")
	TObjectPtr<UInputAction> InteractAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Interaction")
	float InteractionReach = 275.0f;

	UFUNCTION(BlueprintImplementableEvent, Category = "Interaction")
	void BP_OnInteractTriggered(AActor* TargetActor, const FInteractionInfo& Info);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement|Config")
	float WalkSpeed = 480.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement|Config")
	float SprintSpeed = 840.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement|Config")
	float CrouchSpeed = 250.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement|Polish")
	float BaseAcceleration = 2000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Movement|Polish")
	float PivotAccelerationMultiplier = 1.75f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Camera|Polish")
	float ThirdPersonArmLength = 420.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Camera|Polish")
	float BaseFieldOfView = 62.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Camera|Polish")
	float SprintFieldOfView = 68.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Camera|Polish")
	float CrouchFieldOfView = 59.0f;

private:
	bool bIsSprinting = false;
	bool bWantsSprint = false;
	FVector2D LastMoveInput = FVector2D::ZeroVector;

	void Move(const FInputActionValue& Value);
	void StopMove(const FInputActionValue& Value);
	void Look(const FInputActionValue& Value);
	void StartSprint();
	void StopSprint();
	void StartCrouch();
	void StopCrouch();
	void TryInteract();
	void UpdateMovementTuning();
};
