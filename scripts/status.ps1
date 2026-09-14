<#
  The session's own status line, for the studio dashboard.

  A game session calls this after each commit and again before it stops and reports, so the
  dashboard can answer the one question the site could not: what is this game's Claude
  session doing right now, and is it stopped waiting for Gideon. It writes one small file,
  build\session-status.json, which is gitignored like everything else under build\.

  It holds only what nothing else knows: the state, the prose, and the head and branch the
  session is sitting on. No version, no milestone counts, no gate result - the dashboard's
  agent\collect.ps1 already derives all three from the repo and PLAN.md, and one source per
  fact is INDEX.md rule 10. A second copy here would go stale the moment a commit landed.

  Two sessions in one game repo is last writer wins, deliberately. There is no lock: the
  utc and head fields are what make the overwrite visible to a reader rather than silent.

  It never throws and always exits 0. It is called from inside a build loop, and a status
  line that can break a commit is worse than no status line at all.

    scripts\status.ps1 -Doing "wiring the drill" -Next "the ore readout"
    scripts\status.ps1 -State waiting -Doing "phase 2 done" -Next "which ending to build"
    scripts\status.ps1 -State blocked -Blocked "the phone is held by gravewell"
    scripts\status.ps1 -Show
#>
[CmdletBinding()]
param(
  # working: building right now. waiting: stopped, and Gideon is the next move.
  # blocked: stopped, and something other than Gideon is in the way. idle: nothing running.
  #
  # Deliberately NOT a [ValidateSet]. A set rejects the argument during parameter binding,
  # which is before the first line of the body and outside the try below, so a typed state
  # would be the one way this script could still fail a caller. The body checks the word
  # instead, says so, and falls back to working.
  [string] $State = 'working',
  [string] $Doing = '',
  [string] $Next = '',
  [string] $Blocked = '',
  [switch] $Show,
  [switch] $Quiet
)

# Everything below is inside one try, and every path out of it is exit 0. This runs in the
# middle of a build loop: a status write that can fail a commit is worse than no status
# write at all, so a missing git, an unwritable build\ and a locked file are all quiet.
try {
  $ErrorActionPreference = 'Stop'

  $known = @('working', 'waiting', 'blocked', 'idle')
  if ($known -notcontains $State) {
    if (-not $Quiet) { Write-Output "status: '$State' is not one of $($known -join ', '); writing working instead" }
    $State = 'working'
  }

  $here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path $MyInvocation.MyCommand.Path -Parent }
  $repo = Split-Path $here -Parent
  $repoFull = [System.IO.Path]::GetFullPath($repo)
  $buildDir = Join-Path $repoFull 'build'
  $target = [System.IO.Path]::GetFullPath((Join-Path $buildDir 'session-status.json'))

  # Refuse to write outside the repo this script was run from. The path is built from
  # $PSScriptRoot and takes nothing from a parameter, so this cannot fire today; it is here
  # so that a later edit which does take a path has something already saying no.
  $prefix = $repoFull.TrimEnd('\') + '\'
  if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    if (-not $Quiet) { Write-Output "status: refusing to write outside $repoFull" }
    exit 0
  }

  if ($Show) {
    if (Test-Path -LiteralPath $target) {
      Write-Output ([System.IO.File]::ReadAllText($target))
    } else {
      Write-Output "status: no session-status.json in $buildDir"
    }
    exit 0
  }

  # git is asked, never trusted: a repo with no commits yet, or no git at all, leaves these
  # empty rather than aborting the write. 2>$null plus the empty-string fallback, the same
  # shape as scripts\stamp.ps1.
  $branch = ''
  $head = ''
  try { $branch = (& git -C $repoFull rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim() } catch { }
  try { $head = (& git -C $repoFull rev-parse --short=7 HEAD 2>$null | Out-String).Trim() } catch { }

  $record = [ordered]@{
    slug    = Split-Path $repoFull -Leaf
    utc     = [datetimeoffset]::UtcNow.ToString('o')
    state   = $State
    doing   = $Doing
    next    = $Next
    blocked = $Blocked
    branch  = $branch
    head    = $head
  }

  New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

  # Atomic: a whole temp file, then one Move-Item -Force. The dashboard's collector reads
  # this file on a two-minute timer, so a reader must never see half of it.
  $json = ($record | ConvertTo-Json -Depth 3)
  $tmp = $target + '.tmp'
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($tmp, $json, $utf8)
  Move-Item -LiteralPath $tmp -Destination $target -Force

  if (-not $Quiet) {
    $bits = @($State)
    if ($Doing) { $bits += $Doing }
    if ($Next) { $bits += "next: $Next" }
    if ($Blocked) { $bits += "blocked: $Blocked" }
    Write-Output ("status: " + ($bits -join ' | '))
  }
} catch {
  if (-not $Quiet) { Write-Output "status: not written ($($_.Exception.Message))" }
}

exit 0
