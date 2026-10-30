param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

try {
  $dialog = New-Object -ComObject WIA.CommonDialog
  $image = $dialog.ShowAcquireImage(
    1,
    0,
    0,
    "{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}",
    $true,
    $true,
    $false
  )

  if ($null -eq $image) {
    exit 2
  }

  $image.SaveFile($OutputPath)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
