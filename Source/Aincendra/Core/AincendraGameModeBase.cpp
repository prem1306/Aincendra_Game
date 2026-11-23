#include "Core/AincendraGameModeBase.h"
#include "Characters/Player/AincendraCharacter.h"
#include "Characters/Player/AincendraPlayerController.h"

AAincendraGameModeBase::AAincendraGameModeBase()
{
	DefaultPawnClass = AAincendraCharacter::StaticClass();
	PlayerControllerClass = AAincendraPlayerController::StaticClass();
}
