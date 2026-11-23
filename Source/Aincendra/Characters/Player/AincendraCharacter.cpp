#include "Characters/Player/AincendraCharacter.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "EnhancedInputComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Interaction/AincendraInteractableInterface.h"

AAincendraCharacter::AAincendraCharacter()
{
	PrimaryActorTick.bCanEverTick = true;

	GetCapsuleComponent()->InitCapsuleSize(36.0f, 91.0f);

	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;

	JumpMaxHoldTime = 0.16f;

	UCharacterMovementComponent* MoveComp = GetCharacterMovement();
	MoveComp->bOrientRotationToMovement = true;
	MoveComp->RotationRate = FRotator(0.0f, 760.0f, 0.0f);
	MoveComp->JumpZVelocity = 640.0f;
	MoveComp->AirControl = 0.40f;
	MoveComp->GravityScale = 1.65f;
	MoveComp->MaxWalkSpeed = WalkSpeed;
	MoveComp->MaxWalkSpeedCrouched = CrouchSpeed;
	MoveComp->MaxAcceleration = BaseAcceleration;
	MoveComp->BrakingDecelerationWalking = 2600.0f;
	MoveComp->BrakingDecelerationFalling = 450.0f;
	MoveComp->GroundFriction = 8.0f;
	MoveComp->bUseSeparateBrakingFriction = true;
	MoveComp->BrakingFriction = 6.0f;
	MoveComp->MaxStepHeight = 36.0f;
	MoveComp->GetNavAgentPropertiesRef().bCanCrouch = true;
	MoveComp->SetCrouchedHalfHeight(58.0f);

	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(RootComponent);
	CameraBoom->TargetArmLength = ThirdPersonArmLength;
	CameraBoom->SocketOffset = FVector(0.0f, 42.0f, 58.0f);
	CameraBoom->bUsePawnControlRotation = true;
	CameraBoom->bDoCollisionTest = true;
	CameraBoom->ProbeSize = 20.0f;
	CameraBoom->bEnableCameraLag = true;
	CameraBoom->CameraLagSpeed = 16.0f;
	CameraBoom->CameraLagMaxDistance = 45.0f;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;
	FollowCamera->FieldOfView = BaseFieldOfView;
}

void AAincendraCharacter::BeginPlay()
{
	Super::BeginPlay();
	UpdateMovementTuning();
}

void AAincendraCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// Smoothly blend FOV between Walk, Sprint, and Crouch states
	if (FollowCamera)
	{
		const float TargetFov = bIsCrouched ? CrouchFieldOfView
			: (bIsSprinting && GetVelocity().Size2D() > WalkSpeed * 0.85f) ? SprintFieldOfView
			: BaseFieldOfView;

		FollowCamera->FieldOfView = FMath::FInterpTo(FollowCamera->FieldOfView, TargetFov, DeltaSeconds, 9.0f);
	}
}

void AAincendraCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	if (UEnhancedInputComponent* EnhancedInput = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		if (MoveAction)
		{
			EnhancedInput->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AAincendraCharacter::Move);
			EnhancedInput->BindAction(MoveAction, ETriggerEvent::Completed, this, &AAincendraCharacter::StopMove);
		}
		if (LookAction)
		{
			EnhancedInput->BindAction(LookAction, ETriggerEvent::Triggered, this, &AAincendraCharacter::Look);
		}
		if (JumpAction)
		{
			EnhancedInput->BindAction(JumpAction, ETriggerEvent::Started, this, &ACharacter::Jump);
			EnhancedInput->BindAction(JumpAction, ETriggerEvent::Completed, this, &ACharacter::StopJumping);
		}
		if (SprintAction)
		{
			EnhancedInput->BindAction(SprintAction, ETriggerEvent::Started, this, &AAincendraCharacter::StartSprint);
			EnhancedInput->BindAction(SprintAction, ETriggerEvent::Completed, this, &AAincendraCharacter::StopSprint);
		}
		if (CrouchAction)
		{
			EnhancedInput->BindAction(CrouchAction, ETriggerEvent::Started, this, &AAincendraCharacter::StartCrouch);
			EnhancedInput->BindAction(CrouchAction, ETriggerEvent::Completed, this, &AAincendraCharacter::StopCrouch);
		}
		if (InteractAction)
		{
			EnhancedInput->BindAction(InteractAction, ETriggerEvent::Started, this, &AAincendraCharacter::TryInteract);
		}
	}
}

void AAincendraCharacter::Move(const FInputActionValue& Value)
{
	const FVector2D MovementVector = Value.Get<FVector2D>().GetSafeNormal();
	LastMoveInput = MovementVector;

	if (!Controller || MovementVector.IsNearlyZero())
	{
		return;
	}

	const FRotator ControlRotation = Controller->GetControlRotation();
	const FRotator YawRotation(0.0f, ControlRotation.Yaw, 0.0f);

	const FVector ForwardDirection = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
	const FVector RightDirection = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);
	const FVector WishDir = (ForwardDirection * MovementVector.Y + RightDirection * MovementVector.X).GetSafeNormal();

	// Boost acceleration when pivoting sharply against current velocity
	if (UCharacterMovementComponent* MoveComp = GetCharacterMovement())
	{
		const FVector Vel2D(MoveComp->Velocity.X, MoveComp->Velocity.Y, 0.0f);
		if (MoveComp->IsMovingOnGround() && Vel2D.SizeSquared() > 2500.0f)
		{
			const float Dot = FVector::DotProduct(Vel2D.GetSafeNormal(), WishDir);
			const float PivotScale = Dot < 0.25f
				? FMath::Lerp(1.0f, PivotAccelerationMultiplier, FMath::Clamp((0.25f - Dot) / 1.25f, 0.0f, 1.0f))
				: 1.0f;
			MoveComp->MaxAcceleration = BaseAcceleration * PivotScale;
		}
		else
		{
			MoveComp->MaxAcceleration = BaseAcceleration;
		}
	}

	AddMovementInput(ForwardDirection, MovementVector.Y);
	AddMovementInput(RightDirection, MovementVector.X);
}

void AAincendraCharacter::StopMove(const FInputActionValue& Value)
{
	LastMoveInput = FVector2D::ZeroVector;
	if (UCharacterMovementComponent* MoveComp = GetCharacterMovement())
	{
		MoveComp->MaxAcceleration = BaseAcceleration;
	}
}

void AAincendraCharacter::Look(const FInputActionValue& Value)
{
	const FVector2D LookAxisVector = Value.Get<FVector2D>();
	if (Controller)
	{
		AddControllerYawInput(LookAxisVector.X);
		AddControllerPitchInput(LookAxisVector.Y);
	}
}

void AAincendraCharacter::StartSprint()
{
	bWantsSprint = true;
	if (bIsCrouched)
	{
		UnCrouch();
	}
	if (!bIsCrouched)
	{
		bIsSprinting = true;
		UpdateMovementTuning();
	}
}

void AAincendraCharacter::StopSprint()
{
	bWantsSprint = false;
	bIsSprinting = false;
	UpdateMovementTuning();
}

void AAincendraCharacter::StartCrouch()
{
	bIsSprinting = false;
	Crouch();
	UpdateMovementTuning();
}

void AAincendraCharacter::StopCrouch()
{
	UnCrouch();
	if (bWantsSprint && !bIsCrouched)
	{
		bIsSprinting = true;
	}
	UpdateMovementTuning();
}

void AAincendraCharacter::UpdateMovementTuning()
{
	if (UCharacterMovementComponent* MoveComp = GetCharacterMovement())
	{
		MoveComp->MaxWalkSpeed = bIsSprinting ? SprintSpeed : WalkSpeed;
		MoveComp->MaxWalkSpeedCrouched = CrouchSpeed;
	}
}

void AAincendraCharacter::Landed(const FHitResult& Hit)
{
	Super::Landed(Hit);

	// Damp extreme horizontal momentum slightly on heavy landings for grounded feel
	if (UCharacterMovementComponent* MoveComp = GetCharacterMovement())
	{
		if (MoveComp->Velocity.Z < -800.0f)
		{
			MoveComp->Velocity.X *= 0.85f;
			MoveComp->Velocity.Y *= 0.85f;
		}
	}

	if (bWantsSprint && !bIsCrouched)
	{
		bIsSprinting = true;
	}
	UpdateMovementTuning();
}

void AAincendraCharacter::TryInteract()
{
	if (!FollowCamera || !GetWorld())
	{
		return;
	}

	const FVector Start = GetActorLocation() + FVector(0.0f, 0.0f, 50.0f);
	const FVector Forward = FollowCamera->GetForwardVector();
	const FVector End = Start + Forward * InteractionReach;

	FCollisionQueryParams Params;
	Params.AddIgnoredActor(this);

	TArray<FHitResult> Hits;
	const bool bHit = GetWorld()->SweepMultiByChannel(
		Hits,
		Start,
		End,
		FQuat::Identity,
		ECC_Visibility,
		FCollisionShape::MakeSphere(65.0f),
		Params
	);

	if (!bHit)
	{
		return;
	}

	for (const FHitResult& Hit : Hits)
	{
		AActor* HitActor = Hit.GetActor();
		if (HitActor && HitActor->Implements<UAincendraInteractableInterface>())
		{
			const FInteractionInfo Info = IAincendraInteractableInterface::Execute_GetInteractionInfo(HitActor);
			IAincendraInteractableInterface::Execute_OnInteract(HitActor, this);
			BP_OnInteractTriggered(HitActor, Info);
			break;
		}
	}
}
