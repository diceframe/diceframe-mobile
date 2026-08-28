[CmdletBinding()]
param(
    [string]$KeystorePath = "$env:USERPROFILE\.android\diceframe-upload.jks",
    [string]$KeyAlias = "diceframe-upload"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $KeystorePath -PathType Leaf)) {
    throw "Keystore not found: $KeystorePath"
}

$securePassword = Read-Host "Enter the DiceFrame upload keystore password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ([string]::IsNullOrWhiteSpace($plainPassword)) {
        throw "The keystore password cannot be empty."
    }

    $keytool = (Get-Command keytool.exe -ErrorAction Stop).Source
    $env:DICEFRAME_TEMP_KEYSTORE_PASSWORD = $plainPassword
    try {
        & $keytool -list -keystore $KeystorePath -alias $KeyAlias -storepass:env DICEFRAME_TEMP_KEYSTORE_PASSWORD | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "The keystore password or key alias is invalid."
        }
    } finally {
        Remove-Item Env:DICEFRAME_TEMP_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    }

    $gradleDirectory = Join-Path $env:USERPROFILE ".gradle"
    $gradlePropertiesPath = Join-Path $gradleDirectory "gradle.properties"
    New-Item -ItemType Directory -Force -Path $gradleDirectory | Out-Null

    $properties = [ordered]@{
        DICEFRAME_UPLOAD_STORE_FILE = $KeystorePath.Replace("\", "/")
        DICEFRAME_UPLOAD_STORE_PASSWORD = $plainPassword
        DICEFRAME_UPLOAD_KEY_ALIAS = $KeyAlias
        DICEFRAME_UPLOAD_KEY_PASSWORD = $plainPassword
    }

    # Do not assign an empty List through the PowerShell pipeline: an empty
    # collection is unrolled to $null in Windows PowerShell 5.1.
    $lines = New-Object 'Collections.Generic.List[string]'
    if (Test-Path -LiteralPath $gradlePropertiesPath) {
        foreach ($line in Get-Content -LiteralPath $gradlePropertiesPath) {
            $lines.Add($line)
        }
    }

    foreach ($property in $properties.GetEnumerator()) {
        $prefix = "$($property.Key)="
        for ($index = $lines.Count - 1; $index -ge 0; $index--) {
            if ($lines[$index].StartsWith($prefix, [StringComparison]::Ordinal)) {
                $lines.RemoveAt($index)
            }
        }
        $lines.Add("$prefix$($property.Value)")
    }

    # Windows PowerShell 5.1's `-Encoding utf8` writes a BOM. Gradle treats
    # that BOM as part of the first property name, so write UTF-8 explicitly.
    $utf8WithoutBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllLines($gradlePropertiesPath, $lines, $utf8WithoutBom)

    # Remove inherited access and allow only this user, SYSTEM, and Administrators.
    & icacls.exe $KeystorePath /inheritance:r /grant:r "${env:USERNAME}:(F)" "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not secure the keystore permissions."
    }

    & icacls.exe $gradlePropertiesPath /inheritance:r /grant:r "${env:USERNAME}:(F)" "*S-1-5-18:(F)" "*S-1-5-32-544:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not secure the Gradle properties permissions."
    }

    Write-Host "Android release signing configured in $gradlePropertiesPath"
    Write-Host "No signing credentials were written to the repository."
} finally {
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    $plainPassword = $null
    $securePassword = $null
}
